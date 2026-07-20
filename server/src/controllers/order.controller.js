import { Order } from "../models/order.model.js";
import { Service } from "../models/service.model.js";
import { Vendor } from "../models/vendor.model.js";
import User from "../models/user.model.js";
import Chat from "../models/chat.model.js";
import chatService from "../services/chat.service.js";
import { currencyForUser } from "../services/payments/resolveProvider.js";

/** Recompute server-authoritative totals from the item snapshots + vendor fees. */
function computeTotals(order) {
  const itemsSubtotal = order.items.reduce(
    (sum, it) => sum + (it.priceSnapshot?.amount || 0) * (it.quantity || 1),
    0
  );
  const feesTotal = (order.additionalFees || []).reduce(
    (sum, f) => sum + (f.amount || 0),
    0
  );
  order.itemsSubtotal = round2(itemsSubtotal);
  order.total = round2(itemsSubtotal + feesTotal);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const ITEM_POPULATE = { path: "items.service", select: "name images price currency section" };

async function populateOrder(order) {
  return order.populate([
    ITEM_POPULATE,
    { path: "vendor", select: "username businessName businessPicture profilePicture" },
    { path: "client", select: "username profilePicture" },
  ]);
}

/**
 * POST /orders
 * Client checks out a cart against a single vendor. Prices are re-derived
 * server-side from the live Service docs (never trusted from the client), an
 * Order(status:"requested") is created, and an order card is posted into the
 * vendor chat (creating it if needed, bypassing the mutual-follow gate).
 */
export async function createOrder(req, res) {
  try {
    const { vendorId, items } = req.body;
    const clientId = req.user.id;

    if (!vendorId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "vendorId and a non-empty items array are required" });
    }

    // vendorId may be a Vendor discovery doc _id or the vendor's User _id.
    const vendorDoc = await Vendor.findById(vendorId).select("user");
    const vendorUserId = (vendorDoc?.user || vendorId).toString();

    if (vendorUserId === clientId.toString()) {
      return res.status(400).json({ message: "You can't place an order with yourself" });
    }

    const vendor = await User.findById(vendorUserId);
    if (!vendor || !vendor.isVendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    const currency = currencyForUser(vendor);

    // Snapshot each requested item from its live, active Service doc.
    const orderItems = [];
    for (const raw of items) {
      const serviceId = raw?.serviceId;
      if (!serviceId) return res.status(400).json({ message: "Each item needs a serviceId" });

      const service = await Service.findOne({ _id: serviceId, vendor: vendorUserId, isActive: true });
      if (!service) {
        return res.status(404).json({ message: "One or more items are no longer available" });
      }

      const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1));
      orderItems.push({
        service: service._id,
        name: service.name,
        priceSnapshot: { amount: service.price, currency },
        quantity,
        note: typeof raw.note === "string" ? raw.note.slice(0, 500) : "",
      });
    }

    // Open (or reuse) the client↔vendor chat — commerce bypasses mutual-follow.
    const chat = await chatService.getOrCreateDirectChatForOrder(clientId, vendorUserId);

    const order = new Order({
      client: clientId,
      vendor: vendorUserId,
      chat: chat._id,
      items: orderItems,
      additionalFees: [],
      currency,
      status: "requested",
    });
    computeTotals(order);
    await order.save();

    // Post the order request card into the chat (sent as the client).
    const message = await chatService.sendMessage(chat._id, clientId, {
      type: "order",
      orderId: order._id,
    });
    order.requestMessage = message._id;
    await order.save();

    await populateOrder(order);
    res.status(201).json({ message: "Order sent to vendor", order, chatId: chat._id });
  } catch (error) {
    console.error("createOrder error:", error);
    res.status(500).json({ message: "Error creating order", details: error.message });
  }
}

/** GET /orders/client — the caller's own orders. */
export async function getClientOrders(req, res) {
  try {
    const orders = await Order.find({ client: req.user.id })
      .populate(ITEM_POPULATE)
      .populate("vendor", "username businessName businessPicture profilePicture")
      .sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching orders", details: error.message });
  }
}

/** GET /orders/vendor?status= — orders placed with the caller (a vendor). */
export async function getVendorOrders(req, res) {
  try {
    const filter = { vendor: req.user.id };
    if (req.query.status) filter.status = req.query.status;
    const orders = await Order.find(filter)
      .populate(ITEM_POPULATE)
      .populate("client", "username profilePicture")
      .sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching orders", details: error.message });
  }
}

/** GET /orders/:id — visible to the order's client or vendor. */
export async function getOrder(req, res) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const uid = req.user.id.toString();
    if (order.client.toString() !== uid && order.vendor.toString() !== uid) {
      return res.status(403).json({ message: "You don't have access to this order" });
    }

    await populateOrder(order);
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: "Error fetching order", details: error.message });
  }
}

/**
 * PATCH /orders/:id/quote  (vendor only)
 * Vendor adds any extra fees and sends the payable invoice. Recomputes the
 * total, flips the order to "quoted", and posts an invoice card into the chat.
 */
export async function quoteOrder(req, res) {
  try {
    const order = await Order.findOne({ _id: req.params.id, vendor: req.user.id });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status !== "requested") {
      return res.status(400).json({ message: `Cannot quote an order that is already ${order.status}` });
    }

    // Sanitize fees — keep only well-formed {label, amount>=0} entries.
    const rawFees = Array.isArray(req.body?.additionalFees) ? req.body.additionalFees : [];
    const fees = rawFees
      .map((f) => ({ label: String(f?.label || "").trim(), amount: Number(f?.amount) }))
      .filter((f) => f.label && Number.isFinite(f.amount) && f.amount >= 0);

    order.additionalFees = fees;
    order.status = "quoted";
    computeTotals(order);
    await order.save();

    // Post the payable invoice card (sent as the vendor).
    const message = await chatService.sendMessage(order.chat, req.user.id, {
      type: "order",
      orderId: order._id,
    });
    order.invoiceMessage = message._id;
    await order.save();

    await populateOrder(order);
    res.status(200).json({ message: "Invoice sent", order });
  } catch (error) {
    console.error("quoteOrder error:", error);
    res.status(500).json({ message: "Error sending invoice", details: error.message });
  }
}

/** PATCH /orders/:id/decline  (vendor only) */
export async function declineOrder(req, res) {
  try {
    const order = await Order.findOne({ _id: req.params.id, vendor: req.user.id });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!["requested", "quoted"].includes(order.status)) {
      return res.status(400).json({ message: "This order can no longer be declined" });
    }

    order.status = "declined";
    await order.save();
    await postOrderSystemMessage(order.chat, req.user.id, "Vendor declined this order");

    await populateOrder(order);
    res.status(200).json({ message: "Order declined", order });
  } catch (error) {
    res.status(500).json({ message: "Error declining order", details: error.message });
  }
}

/** PATCH /orders/:id/cancel  (client only) */
export async function cancelOrder(req, res) {
  try {
    const order = await Order.findOne({ _id: req.params.id, client: req.user.id });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!["requested", "quoted"].includes(order.status)) {
      return res.status(400).json({ message: "This order can no longer be cancelled" });
    }

    order.status = "cancelled";
    await order.save();
    await postOrderSystemMessage(order.chat, req.user.id, "Client cancelled this order");

    await populateOrder(order);
    res.status(200).json({ message: "Order cancelled", order });
  } catch (error) {
    res.status(500).json({ message: "Error cancelling order", details: error.message });
  }
}

/** Post a centered system line into the order's chat (best-effort). */
async function postOrderSystemMessage(chatId, actorId, content) {
  if (!chatId) return;
  try {
    const chat = await Chat.findById(chatId);
    if (chat) await chatService.postSystemMessage(chat, actorId, content);
  } catch (e) {
    console.error("postOrderSystemMessage failed:", e);
  }
}
