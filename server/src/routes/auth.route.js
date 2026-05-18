import express from 'express';
import {
  register,
  login,
  updateVendorProfile,
  getProfile,
  becomeVendor,
  updateProfilePicture,
  searchUsers,
  getUserById,
  getUserEvents,
  googleAuth,
  forgotPassword,
  verifyOTP,
  resetPassword,
  verifySignupEmail,
  resendSignupOTP,
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

// Signup email verification (user is already authenticated; we issued a token on register)
router.post("/auth/verify-signup-email", authenticate, verifySignupEmail);
router.post("/auth/resend-signup-otp", authenticate, resendSignupOTP);

// Protected routes (require authentication)
router.get("/profile", authenticate, getProfile);
router.put("/profile/picture", authenticate, updateProfilePicture);
router.post("/become-vendor", authenticate, becomeVendor);
router.put("/vendor/profile", authenticate, updateVendorProfile);
router.get("/users/search", authenticate, searchUsers);
router.get("/users/:userId/events", authenticate, getUserEvents);
router.get("/users/:userId", authenticate, getUserById);

export default router;