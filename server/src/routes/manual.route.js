import express from "express";
import { manualIndex, manualTopic } from "../content/manual.js";

const router = express.Router();

/**
 * The how-to manual, read by the mobile app and the website.
 *
 * Public — no `authenticate`. The website links these pages from its landing
 * page, and someone deciding whether to sign up is exactly who needs to read
 * them.
 */

router.get("/manual", (req, res) => {
  res.status(200).json({ topics: manualIndex() });
});

// Specific path above the parameterized one, as everywhere else in this repo.
router.get("/manual/:slug", (req, res) => {
  const topic = manualTopic(req.params.slug);
  if (!topic) return res.status(404).json({ message: "Topic not found" });
  res.status(200).json({ topic });
});

export default router;
