import { getPeopleSuggestions } from "../services/peopleSuggestions.service.js";

/**
 * GET /people/suggestions?city=
 * Grouped "Discover people" rails for the signed-in user. Every rail excludes
 * self, accounts they already follow, and blocks in either direction.
 * `city` is optional and overrides the viewer's stored browsing city.
 */
export async function getSuggestions(req, res) {
  try {
    const { rails } = await getPeopleSuggestions(req.user.id, { city: req.query.city });
    return res.status(200).json({ rails });
  } catch (err) {
    console.error("getSuggestions:", err);
    return res.status(500).json({ message: "Failed to load people suggestions" });
  }
}
