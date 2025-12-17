import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import config from "../config/env.js";
import User from "../models/user.model.js";
import { uploadBase64Image, deleteImage } from "../services/image.service.js";

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
