import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { applyPriceVisibility, stopRequiresPayment } from '../utils/eventPricing.js';
import { validTicketAmount, offerPaymentError } from '../utils/ticketOffer.js';

// No database, mail, socket or payment-provider connection is used by these tests.
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/test-unused';
process.env.JWT_SECRET = 'test-only';
process.env.PORT = '3100';
process.env.STRIPE_SECRET_KEY = 'sk_test_unused';
const [{ default: Event }, { default: User }, { default: Ticket }, { default: TicketOffer },
  { default: TicketOrder }, { default: stripe }, { default: ChatService }, payments, offers] = await Promise.all([
  import('../models/event.model.js'), import('../models/user.model.js'), import('../models/ticket.model.js'),
  import('../models/ticketOffer.model.js'), import('../models/ticketOrder.model.js'), import('../config/stripe.js'),
  import('../services/chat.service.js'), import('../controllers/payments.controller.js'), import('../controllers/ticketOffer.controller.js'),
]);
afterEach(() => mock.restoreAll());
const eventId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const buyerId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const hostId = 'cccccccccccccccccccccccc';
const offerId = 'dddddddddddddddddddddddd';
const orderId = 'eeeeeeeeeeeeeeeeeeeeeeee';
const query = (value) => ({ select() { return this; }, populate() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
function fixture() {
  const seller = { _id: hostId, location: { country: 'United States' }, stripeAccountId: 'acct_test', stripeOnboardingComplete: true };
  const event = { _id: eventId, createdBy: seller, title: 'Dance night', date: new Date(Date.now() + 86400000), isActive: true, isPublic: true, isPaid: true, hidePrice: true, ticketPrice: 100, ticketTiers: [], maxGuests: 50, currency: 'USD', approvalStatus: 'approved', subEvents: [] };
  const offer = { _id: offerId, event: eventId, buyer: buyerId, organizer: hostId, chat: 'chat1', eventTitle: event.title, ticketName: event.title, quantity: 2, currency: 'USD', standardPrice: 100, offeredPrice: 60, finalPrice: 75, status: 'quoted' };
  mock.method(Event, 'findById', () => query(event));
  mock.method(Event, 'findOne', () => query(event));
  mock.method(TicketOffer, 'findById', () => query(offer));
  mock.method(TicketOrder, 'findOne', () => query(null));
  mock.method(Ticket, 'countDocuments', async () => 0);
  mock.method(User, 'findById', () => query({ _id: buyerId, email: 'buyer@example.com', username: 'buyer', blockedUsers: [] }));
  mock.method(User, 'find', () => query([]));
  return { event, offer };
}

test('hidden event and tier/stop prices are redacted without changing availability or free stops', () => {
  const event = { hidePrice: true, isPaid: true, ticketPrice: 100, soldOut: false, ticketTiers: [{ name: 'VIP', price: 200, soldOut: true }], pendingEdits: { ticketPrice: 80 }, subEvents: [{ ticketPrice: 0 }, { ticketPrice: 30, ticketTiers: [{ price: 30 }] }] };
  const result = applyPriceVisibility(event);
  assert.equal(result.ticketPrice, undefined);
  assert.equal(result.ticketTiers[0].price, undefined);
  assert.equal(result.ticketTiers[0].soldOut, true);
  assert.equal(result.subEvents[0].priceOnRequest, false);
  assert.equal(result.subEvents[1].priceOnRequest, true);
  assert.equal(result.subEvents[1].ticketTiers[0].price, undefined);
  assert.equal(result.pendingEdits, undefined);
});

test('organizers and ordinary fixed-price events retain prices', () => {
  for (const [hidePrice, organizer] of [[true, true], [false, false]]) {
    assert.equal(applyPriceVisibility({ hidePrice, ticketPrice: 42 }, organizer).ticketPrice, 42);
  }
});

test('amount validation rejects strings, non-finite, non-positive and sub-cent amounts', () => {
  for (const price of [0, -1, NaN, Infinity, '50', 10.001, null, 100000000]) assert.equal(validTicketAmount(price), false);
  for (const price of [0.01, 10.1, 99.99, 50000]) assert.equal(validTicketAmount(price), true);
});

test('only a finalized invoice for this event and buyer may be paid', () => {
  const offer = { event: eventId, buyer: buyerId, status: 'quoted', finalPrice: 75 };
  assert.equal(offerPaymentError(offer, eventId, buyerId), null);
  assert.ok(offerPaymentError(offer, hostId, buyerId));
  assert.ok(offerPaymentError(offer, eventId, hostId));
  for (const status of ['requested', 'declined', 'cancelled']) assert.ok(offerPaymentError({ ...offer, status }, eventId, buyerId));
});

test('checkout ignores buyer-supplied amount, recipient and quantity, snapshots the final invoice, and retries resume it', async () => {
  fixture();
  let saved;
  mock.method(TicketOrder, 'create', async (data) => (saved = { ...data, _id: orderId, async save() {} }));
  mock.method(TicketOrder, 'updateOne', async (_filter, update) => Object.assign(saved, update));
  const createPayment = mock.method(stripe.paymentIntents, 'create', async (data) => {
    assert.equal(data.amount, 15000);
    assert.equal(data.metadata.ticketOrderId, orderId);
    return { id: 'pi_test', client_secret: 'secret_test' };
  });
  const req = { params: { eventId: 'dance-night-slug' }, user: { id: buyerId }, body: { offerId, amount: 1, items: [{ recipientEmail: 'attacker@example.com', price: 1 }] } };
  const res = response();
  await payments.initTicketBatch(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.ticketOffer, offerId);
  assert.equal(saved.total, 150);
  assert.equal(saved.items.length, 2);
  assert.ok(saved.items.every((item) => item.price === 75 && item.recipientEmail === 'buyer@example.com'));
  TicketOrder.findOne.mock.mockImplementation(() => query(saved));
  const retry = response();
  await payments.initTicketBatch(req, retry);
  assert.deepEqual(retry.body, res.body);
  assert.equal(createPayment.mock.callCount(), 1);
});

test('hidden events reject ordinary batch checkout', async () => {
  fixture();
  const res = response();
  await payments.initTicketBatch({ params: { eventId }, user: { id: buyerId }, body: { items: [{ recipientEmail: 'buyer@example.com' }] } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'negotiation_required');
});

test('foreign buyers, requests awaiting approval and paid invoices cannot start payment', async () => {
  const { offer } = fixture();
  for (const [buyer, status] of [[hostId, 'quoted'], [buyerId, 'requested']]) {
    offer.status = status;
    const res = response();
    await payments.initTicketBatch({ params: { eventId }, user: { id: buyer }, body: { offerId } }, res);
    assert.equal(res.statusCode, 403);
  }
  offer.status = 'quoted';
  TicketOrder.findOne.mock.mockImplementation(() => query({ status: 'paid' }));
  const res = response();
  await payments.initTicketBatch({ params: { eventId }, user: { id: buyerId }, body: { offerId } }, res);
  assert.equal(res.statusCode, 409);
});

test('sold-out, cancelled and pending events reject invoice checkout before charging', async () => {
  const { event } = fixture();
  const req = { params: { eventId }, user: { id: buyerId }, body: { offerId } };
  for (const patch of [{ maxGuests: 1 }, { maxGuests: 50, cancelledAt: new Date() }, { cancelledAt: null, approvalStatus: 'pending' }]) {
    Object.assign(event, patch);
    const res = response();
    await payments.initTicketBatch(req, res);
    assert.ok(res.statusCode >= 400);
  }
});

test('an organizer can counter the request once; invoice role and status are checked atomically', async () => {
  const { event, offer } = fixture();
  event.createdBy = hostId;
  offer.status = 'requested';
  mock.method(TicketOffer, 'findOne', (filter) => query(filter.organizer === hostId ? offer : null));
  mock.method(TicketOffer, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(filter.status, 'requested');
    assert.equal(update.finalPrice, 80);
    return { ...offer, ...update };
  });
  const send = mock.method(ChatService, 'sendMessage', async (_chat, sender, data) => {
    assert.equal(sender, hostId);
    assert.equal(data.ticketOfferId, offerId);
  });
  const res = response();
  await offers.respondToTicketOffer({ params: { offerId }, user: { id: hostId }, body: { action: 'quote', finalPrice: 80 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.offer.status, 'quoted');
  assert.equal(send.mock.callCount(), 1);
  const denied = response();
  await offers.respondToTicketOffer({ params: { offerId }, user: { id: buyerId }, body: { action: 'quote', finalPrice: 1 } }, denied);
  assert.equal(denied.statusCode, 409);
});


test('requests respect blocks and invalid amounts without opening a chat', async () => {
  const { event } = fixture();
  event.createdBy = hostId;
  User.findById.mock.mockImplementation(() => query({ blockedUsers: [hostId] }));
  const send = mock.method(ChatService, 'getOrCreateDirectChat', async () => { throw new Error('Must not open chat'); });
  for (const offeredPrice of [0, 50]) {
    const res = response();
    await offers.createTicketOffer({ params: { eventId }, user: { id: buyerId }, body: { offeredPrice, quantity: 1 } }, res);
    assert.equal(res.statusCode, offeredPrice === 0 ? 400 : 404);
  }
  assert.equal(send.mock.callCount(), 0);
});

test('request cards preserve the proposed amount while taking standard price, selection and host from the event', async () => {
  const { event } = fixture();
  event.createdBy = hostId;
  mock.method(ChatService, 'getOrCreateDirectChat', async (buyer, host, opts) => {
    assert.equal(buyer, buyerId); assert.equal(host, hostId); assert.equal(opts.skipMutualCheck, true);
    return { _id: 'chat1' };
  });
  mock.method(TicketOffer, 'create', async (data) => ({ ...data, _id: offerId }));
  mock.method(ChatService, 'sendMessage', async (_chat, sender, data) => {
    assert.equal(sender, buyerId); assert.equal(data.type, 'ticket_offer'); assert.equal(data.ticketOfferId, offerId);
  });
  const res = response();
  await offers.createTicketOffer({ params: { eventId: 'event-slug' }, user: { id: buyerId }, body: { offeredPrice: 55, quantity: 2, organizer: buyerId, standardPrice: 1 } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.offer.organizer, hostId);
  assert.equal(res.body.offer.standardPrice, 100);
  assert.equal(res.body.offer.offeredPrice, 55);
});

test('zero-capacity programme stops are uncapped, and removed invoice tiers cannot silently become general admission', async () => {
  const { event, offer } = fixture();
  assert.equal(await payments.ticketsRemaining(event, null, { id: 'stop1', maxGuests: 0 }), Infinity);
  offer.tierId = 'ffffffffffffffffffffffff';
  const res = response();
  await payments.initTicketBatch({ params: { eventId }, user: { id: buyerId }, body: { offerId } }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /tier changed/);
});

test('a hidden-price event can sell with no asking price at all, and free programme stops still cannot', () => {
  const event = { isPaid: true, hidePrice: true, ticketPrice: 0, ticketTiers: [] };
  assert.equal(stopRequiresPayment(event, { id: null, ticketPrice: 0, ticketTiers: [] }), true);
  assert.equal(stopRequiresPayment(event, { id: 'stop1', ticketPrice: 0, ticketTiers: [] }), false);
  assert.equal(stopRequiresPayment(event, { id: 'stop1', ticketPrice: 30, ticketTiers: [] }), true);
  assert.equal(stopRequiresPayment(event, { id: 'stop1', ticketPrice: 0, ticketTiers: [{ price: 10 }] }), true);
  assert.equal(stopRequiresPayment({ isPaid: false }, { id: null, ticketPrice: 0, ticketTiers: [] }), false);
});

test('an event with no asking price is still negotiable, and its offer records no standard price', async () => {
  const { event } = fixture();
  event.createdBy = hostId;
  event.ticketPrice = 0;

  const listed = response();
  await offers.getNegotiationOptions({ params: { eventId }, user: { id: buyerId } }, listed);
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.body.event.stops.map((stop) => [stop.id, stop.ticketPrice]), [[null, 0]]);

  mock.method(ChatService, 'getOrCreateDirectChat', async () => ({ _id: 'chat1' }));
  mock.method(ChatService, 'sendMessage', async () => {});
  mock.method(TicketOffer, 'create', async (data) => ({ ...data, _id: offerId }));
  const res = response();
  await offers.createTicketOffer({ params: { eventId }, user: { id: buyerId }, body: { offeredPrice: 55, quantity: 1 } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.offer.standardPrice, 0);
  assert.equal(res.body.offer.offeredPrice, 55);
});
