import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import config from "../config/env.js";
import User from "../models/user.model.js";
import { Vendor } from "../models/vendor.model.js";
import { uploadBase64Image, deleteImage } from "../services/image.service.js";
import {
  generateOTP,
  sendPasswordResetOTP,
  sendPasswordResetSuccessEmail,
  sendSignupVerificationOTP,
} from "../services/email.service.js";
import Follow from "../models/follow.model.js";
import Event from "../models/event.model.js";
import { getBlockedIds } from "../utils/blockFilter.js";
import { assertClean } from "../utils/contentFilter.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function register(req, res) {
  const { username, email, password, termsAccepted } = req.body;

  try {
    if (!termsAccepted) {
      return res.status(400).json({
        message: "You must agree to the Terms of Service and Privacy Policy to create an account.",
      });
    }

    assertClean([{ field: "Username", value: username }]);

    // Normalize email to lowercase and trim whitespace
    const normalizedEmail = email.toLowerCase().trim();

    const hashed = await bcrypt.hash(password, 10);

    // Generate a 6-digit OTP that the user must enter on the next screen.
    // Stored on the user doc with a 10-minute expiry; cleared when verified.
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    const user = new User({
      username,
      email: normalizedEmail,
      password: hashed,
      isVendor: false, // All users start as clients
      termsAcceptedAt: new Date(),
      signupOTP: otp,
      signupOTPExpires: otpExpires,
    });
    await user.save();

    // Fire-and-log; we don't fail the signup if email is misconfigured —
    // the user can resend from the OTP screen.
    try {
      await sendSignupVerificationOTP(normalizedEmail, otp, username);
    } catch (mailErr) {
      console.error("Failed to send signup OTP email:", mailErr?.message ?? mailErr);
    }

    const token = jwt.sign({ id: user._id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    res.status(201).json({
      message: "User Created. Please verify your email.",
      token,
      requiresEmailVerification: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isVendor: user.isVendor,
        emailVerifiedAt: null,
      },
    });
  } catch (error) {
    const status = error.statusCode || 400;
    res
      .status(status)
      .json({ message: error.statusCode ? error.message : "Error creating User", details: error.message });
  }
}

export async function login(req, res) {
  const { email, password } = req.body;
  // Normalize email to match how it's stored in the database
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return res.status(404).json({ message: "User not found" });

  if (user.isBanned) {
    return res.status(403).json({
      message: "This account has been suspended for violating our content policy.",
    });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ message: "Invalid Credentials" });

  const token = jwt.sign({ id: user._id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  res.json({
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      isVendor: user.isVendor
    }
  });
}

// Become a vendor (upgrade from client to vendor)
export async function becomeVendor(req, res) {
  const { businessName, businessDescription, businessPicture, vendorType, vendorTypeId, location, contactInfo } = req.body;

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVendor) {
      return res.status(400).json({ message: "User is already a vendor" });
    }

    // Handle business picture upload
    let businessPictureUrl = "";
    if (businessPicture) {
      if (businessPicture.startsWith('data:image')) {
        try {
          const result = await uploadBase64Image(businessPicture, 'businesses');
          businessPictureUrl = result.url;
        } catch (error) {
          console.error("Error uploading business picture:", error);
          return res.status(400).json({ message: "Error uploading business picture", details: error.message });
        }
      } else {
        businessPictureUrl = businessPicture;
      }
    }

    // Upgrade user to vendor (store string fields for vendor dashboard)
    user.isVendor = true;
    user.businessName = businessName;
    user.businessDescription = businessDescription;
    user.businessPicture = businessPictureUrl;
    user.vendorType = vendorType;
    user.location = location;
    user.contactInfo = contactInfo;

    await user.save();

    // Create/upsert linked Vendor document with ObjectId refs for discovery
    if (vendorTypeId && location?.cityId) {
      try {
        await Vendor.findOneAndUpdate(
          { user: user._id },
          {
            name: businessName,
            description: businessDescription,
            images: businessPictureUrl ? [businessPictureUrl] : [],
            vendorType: vendorTypeId,
            city: location.cityId,
            contact: {
              phone: contactInfo?.phone || "",
              instagram: contactInfo?.instagram || "",
              website: contactInfo?.website || "",
            },
            user: user._id,
            priceRange: 2,
          },
          { upsert: true, new: true }
        );
      } catch (vendorError) {
        console.error("Error creating vendor document:", vendorError);
        // Non-fatal: user is already a vendor, just log the error
      }
    }

    res.json({
      message: "Successfully registered as a vendor",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isVendor: user.isVendor,
        businessName: user.businessName,
        businessDescription: user.businessDescription,
        businessPicture: user.businessPicture,
        vendorType: user.vendorType,
        location: user.location,
        contactInfo: user.contactInfo,
        verified: user.verified
      }
    });
  } catch (error) {
    res.status(400).json({ message: "Error becoming vendor", details: error.message });
  }
}

// Update vendor profile with business details
export async function updateVendorProfile(req, res) {
  const { businessName, businessDescription, businessPicture, profilePicture, vendorType, location, contactInfo } = req.body;

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isVendor) {
      return res.status(403).json({ message: "Only vendors can update business profile" });
    }

    // Handle business picture upload (if provided)
    if (businessPicture !== undefined) {
      if (businessPicture && businessPicture.startsWith('data:image')) {
        try {
          // Delete old business picture if it exists and is a Cloudinary URL
          if (user.businessPicture && user.businessPicture.includes('cloudinary.com')) {
            await deleteImage(user.businessPicture).catch(err => console.error("Error deleting old business picture:", err));
          }

          const result = await uploadBase64Image(businessPicture, 'businesses');
          user.businessPicture = result.url;
        } catch (error) {
          console.error("Error uploading business picture:", error);
          return res.status(400).json({ message: "Error uploading business picture", details: error.message });
        }
      } else {
        // Already a URL or empty string
        user.businessPicture = businessPicture;
      }
    }

    // Handle profile picture upload (if provided)
    if (profilePicture !== undefined) {
      if (profilePicture && profilePicture.startsWith('data:image')) {
        try {
          // Delete old profile picture if it exists and is a Cloudinary URL
          if (user.profilePicture && user.profilePicture.includes('cloudinary.com')) {
            await deleteImage(user.profilePicture).catch(err => console.error("Error deleting old profile picture:", err));
          }

          const result = await uploadBase64Image(profilePicture, 'profiles');
          user.profilePicture = result.url;
        } catch (error) {
          console.error("Error uploading profile picture:", error);
          return res.status(400).json({ message: "Error uploading profile picture", details: error.message });
        }
      } else {
        // Already a URL or empty string
        user.profilePicture = profilePicture;
      }
    }

    // Update vendor-specific fields
    if (businessName) user.businessName = businessName;
    if (businessDescription) user.businessDescription = businessDescription;
    if (vendorType) user.vendorType = vendorType;
    if (location) user.location = location;
    if (contactInfo) user.contactInfo = contactInfo;

    await user.save();

    // Sync linked Vendor document (name, description, images, contact)
    const vendorUpdate = {};
    if (businessName) vendorUpdate.name = businessName;
    if (businessDescription) vendorUpdate.description = businessDescription;
    if (user.businessPicture) vendorUpdate.images = [user.businessPicture];
    if (contactInfo) {
      vendorUpdate.contact = {
        phone: contactInfo.phone || "",
        instagram: contactInfo.instagram || "",
        website: contactInfo.website || "",
      };
    }
    if (Object.keys(vendorUpdate).length > 0) {
      Vendor.findOneAndUpdate({ user: user._id }, vendorUpdate).catch(err =>
        console.error("Error syncing vendor document:", err)
      );
    }

    res.json({
      message: "Vendor profile updated successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        isVendor: user.isVendor,
        businessName: user.businessName,
        businessDescription: user.businessDescription,
        businessPicture: user.businessPicture,
        vendorType: user.vendorType,
        location: user.location,
        contactInfo: user.contactInfo,
        verified: user.verified
      }
    });
  } catch (error) {
    res.status(400).json({ message: "Error updating profile", details: error.message });
  }
}

// Get current user profile
export async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select(
      "-password -resetPasswordOTP -resetPasswordOTPExpires -resetPasswordToken -resetPasswordTokenExpires -signupOTP -signupOTPExpires"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [followersCount, followingCount] = await Promise.all([
      Follow.countDocuments({ following: req.user.id }),
      Follow.countDocuments({ follower: req.user.id }),
    ]);

    res.json({
      user: {
        ...user.toObject(),
        followersCount,
        followingCount,
      },
    });
  } catch (error) {
    res.status(400).json({ message: "Error fetching profile", details: error.message });
  }
}

// Update profile picture (for both clients and vendors)
export async function updateProfilePicture(req, res) {
  const { profilePicture } = req.body;

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Handle profile picture upload
    if (profilePicture && profilePicture.startsWith('data:image')) {
      try {
        // Delete old profile picture if it exists and is a Cloudinary URL
        if (user.profilePicture && user.profilePicture.includes('cloudinary.com')) {
          await deleteImage(user.profilePicture).catch(err => console.error("Error deleting old profile picture:", err));
        }

        const result = await uploadBase64Image(profilePicture, 'profiles');
        user.profilePicture = result.url;
      } catch (error) {
        console.error("Error uploading profile picture:", error);
        return res.status(400).json({ message: "Error uploading profile picture", details: error.message });
      }
    } else {
      // Already a URL or empty string
      user.profilePicture = profilePicture;
    }

    await user.save();

    res.json({
      message: "Profile picture updated successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        isVendor: user.isVendor
      }
    });
  } catch (error) {
    res.status(400).json({ message: "Error updating profile picture", details: error.message });
  }
}

// Search users by username or email
export async function searchUsers(req, res) {
  const { query } = req.query;

  try {
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }

    const blockedIds = await getBlockedIds(req.user.id);

    const users = await User.find({
      _id: { $ne: req.user.id, $nin: blockedIds }, // Exclude current user + blocked
      isBanned: { $ne: true },
      $or: [
        { username: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } }
      ]
    })
      .select("_id username email profilePicture isVendor businessName")
      .limit(20)
      .lean();

    // Batch follow status lookup
    const userIds = users.map((u) => u._id);
    const [outgoing, incoming] = await Promise.all([
      Follow.find({ follower: req.user.id, following: { $in: userIds } }).lean(),
      Follow.find({ follower: { $in: userIds }, following: req.user.id }).lean(),
    ]);
    const followingSet = new Set(outgoing.map((f) => f.following.toString()));
    const followedBySet = new Set(incoming.map((f) => f.follower.toString()));

    res.json({
      users: users.map(user => {
        const isFollowing = followingSet.has(user._id.toString());
        const isFollowedBy = followedBySet.has(user._id.toString());
        return {
          id: user._id,
          username: user.username,
          email: user.email,
          profilePicture: user.profilePicture,
          isVendor: user.isVendor,
          businessName: user.businessName,
          isFollowing,
          isFollowedBy,
          isMutual: isFollowing && isFollowedBy,
        };
      })
    });
  } catch (error) {
    res.status(400).json({ message: "Error searching users", details: error.message });
  }
}

// Get user by ID (public profile)
export async function getUserById(req, res) {
  try {
    const user = await User.findById(req.params.userId)
      .select("_id username email profilePicture isVendor businessName verified isBanned blockedUsers")
      .lean();

    if (!user || user.isBanned) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hide users that the viewer has blocked or that have blocked the viewer
    if (req.user?.id) {
      const viewerId = String(req.user.id);
      const targetId = String(user._id);
      const viewerBlockedTarget = (user.blockedUsers || []).some(
        (id) => String(id) === viewerId
      );
      if (viewerBlockedTarget) {
        return res.status(404).json({ message: "User not found" });
      }
      const me = await User.findById(viewerId).select("blockedUsers").lean();
      const targetBlockedByViewer = (me?.blockedUsers || []).some(
        (id) => String(id) === targetId
      );
      if (targetBlockedByViewer) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    delete user.blockedUsers;
    delete user.isBanned;
    res.json({ user: { ...user, id: user._id } });
  } catch (error) {
    res.status(400).json({ message: "Error fetching user", details: error.message });
  }
}

// Get public events created by a user
export async function getUserEvents(req, res) {
  try {
    // If the requesting user has blocked (or is blocked by) this user, return empty
    if (req.user?.id) {
      const blockedIds = await getBlockedIds(req.user.id);
      if (blockedIds.some((id) => String(id) === String(req.params.userId))) {
        return res.json({ events: [] });
      }
    }
    const events = await Event.find({
      createdBy: req.params.userId,
      isPublic: true,
      isActive: true,
    })
      .sort({ date: -1 })
      .limit(20)
      .lean();
    res.json({ events });
  } catch (error) {
    res.status(400).json({ message: "Error fetching user events", details: error.message });
  }
}

// Google OAuth authentication
export async function googleAuth(req, res) {
  const { idToken, accessToken } = req.body;

  try {
    let googleId, email, name, picture;

    if (idToken) {
      // Verify the Google ID token
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
    } else if (accessToken) {
      // Use access token to get user info from Google
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info from Google');
      }

      const userInfo = await response.json();
      googleId = userInfo.id;
      email = userInfo.email;
      name = userInfo.name;
      picture = userInfo.picture;
    } else {
      return res.status(400).json({ message: "Either idToken or accessToken is required" });
    }

    if (!email) {
      return res.status(400).json({ message: "Email not provided by Google" });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    let user = await User.findOne({
      $or: [
        { googleId },
        { email: normalizedEmail }
      ]
    });

    if (user) {
      if (user.isBanned) {
        return res.status(403).json({
          message: "This account has been suspended for violating our content policy.",
        });
      }
      // Update existing user with Google info if not already set
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = 'google';
        if (!user.profilePicture && picture) {
          user.profilePicture = picture;
        }
        await user.save();
      }
    } else {
      // Create new user — Google sign-in implies acceptance of Terms via the in-app prompt
      user = new User({
        username: name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        authProvider: 'google',
        googleId,
        profilePicture: picture || "",
        isVendor: false,
        termsAcceptedAt: new Date(),
      });
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    res.json({
      message: "Google authentication successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        isVendor: user.isVendor,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(400).json({ message: "Google authentication failed", details: error.message });
  }
}

// ─── Signup Email Verification ───────────────────────────────────────────────

/**
 * Verify the signup OTP sent at registration. On success, sets
 * `emailVerifiedAt` and clears the OTP fields. Caller is authenticated
 * (we already issued them a JWT at signup).
 */
export async function verifySignupEmail(req, res) {
  try {
    const { otp } = req.body;
    if (!otp || otp.length !== 6) {
      return res.status(400).json({ message: "A 6-digit code is required." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.emailVerifiedAt) {
      return res.status(200).json({
        message: "Email is already verified.",
        emailVerifiedAt: user.emailVerifiedAt,
      });
    }
    if (!user.signupOTP) {
      return res.status(400).json({
        message: "No verification code on file. Tap 'Resend code' to get a new one.",
      });
    }
    if (new Date() > user.signupOTPExpires) {
      user.signupOTP = undefined;
      user.signupOTPExpires = undefined;
      await user.save();
      return res.status(410).json({
        message: "This code has expired. Tap 'Resend code' to get a new one.",
      });
    }
    if (user.signupOTP !== otp) {
      return res.status(400).json({ message: "Incorrect code. Try again." });
    }

    user.emailVerifiedAt = new Date();
    user.signupOTP = undefined;
    user.signupOTPExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: "Email verified.",
      emailVerifiedAt: user.emailVerifiedAt,
    });
  } catch (error) {
    console.error("verifySignupEmail error:", error);
    res.status(500).json({ message: "Failed to verify code", details: error.message });
  }
}

/**
 * Regenerate the signup OTP and email it again. Rate-limited implicitly by
 * the 10-minute expiry overwrite; mobile UI should add a cooldown.
 */
export async function resendSignupOTP(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.emailVerifiedAt) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    const otp = generateOTP();
    user.signupOTP = otp;
    user.signupOTPExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendSignupVerificationOTP(user.email, otp, user.username);
    res.json({ success: true, message: "A new code has been sent to your email." });
  } catch (error) {
    console.error("resendSignupOTP error:", error);
    res.status(500).json({ message: "Failed to send code", details: error.message });
  }
}

// Forgot password - Send OTP to email
export async function forgotPassword(req, res) {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({ message: "Invalid email. This email is not registered." });
    }

    // Check if user signed up with Google OAuth
    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({
        message: "This account was created with Google. Please use Google Sign-In to access your account."
      });
    }

    // Generate 6-digit OTP
    const otp = generateOTP();

    // Set OTP expiry (10 minutes from now)
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Save OTP to user document
    user.resetPasswordOTP = otp;
    user.resetPasswordOTPExpires = otpExpiry;
    await user.save();

    // Send OTP email
    await sendPasswordResetOTP(email, otp, user.username);

    console.log(`Password reset OTP sent to ${email}: ${otp}`); // For development

    res.json({
      success: true,
      message: "Verification code sent to your email"
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      message: "Failed to send verification code. Please try again.",
      details: error.message
    });
  }
}

// Verify OTP
export async function verifyOTP(req, res) {
  const { email, otp } = req.body;

  try {
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if OTP exists
    if (!user.resetPasswordOTP) {
      return res.status(400).json({ message: "No OTP found. Please request a new code." });
    }

    // Check if OTP has expired
    if (new Date() > user.resetPasswordOTPExpires) {
      // Clear expired OTP
      user.resetPasswordOTP = undefined;
      user.resetPasswordOTPExpires = undefined;
      await user.save();

      return res.status(410).json({ message: "OTP has expired. Please request a new code." });
    }

    // Verify OTP
    if (user.resetPasswordOTP !== otp.trim()) {
      return res.status(400).json({ message: "Invalid OTP. Please check the code and try again." });
    }

    // OTP is valid - generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Clear OTP and save reset token
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpires = undefined;
    user.resetPasswordToken = resetToken;
    user.resetPasswordTokenExpires = resetTokenExpiry;
    await user.save();

    res.json({
      success: true,
      message: "OTP verified successfully",
      resetToken
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      message: "Failed to verify OTP. Please try again.",
      details: error.message
    });
  }
}

// Reset password
export async function resetPassword(req, res) {
  const { email, resetToken, newPassword } = req.body;

  try {
    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ message: "Email, reset token, and new password are required" });
    }

    // Validate password length
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if reset token exists
    if (!user.resetPasswordToken) {
      return res.status(400).json({ message: "Invalid or expired reset token. Please request a new password reset." });
    }

    // Check if reset token has expired
    if (new Date() > user.resetPasswordTokenExpires) {
      // Clear expired token
      user.resetPasswordToken = undefined;
      user.resetPasswordTokenExpires = undefined;
      await user.save();

      return res.status(400).json({ message: "Reset token has expired. Please request a new password reset." });
    }

    // Verify reset token
    if (user.resetPasswordToken !== resetToken.trim()) {
      return res.status(400).json({ message: "Invalid reset token. Please request a new password reset." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpires = undefined;
    await user.save();

    // Send success notification email (non-blocking)
    sendPasswordResetSuccessEmail(email, user.username).catch(err =>
      console.error("Error sending success email:", err)
    );

    res.json({
      success: true,
      message: "Password reset successfully. You can now log in with your new password."
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      message: "Failed to reset password. Please try again.",
      details: error.message
    });
  }
}
