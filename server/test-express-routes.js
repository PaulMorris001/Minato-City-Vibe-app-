import express from 'express';

const app = express();
const router = express.Router();

const auth = (req, res, next) => {
  console.log("AUTH CALLED for:", req.path);
  return res.status(401).json({ message: "No token" });
};

// Register routes in exact same order as guide.route.js
router.get("/guide/topics", (req, res) => {
  console.log("PUBLIC /guide/topics handler");
  res.json({ topics: ["Food", "Nightlife"] });
});

router.get("/guide/my-guides", auth, (req, res) => {
  res.json({ msg: "my-guides" });
});

router.get("/guide/purchased", auth, (req, res) => {
  res.json({ msg: "purchased" });
});

router.get("/guide/city/:cityId", (req, res) => {
  console.log("PUBLIC /guide/city/:cityId handler");
  res.json({ cityId: req.params.cityId });
});

router.get("/guide", (req, res) => {
  console.log("PUBLIC /guide handler");
  res.json({ guides: [] });
});

router.get("/guide/:id", auth, (req, res) => {
  console.log("PROTECTED /guide/:id handler, id =", req.params.id);
  res.json({ id: req.params.id });
});

app.use("/api/", router);

app.listen(3001, () => {
  console.log("Test server on http://localhost:3001");
  console.log("Test: curl http://localhost:3001/api/guide/topics");
});
