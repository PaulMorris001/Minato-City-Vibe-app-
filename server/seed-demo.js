/**
 * Demo data seeder — populates the DB with realistic users, events, guides,
 * vendors, services, reviews and bookings so every screen looks full for
 * App Store / Play Store screenshots & feature graphics.
 *
 *   node seed-demo.js          # insert demo data (safe to re-run)
 *   node seed-demo.js --clean  # remove everything this script created
 *
 * All demo accounts share the email domain @demo.nightvibe.app and the
 * password DEMO_PASSWORD below, so cleanup is targeted and you can log in.
 *
 * Swap the image pools below for branded/Unsplash URLs anytime — the script
 * uses real photos (faces via randomuser.me, covers via picsum.photos) so it
 * works out of the box with zero setup.
 */
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

import User from "./src/models/user.model.js";
import Event from "./src/models/event.model.js";
import Guide from "./src/models/guide.model.js";
import { Service } from "./src/models/service.model.js";
import { Vendor, City, VendorType } from "./src/models/vendor.model.js";
import Review from "./src/models/review.model.js";
import Follow from "./src/models/follow.model.js";
import { Booking } from "./src/models/booking.model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const DEMO_DOMAIN = "demo.nightvibe.app";
const DEMO_PASSWORD = "Demo1234!";
const HERO_EMAIL = `hero@${DEMO_DOMAIN}`;

// ── Image pools (swap freely for branded imagery) ───────────────────────────
const face = (g, n) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`;
const cover = (seed) => `https://picsum.photos/seed/nv-${seed}/900/600`;

// ── People ───────────────────────────────────────────────────────────────────
const PEOPLE = [
  { name: "Emma Carter", g: "women", n: 44, bio: "Event lover. Always chasing the next rooftop sunset 🌇" },
  { name: "James Whitfield", g: "men", n: 32, bio: "Weekend DJ & full-time good-times organizer." },
  { name: "Olivia Brennan", g: "women", n: 68, bio: "Foodie, host, and serial brunch planner." },
  { name: "Liam Donovan", g: "men", n: 11, bio: "If there's live music, I'm there." },
  { name: "Sophie Hayes", g: "women", n: 21, bio: "Photographer capturing the city after dark." },
  { name: "Noah Sullivan", g: "men", n: 75, bio: "Bar crawls, trivia nights, repeat." },
  { name: "Ava Mitchell", g: "women", n: 90, bio: "Curating the best little spots in town." },
  { name: "Ethan Brooks", g: "men", n: 50, bio: "Concert hopper. Vinyl collector." },
  { name: "Chloe Bennett", g: "women", n: 12, bio: "Cocktails > everything." },
  { name: "Mason Reed", g: "men", n: 64, bio: "Throwing the parties you hear about Monday." },
  { name: "Grace Palmer", g: "women", n: 33, bio: "Spa days and sunset boat parties." },
  { name: "Lucas Hayward", g: "men", n: 19, bio: "Venue owner. Lover of a packed dance floor." },
];

// Hero = the account you log into for screenshots (consumer + vendor side).
const HERO = { name: "Alex Morgan", g: "women", n: 79, bio: "Building unforgettable nights in the city ✨ Vendor & host." };

// ── Vendor businesses (mapped to existing vendor types) ──────────────────────
const VENDOR_BIZ = [
  { biz: "Skyline Rooftop Lounge", type: "Bars and Clubs", desc: "Panoramic rooftop bar with craft cocktails and a sunset DJ set every Friday." },
  { biz: "The Velvet Room", type: "Venues", desc: "An intimate event venue for up to 200 guests, full bar and stage included." },
  { biz: "Maison Saveur", type: "Chefs", desc: "Private chef crafting multi-course tasting menus for your event." },
  { biz: "Pulse Live", type: "Music and Bands", desc: "High-energy live band & DJ collective for weddings and parties." },
  { biz: "Bloom & Co.", type: "Florists", desc: "Statement floral installations and event styling." },
  { biz: "Sweet Atelier", type: "Desserts", desc: "Bespoke dessert tables, cakes and late-night sweets." },
];

const GUIDE_TOPICS_POOL = [
  { topic: "Bars and Clubs", title: "Best Rooftop Bars in the City" },
  { topic: "Food and Restaurants", title: "Late-Night Eats That Hit Different" },
  { topic: "Music and Bands", title: "Where to Catch Live Music Any Night" },
  { topic: "Concerts", title: "Hidden Concert Venues You'll Love" },
  { topic: "Bars and Clubs", title: "The Ultimate Cocktail Crawl" },
  { topic: "Events", title: "Underground Events Worth the Hype" },
  { topic: "Desserts", title: "Sweetest Late-Night Dessert Spots" },
  { topic: "Venues", title: "Stunning Spaces to Throw a Party" },
];

const EVENT_TEMPLATES = [
  { title: "Rooftop Sunset Sessions", paid: true, price: 25 },
  { title: "Neon Nights — DJ Showcase", paid: true, price: 30 },
  { title: "Friday Jazz & Cocktails", paid: false, price: 0 },
  { title: "Summer Boat Party", paid: true, price: 45 },
  { title: "Indie Live: 3-Band Night", paid: true, price: 20 },
  { title: "Sunday Bottomless Brunch", paid: true, price: 35 },
  { title: "Warehouse Rave", paid: true, price: 28 },
  { title: "Open Mic & Chill", paid: false, price: 0 },
  { title: "New Year's Eve Gala", paid: true, price: 75 },
  { title: "Rooftop Yoga + Mimosas", paid: false, price: 0 },
  { title: "House Party — Members Only", paid: false, price: 0 },
  { title: "Comedy Night Downtown", paid: true, price: 18 },
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sample = (arr, k) => [...arr].sort(() => Math.random() - 0.5).slice(0, k);
const daysFromNow = (d) => new Date(Date.now() + d * 86400000);

async function clean() {
  const demoUsers = await User.find({ email: { $regex: `@${DEMO_DOMAIN}$` } }).select("_id");
  const ids = demoUsers.map((u) => u._id);
  if (ids.length === 0) {
    console.log("No demo data found.");
    return;
  }
  const vendorDocs = await Vendor.find({ user: { $in: ids } }).select("_id");
  const vendorIds = vendorDocs.map((v) => v._id);

  const r = await Promise.all([
    Event.deleteMany({ createdBy: { $in: ids } }),
    Guide.deleteMany({ author: { $in: ids } }),
    Service.deleteMany({ vendor: { $in: ids } }),
    Review.deleteMany({ $or: [{ user: { $in: ids } }, { vendor: { $in: vendorIds } }] }),
    Booking.deleteMany({ $or: [{ client: { $in: ids } }, { vendor: { $in: ids } }] }),
    Follow.deleteMany({ $or: [{ follower: { $in: ids } }, { following: { $in: ids } }] }),
    Vendor.deleteMany({ user: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } }),
  ]);
  console.log(
    `Cleaned demo data — events:${r[0].deletedCount} guides:${r[1].deletedCount} services:${r[2].deletedCount} reviews:${r[3].deletedCount} bookings:${r[4].deletedCount} follows:${r[5].deletedCount} vendors:${r[6].deletedCount} users:${r[7].deletedCount}`
  );
}

async function seed() {
  // Wipe any prior demo run first so re-running stays clean.
  await clean();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const cities = await City.find({ country: "United States" });
  if (cities.length === 0) throw new Error("No cities found — run the app's city seed first.");
  const vendorTypes = await VendorType.find();
  const typeByName = Object.fromEntries(vendorTypes.map((t) => [t.name, t]));

  const handle = (name, i) => name.toLowerCase().replace(/[^a-z]/g, "") + (i || "");

  // ── Hero (the account you screenshot from) ──────────────────────────────────
  const heroCity = rand(cities);
  const hero = await User.create({
    username: HERO.name,
    email: HERO_EMAIL,
    password: passwordHash,
    profilePicture: face(HERO.g, HERO.n),
    bio: HERO.bio,
    emailVerifiedAt: new Date(),
    verified: true,
    isVendor: true,
    businessName: "Aurora Events Co.",
    businessDescription: "Full-service event production — from rooftop socials to sold-out nights.",
    businessPicture: cover("hero-biz"),
    vendorType: "Venues",
    location: { city: heroCity.name, state: heroCity.state, country: heroCity.country, address: "120 Riverside Ave" },
    contactInfo: {
      phone: "+1 (415) 555-0142",
      website: "auroraevents.co",
      instagram: "@auroraevents",
      tiktok: "@auroraevents",
      twitter: "@auroraevents",
      facebook: "AuroraEventsCo",
    },
    paidEventsApproved: true,
    paidEventsCount: 6,
  });

  // ── Regular + vendor people ─────────────────────────────────────────────────
  const users = [];
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    const c = rand(cities);
    const u = await User.create({
      username: p.name,
      email: `${handle(p.name, i)}@${DEMO_DOMAIN}`,
      password: passwordHash,
      profilePicture: face(p.g, p.n),
      bio: p.bio,
      emailVerifiedAt: new Date(),
      verified: i % 3 === 0,
      location: { city: c.name, state: c.state, country: c.country },
    });
    users.push(u);
  }
  const everyone = [hero, ...users];

  // ── Vendors (first 6 people become businesses) + their services ─────────────
  const vendorUsers = users.slice(0, VENDOR_BIZ.length);
  const heroServiceIds = [];
  for (let i = 0; i < vendorUsers.length + 1; i++) {
    const u = i === 0 ? hero : vendorUsers[i - 1];
    const biz = i === 0 ? { biz: "Aurora Events Co.", type: "Venues", desc: hero.businessDescription } : VENDOR_BIZ[i - 1];
    const c = rand(cities);
    const vt = typeByName[biz.type] || rand(vendorTypes);

    if (i !== 0) {
      u.isVendor = true;
      u.businessName = biz.biz;
      u.businessDescription = biz.desc;
      u.businessPicture = cover(`biz-${i}`);
      u.vendorType = biz.type;
      u.location = { city: c.name, state: c.state, country: c.country, address: `${10 + i} Market St` };
      u.contactInfo = {
        phone: `+1 (212) 555-01${10 + i}`,
        website: `${handle(biz.biz)}.com`,
        instagram: `@${handle(biz.biz)}`,
        tiktok: `@${handle(biz.biz)}`,
      };
      await u.save();
    }

    const rating = Math.round((4.4 + Math.random() * 0.5) * 10) / 10;
    const vendorDoc = await Vendor.create({
      name: biz.biz,
      vendorType: vt._id,
      city: i === 0 ? heroCity._id : c._id,
      description: biz.desc,
      images: [cover(`biz-${i}`), cover(`biz-${i}-b`)],
      priceRange: 2 + (i % 3),
      rating,
      contact: { phone: u.contactInfo?.phone, website: u.contactInfo?.website, instagram: u.contactInfo?.instagram },
      user: u._id,
      verified: i % 2 === 0,
    });

    // 1–3 services each
    const nServices = i === 0 ? 3 : 1 + (i % 2);
    for (let s = 0; s < nServices; s++) {
      const price = [20, 35, 50, 75, 120][Math.floor(Math.random() * 5)];
      const svc = await Service.create({
        vendor: u._id,
        name: i === 0 ? ["Venue Hire (Full Night)", "Event Production Package", "Bar & Bartender Service"][s] : `${biz.biz} — Signature Package ${s + 1}`,
        description: "A polished, ready-to-go package for your next event. Includes setup, staffing and breakdown.",
        category: biz.type,
        price,
        currency: "USD",
        images: [cover(`svc-${i}-${s}`), cover(`svc-${i}-${s}-b`)],
        duration: { value: [2, 3, 4][s % 3], unit: "hours" },
        availability: "available",
        isActive: true,
      });
      if (i === 0) heroServiceIds.push({ id: svc._id, price });
    }

    // Reviews from other people (populates the rating shown in UI)
    const reviewers = sample(everyone.filter((x) => !x._id.equals(u._id)), 3 + (i % 3));
    for (const rv of reviewers) {
      await Review.create({
        vendor: vendorDoc._id,
        user: rv._id,
        rating: 4 + (Math.random() > 0.4 ? 1 : 0),
        review: rand([
          "Absolutely made our night — highly recommend!",
          "Professional, on time, and the vibe was perfect.",
          "Booked again already. Five stars.",
          "Everything was seamless. Our guests loved it.",
          "Great communication and an even better experience.",
        ]),
      });
    }
  }

  // ── Bookings for the hero vendor (drives dashboard earnings/sparkline) ───────
  const heroClients = sample(users, 10);
  for (let i = 0; i < heroClients.length; i++) {
    const svc = rand(heroServiceIds);
    // Spread across the last ~20 days so this-month + sparkline both populate.
    const createdAt = daysFromNow(-Math.floor(Math.random() * 20));
    const b = await Booking.create({
      client: heroClients[i]._id,
      vendor: hero._id,
      service: svc.id,
      preferredDate: daysFromNow(2 + i),
      message: "Looking forward to it!",
      status: i < 7 ? "confirmed" : "pending",
      priceSnapshot: { amount: svc.price, currency: "USD" },
    });
    // force createdAt for realistic earnings windows
    await Booking.updateOne({ _id: b._id }, { $set: { createdAt } });
  }

  // ── Public events (fills home/explore/events) ───────────────────────────────
  for (let i = 0; i < EVENT_TEMPLATES.length; i++) {
    const t = EVENT_TEMPLATES[i];
    const organizer = rand(everyone);
    const c = rand(cities);
    const attendees = sample(everyone.filter((x) => !x._id.equals(organizer._id)), 4 + Math.floor(Math.random() * 8));
    const viewers = sample(everyone.filter((x) => !x._id.equals(organizer._id)), 8 + Math.floor(Math.random() * 12));
    const imgs = [cover(`event-${i}`), cover(`event-${i}-b`), cover(`event-${i}-c`)];
    await new Event({
      title: t.title,
      date: daysFromNow(2 + i * 2),
      location: `${c.name}, ${c.state}`,
      address: `${100 + i} Nightlife Blvd`,
      city: c.name,
      state: c.state,
      country: c.country,
      image: imgs[0],
      images: imgs,
      description:
        "Join us for an unforgettable night. Great music, great people, and a vibe you won't want to miss. Limited spots — grab yours early!",
      createdBy: organizer._id,
      isPublic: true,
      isPaid: t.paid,
      ticketPrice: t.price,
      maxGuests: t.paid ? 40 + i * 5 : 0,
      rsvpUsers: attendees.map((a) => a._id),
      invitedUsers: attendees.slice(0, 3).map((a) => a._id),
      viewedBy: viewers.map((v) => v._id),
      isActive: true,
      approvalStatus: "approved",
    }).save();
  }

  // ── Guides (fills bests carousels) ──────────────────────────────────────────
  for (let i = 0; i < GUIDE_TOPICS_POOL.length; i++) {
    const g = GUIDE_TOPICS_POOL[i];
    const author = rand(everyone);
    const c = rand(cities);
    const sections = Array.from({ length: 3 + (i % 3) }).map((_, s) => ({
      title: `#${s + 1} ${rand(["The Local Favorite", "Hidden Gem", "Crowd Pleaser", "Late-Night Pick", "Best for Groups"])}`,
      rank: s + 1,
      description:
        "A go-to spot loved by locals. Get there early on weekends, ask for the house special, and thank us later.",
      image: cover(`guide-${i}-${s}`),
    }));
    await Guide.create({
      title: g.title,
      coverImage: cover(`guide-${i}`),
      author: author._id,
      authorName: author.username,
      description: "A hand-picked list of the very best spots, curated by someone who actually goes out.",
      price: i % 3 === 0 ? 0 : [3, 5, 8][i % 3],
      city: c.name,
      cityState: c.state,
      country: c.country,
      topic: g.topic,
      sections,
      isDraft: false,
      isActive: true,
      views: 20 + Math.floor(Math.random() * 400),
      savedBy: i < 3 ? [hero._id] : [],
      purchasedBy: sample(users, Math.floor(Math.random() * 5)).map((u) => u._id),
    });
  }

  // ── Follows (populates follower/following counts) ───────────────────────────
  const followDocs = [];
  for (const u of users) {
    if (Math.random() > 0.3) followDocs.push({ follower: hero._id, following: u._id });
    if (Math.random() > 0.3) followDocs.push({ follower: u._id, following: hero._id });
  }
  // a few cross-follows between people
  for (let k = 0; k < 20; k++) {
    const a = rand(users), b = rand(users);
    if (!a._id.equals(b._id)) followDocs.push({ follower: a._id, following: b._id });
  }
  await Follow.insertMany(followDocs, { ordered: false }).catch(() => {});

  console.log("\n✅ Demo data seeded.");
  console.log(`   Users: ${everyone.length}  Events: ${EVENT_TEMPLATES.length}  Guides: ${GUIDE_TOPICS_POOL.length}  Vendors: ${vendorUsers.length + 1}`);
  console.log("\n🔑 Log in for screenshots:");
  console.log(`   Email:    ${HERO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log("   (every demo account uses the same password)\n");
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");
  try {
    if (process.argv.includes("--clean")) {
      await clean();
    } else {
      await seed();
    }
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

main().catch((e) => {
  console.error("Seed error:", e);
  process.exit(1);
});
