/**
 * Combined real-world guide dataset — one file per city, four guides each.
 * Every guide references real, long-established venues and experiences.
 *
 * Shape of each entry (see ../../models/guide.model.js):
 *   { title, description, topic, city, cityState, country,
 *     sections: [{ rank, title, description }] }
 *
 * city/cityState/country use the same English names the app's location picker
 * (Country-State-City API) produces, so seeded guides group together with
 * user-created ones in the browse-by-city list.
 */
import paris from "./paris.js";
import london from "./london.js";
import newYorkCity from "./new-york-city.js";
import lasVegas from "./las-vegas.js";
import miami from "./miami.js";
import losAngeles from "./los-angeles.js";
import newOrleans from "./new-orleans.js";
import mexicoCity from "./mexico-city.js";
import rioDeJaneiro from "./rio-de-janeiro.js";
import tokyo from "./tokyo.js";
import seoul from "./seoul.js";
import bangkok from "./bangkok.js";
import singapore from "./singapore.js";
import hongKong from "./hong-kong.js";
import sydney from "./sydney.js";
import dubai from "./dubai.js";
import marrakech from "./marrakech.js";
import amsterdam from "./amsterdam.js";
import berlin from "./berlin.js";
import prague from "./prague.js";
import vienna from "./vienna.js";
import rome from "./rome.js";
import barcelona from "./barcelona.js";
import lisbon from "./lisbon.js";
import istanbul from "./istanbul.js";

// Must stay in sync with guideTopics in src/models/guide.model.js
const VALID_TOPICS = new Set([
  "Chefs", "Food and Restaurants", "Music and Bands", "Bars and Clubs",
  "Casinos", "Concerts", "Events", "Transportation", "Venues", "Florists",
  "Decorations", "Desserts", "Beverages", "Grocery stores", "Museums",
  "Parks", "Hotels", "Spas", "Hair and Nail Salons", "Barber Shops",
]);

export const allGuides = [
  ...paris, ...london, ...newYorkCity, ...lasVegas, ...miami, ...losAngeles,
  ...newOrleans, ...mexicoCity, ...rioDeJaneiro, ...tokyo, ...seoul,
  ...bangkok, ...singapore, ...hongKong, ...sydney, ...dubai, ...marrakech,
  ...amsterdam, ...berlin, ...prague, ...vienna, ...rome, ...barcelona,
  ...lisbon, ...istanbul,
];

// Fail fast at import time so a typo never produces a half-seeded database.
for (const g of allGuides) {
  const where = `"${g.title}" (${g.city})`;
  if (!g.title || !g.description || !g.city || !g.cityState || !g.country) {
    throw new Error(`Guide missing required fields: ${where}`);
  }
  if (!VALID_TOPICS.has(g.topic)) {
    throw new Error(`Invalid topic "${g.topic}" in ${where}`);
  }
  if (!Array.isArray(g.sections) || g.sections.length < 1 || g.sections.length > 10) {
    throw new Error(`Guide must have 1-10 sections: ${where}`);
  }
  g.sections.forEach((s, i) => {
    if (!s.title || !s.rank || !s.description) {
      throw new Error(`Section ${i + 1} missing fields in ${where}`);
    }
    if (s.description.length > 3000) {
      throw new Error(`Section ${i + 1} over 3000 chars in ${where}`);
    }
  });
}
