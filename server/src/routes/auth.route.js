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
  googleWebStart,
  googleWebCallback,
  appleAuth,
  forgotPassword,
  verifyOTP,
  resetPassword,
  verifySignupEmail,
  resendSignupOTP,
} from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter, otpLimiter } from '../middleware/rateLimit.middleware.js';

const router = express.Router();

// Authentication routes — rate-limited to blunt credential stuffing and
// automated signup abuse.
router.post('/register', authLimiter, register)
router.post("/login", authLimiter, login);
router.post("/google-auth", authLimiter, googleAuth);
// Web-based Google OAuth (OTA hotfix while native sign-in is broken)
router.get("/auth/google/web/start", googleWebStart);
router.get("/auth/google/web/callback", googleWebCallback);
router.post("/apple-auth", authLimiter, appleAuth);

// Password reset routes — stricter limit since these send email.
router.post("/auth/forgot-password", otpLimiter, forgotPassword);
router.post("/auth/verify-otp", otpLimiter, verifyOTP);
router.post("/auth/reset-password", otpLimiter, resetPassword);

// Signup email verification (user is already authenticated; we issued a token on register)
router.post("/auth/verify-signup-email", authenticate, verifySignupEmail);
router.post("/auth/resend-signup-otp", authenticate, otpLimiter, resendSignupOTP);

// Protected routes (require authentication)
router.get("/profile", authenticate, getProfile);
router.put("/profile/picture", authenticate, updateProfilePicture);
router.post("/become-vendor", authenticate, becomeVendor);
router.put("/vendor/profile", authenticate, updateVendorProfile);
router.get("/users/search", authenticate, searchUsers);
router.get("/users/:userId/events", authenticate, getUserEvents);
router.get("/users/:userId", authenticate, getUserById);

export default router;