import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import config from "../config/env.js";
import User from "../models/user.model.js";
import { uploadBase64Image, deleteImage } from "../services/image.service.js";
import { generateOTP, sendPasswordResetOTP, sendPasswordResetSuccessEmail } from "../services/email.service.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function register(req, res) {
  const { username, email, password } = req.body;

  try {
    // Normalize email to lowercase and trim whitespace
    const normalizedEmail = email.toLowerCase().trim();

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      email: normalizedEmail,
      password: hashed,
      isVendor: false // All users start as clients
    });
    await user.save();

    const token = jwt.sign({ id: user._id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    res.status(201).json({
      message: "User Created Successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isVendor: user.isVendor
      }
    });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error creating User", details: error.message });
  }
}

export async function login(req, res) {
  const { email, password } = req.body;
  // Normalize email to match how it's stored in the database
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return res.status(404).json({ message: "User not found" });

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
  const { businessName, businessDescription, businessPicture, vendorType, location, contactInfo } = req.body;

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
      // If it's a base64 image, upload to Cloudinary
      if (businessPicture.startsWith('data:image')) {
        try {
          const result = await uploadBase64Image(businessPicture, 'businesses');
          businessPictureUrl = result.url;
        } catch (error) {
          console.error("Error uploading business picture:", error);
          return res.status(400).json({ message: "Error uploading business picture", details: error.message });
        }
      } else {
        // Already a URL (Cloudinary or other)
        businessPictureUrl = businessPicture;
      }
    }

    // Upgrade user to vendor
    user.isVendor = true;
    user.businessName = businessName;
    user.businessDescription = businessDescription;
    user.businessPicture = businessPictureUrl;
    user.vendorType = vendorType;
    user.location = location;
    user.contactInfo = contactInfo;

    await user.save();

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
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user });
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

    const users = await User.find({
      _id: { $ne: req.user.id }, // Exclude current user
      $or: [
        { username: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } }
      ]
    })
      .select("_id username email profilePicture isVendor businessName")
      .limit(20);

    res.json({
      users: users.map(user => ({
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        isVendor: user.isVendor,
        businessName: user.businessName
      }))
    });
  } catch (error) {
    res.status(400).json({ message: "Error searching users", details: error.message });
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
      // Create new user
      user = new User({
        username: name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        authProvider: 'google',
        googleId,
        profilePicture: picture || "",
        isVendor: false
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
