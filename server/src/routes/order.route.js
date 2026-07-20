import express from "express";
import {
  createOrder,
  getClientOrders,
  getVendorOrders,
  getOrder,
  quoteOrder,
  declineOrder,
  cancelOrder,
} from "../controllers/order.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Auth is applied per-route (see booking.route.js) so requests destined for
// other routers mounted at "/api/" aren't 401'd on the way through.
router.post("/orders", authenticate, createOrder);
router.get("/orders/client", authenticate, getClientOrders);
router.get("/orders/vendor", authenticate, getVendorOrders);
router.get("/orders/:id", authenticate, getOrder);
router.patch("/orders/:id/quote", authenticate, quoteOrder);
router.patch("/orders/:id/decline", authenticate, declineOrder);
router.patch("/orders/:id/cancel", authenticate, cancelOrder);

export default router;
