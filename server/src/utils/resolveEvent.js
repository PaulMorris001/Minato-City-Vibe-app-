import mongoose from "mongoose";
import Event from "../models/event.model.js";

/**
 * Resolve an event param that may be an `_id`, a shareToken, or a human-readable
 * slug — the same chain `GET /events/:eventId` walks.
 *
 * Share links are slug-shaped (`/event/lagos-beach-party`), and the website
 * carries that param straight through to checkout, so every event-scoped
 * endpoint the Pay page calls can receive a slug where it used to get an
 * ObjectId. Passing that into a query either cast-errors into a 500 or (behind
 * an `isValidObjectId` guard) answers a bogus "Event not found".
 *
 * Returns null when nothing matches, letting callers answer 404 themselves.
 *
 * @param {string} param           raw param (`_id`, shareToken, or slug)
 * @param {string} [populatePath]  optional path to populate on the match
 * @returns {Promise<import("mongoose").Document|null>} the event doc, or null
 */
export async function findEventByAnyId(param, populatePath) {
  if (!param) return null;
  const raw = String(param);
  const run = (query) => (populatePath ? query.populate(populatePath) : query);

  // An ObjectId-shaped param is taken at face value — id-based callers (mobile)
  // keep their single-query cost.
  let event = mongoose.isValidObjectId(raw) ? await run(Event.findById(raw)) : null;
  if (!event) event = await run(Event.findOne({ shareToken: raw }));
  if (!event) event = await run(Event.findOne({ slug: raw.toLowerCase() }));
  return event;
}
