import express from 'express';
import { register, login, updateVendorProfile, getProfile, becomeVendor, updateProfilePicture, searchUsers, googleAuth } from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', register)
router.post("/login", login);
router.post("/google-auth", googleAuth);
router.get("/profile", authenticate, getProfile);
router.put("/profile/picture", authenticate, updateProfilePicture);
router.post("/become-vendor", authenticate, becomeVendor);
router.put("/vendor/profile", authenticate, updateVendorProfile);
router.get("/users/search", authenticate, searchUsers);

export default router;