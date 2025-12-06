import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import config from "../config/env.js";
import User from "../models/user.model.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function register(req, res) {
  const { username, email, password } = req.body;

  try {
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      email,
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
  const user = await User.findOne({ email });
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

    // Upgrade user to vendor
    user.isVendor = true;
    user.businessName = businessName;
    user.businessDescription = businessDescription;
    user.businessPicture = businessPicture || "";
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

    // Update vendor-specific fields
    if (businessName) user.businessName = businessName;
    if (businessDescription) user.businessDescription = businessDescription;
    if (businessPicture !== undefined) user.businessPicture = businessPicture;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;
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

    user.profilePicture = profilePicture;
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

    // Check if user already exists
    let user = await User.findOne({
      $or: [
        { googleId },
        { email }
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
        username: name || email.split('@')[0],
        email,
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
