import express from 'express';
import {
  register,
  login,
  updateVendorProfile,
  getProfile,
  becomeVendor,
  updateProfilePicture,
  searchUsers,
  googleAuth,
  forgotPassword,
  verifyOTP,
  resetPassword
} from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Authentication routes
router.post('/register', register)
router.post("/login", login);
router.post("/google-auth", googleAuth);

// Password reset routes
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/verify-otp", verifyOTP);
router.post("/auth/reset-password", resetPassword);

// Protected routes (require authentication)
router.get("/profile", authenticate, getProfile);
router.put("/profile/picture", authenticate, updateProfilePicture);
router.post("/become-vendor", authenticate, becomeVendor);
router.put("/vendor/profile", authenticate, updateVendorProfile);
router.get("/users/search", authenticate, searchUsers);

export default router;