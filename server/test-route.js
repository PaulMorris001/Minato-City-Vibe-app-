import express from 'express';

const app = express();
const router = express.Router();

// Mock auth middleware
const authenticate = (req, res, next) => {
  console.log(`🔒 Auth called for: ${req.method} ${req.path}`);
  return res.status(401).json({ message: "No token provided" });
};

// Mock handler
const getGuidesByCity = (req, res) => {
  console.log(`✅ getGuidesByCity called with cityId: ${req.params.cityId}`);
  return res.json({ message: "Success!", cityId: req.params.cityId });
};

// Exact same routes as in guide.route.js
router.get("/guides/topics", (req, res) => res.json({ msg: "topics" }));
router.get("/cities/:cityId/guides", getGuidesByCity);
router.get("/guides/my-guides", authenticate, (req, res) => res.json({ msg: "my-guides" }));
router.get("/guides/purchased", authenticate, (req, res) => res.json({ msg: "purchased" }));
router.get("/guides", (req, res) => res.json({ msg: "all guides" }));
router.get("/guides/:id", authenticate, (req, res) => res.json({ msg: "guide by id" }));

app.use("/api", router);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Test URL: http://localhost:${PORT}/api/cities/691660f69fce6d48f9f04c99/guides`);
});
