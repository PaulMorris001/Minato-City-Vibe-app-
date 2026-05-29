import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";
import config from "../config/env.js";
import User from "../models/user.model.js";
import { Vendor, City } from "../models/vendor.model.js";
import { findOrCreateCity } from "./vendors.controller.js";
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

    // Resolve the City document for vendor discovery. New clients send
    // { country, state, city }; older clients may still send a cityId.
    let cityDoc = null;
    if (location?.cityId) {
      cityDoc = await City.findById(location.cityId).catch(() => null);
    }
    if (!cityDoc) {
      cityDoc = await findOrCreateCity({
        name: location?.city,
        state: location?.state,
        country: location?.country,
      });
    }

    // Create/upsert linked Vendor document with ObjectId refs for discovery
    if (vendorTypeId && cityDoc) {
      try {
        await Vendor.findOneAndUpdate(
          { user: user._id },
          {
            name: businessName,
            description: businessDescription,
            images: businessPictureUrl ? [businessPictureUrl] : [],
            vendorType: vendorTypeId,
            city: cityDoc._id,
            contact: {
              phone: contactInfo?.phone || "",
              website: contactInfo?.website || "",
              instagram: contactInfo?.instagram || "",
              twitter: contactInfo?.twitter || "",
              tiktok: contactInfo?.tiktok || "",
              facebook: contactInfo?.facebook || "",
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

    // Sync linked Vendor document (name, description, images, contact, city)
    const vendorUpdate = {};
    if (businessName) vendorUpdate.name = businessName;
    if (businessDescription) vendorUpdate.description = businessDescription;
    if (user.businessPicture) vendorUpdate.images = [user.businessPicture];
    if (location?.city && location?.state) {
      const cityDoc = await findOrCreateCity({
        name: location.city,
        state: location.state,
        country: location.country,
      });
      if (cityDoc) vendorUpdate.city = cityDoc._id;
    }
    if (contactInfo) {
      vendorUpdate.contact = {
        phone: contactInfo.phone || "",
        website: contactInfo.website || "",
        instagram: contactInfo.instagram || "",
        twitter: contactInfo.twitter || "",
        tiktok: contactInfo.tiktok || "",
        facebook: contactInfo.facebook || "",
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

// Update profile picture and/or bio (for both clients and vendors)
export async function updateProfilePicture(req, res) {
  const { profilePicture, bio } = req.body;

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Only touch the picture when the client actually sends one — otherwise a
    // bio-only update would wipe the existing photo.
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

    if (bio !== undefined) {
      assertClean([{ field: "Bio", value: bio }]);
      user.bio = bio;
    }

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        bio: user.bio,
        isVendor: user.isVendor
      }
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    res.status(400).json({ message: "Error updating profile", details: error.message });
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
      .select("_id username email profilePicture bio isVendor businessName verified isBanned blockedUsers")
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
  // Per-request id so a single sign-in attempt's logs are easy to grep on Render.
  const reqId = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = Date.now();
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown";
  const ua = req.headers["user-agent"] || "unknown";

  const { idToken, accessToken } = req.body || {};

  // Loud arrival log — if we don't see this for a failing device, the request
  // is never reaching the server (most likely client-side: missing URL scheme
  // on iOS, missing SHA-1 OAuth client on Android).
  console.log(
    `[google-auth ${reqId}] ▶ received ip=${ip} ua="${ua.slice(0, 80)}" ` +
      `idToken=${idToken ? `present(len=${idToken.length})` : "missing"} ` +
      `accessToken=${accessToken ? `present(len=${accessToken.length})` : "missing"} ` +
      `body-keys=[${Object.keys(req.body || {}).join(",")}]`
  );
  console.log(
    `[google-auth ${reqId}] config GOOGLE_CLIENT_ID=${
      process.env.GOOGLE_CLIENT_ID
        ? `${process.env.GOOGLE_CLIENT_ID.slice(0, 14)}…${process.env.GOOGLE_CLIENT_ID.slice(-24)}`
        : "NOT_SET"
    }`
  );

  try {
    let googleId, email, name, picture;

    if (idToken) {
      // Peek at the JWT header/payload BEFORE verifying so we can see why
      // verification fails (wrong audience, expired, wrong issuer, etc.).
      try {
        const parts = idToken.split(".");
        const header = JSON.parse(Buffer.from(parts[0], "base64").toString("utf8"));
        const claims = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        console.log(
          `[google-auth ${reqId}] idToken header.alg=${header.alg} header.kid=${header.kid} ` +
            `claims.iss=${claims.iss} claims.aud=${claims.aud} claims.azp=${claims.azp} ` +
            `claims.email=${claims.email} claims.exp=${claims.exp} ` +
            `claims.iat=${claims.iat} now=${Math.floor(Date.now() / 1000)}`
        );
      } catch (peekErr) {
        console.warn(
          `[google-auth ${reqId}] could not peek at idToken (malformed JWT?): ${peekErr.message}`
        );
      }

      console.log(`[google-auth ${reqId}] verifying idToken with Google…`);
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
      console.log(
        `[google-auth ${reqId}] ✓ idToken verified sub=${googleId} email=${email} ` +
          `email_verified=${payload.email_verified}`
      );
    } else if (accessToken) {
      console.log(`[google-auth ${reqId}] fetching userinfo with accessToken…`);
      const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error(
          `[google-auth ${reqId}] ✗ userinfo fetch failed status=${response.status} body=${text.slice(0, 200)}`
        );
        throw new Error("Failed to fetch user info from Google");
      }

      const userInfo = await response.json();
      googleId = userInfo.id;
      email = userInfo.email;
      name = userInfo.name;
      picture = userInfo.picture;
      console.log(
        `[google-auth ${reqId}] ✓ userinfo fetched sub=${googleId} email=${email}`
      );
    } else {
      console.warn(`[google-auth ${reqId}] ✗ no idToken or accessToken in body`);
      return res.status(400).json({ message: "Either idToken or accessToken is required" });
    }

    if (!email) {
      console.warn(`[google-auth ${reqId}] ✗ no email in Google payload`);
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
      console.log(
        `[google-auth ${reqId}] existing user found id=${user._id} email=${user.email} ` +
          `authProvider=${user.authProvider} hadGoogleId=${!!user.googleId} ` +
          `isBanned=${!!user.isBanned} isVendor=${!!user.isVendor}`
      );
      if (user.isBanned) {
        console.warn(`[google-auth ${reqId}] ✗ user is banned id=${user._id}`);
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
        console.log(`[google-auth ${reqId}] linked Google to existing account id=${user._id}`);
      }
    } else {
      console.log(`[google-auth ${reqId}] no existing user — creating new account email=${normalizedEmail}`);
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
      console.log(`[google-auth ${reqId}] ✓ new user created id=${user._id}`);
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    console.log(
      `[google-auth ${reqId}] ◀ success in ${Date.now() - startedAt}ms id=${user._id} isVendor=${user.isVendor}`
    );

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
    console.error(
      `[google-auth ${reqId}] ✗ FAILED in ${Date.now() - startedAt}ms ` +
        `name=${error.name} message=${error.message}`
    );
    if (error.stack) console.error(`[google-auth ${reqId}] stack: ${error.stack}`);
    res.status(400).json({ message: "Google authentication failed", details: error.message });
  }
}

// ─── Web-based Google OAuth (OTA-friendly hotfix) ───────────────────────────
//
// The native Google Sign-In SDK is non-functional in the current build:
//   - iOS Info.plist has `com.googleusercontent.apps.placeholder` as the
//     reverse-client URL scheme (a prebuild ran without the real iOS client
//     id env var set), so Google's callback can't return to the app.
//   - Android's google-services.json has `oauth_client: []`, so the SHA-1 of
//     the release keystore isn't tied to an OAuth client and the picker fails
//     with DEVELOPER_ERROR after the user selects an account.
//
// Both require a new native build to fix. Until then this endpoint pair gives
// us a 100% OTA-shippable replacement: the app opens this URL in a system
// browser via `WebBrowser.openAuthSessionAsync`, the user signs in with
// Google, Google redirects to /auth/google/web/callback on us, we
// find-or-create the user, then redirect the browser to `mobile://auth/google?…`
// with a JWT — `openAuthSessionAsync` sees the `mobile://` scheme (which IS
// already registered in the binary) and hands the URL back to the app.
//
// Requirements (must be set BEFORE this works):
//   1. Render env vars: GOOGLE_CLIENT_ID (already set) AND GOOGLE_CLIENT_SECRET
//      (the secret matching the web OAuth client whose id is GOOGLE_CLIENT_ID).
//   2. In Google Cloud Console → the web OAuth client → Authorized redirect
//      URIs → add: https://night-vibe.onrender.com/api/auth/google/web/callback

const GOOGLE_WEB_REDIRECT_PATH = "/api/auth/google/web/callback";

function getGoogleWebRedirectUri() {
  const base = (
    process.env.SERVER_URL || "https://night-vibe.onrender.com"
  ).replace(/\/$/, "");
  return `${base}${GOOGLE_WEB_REDIRECT_PATH}`;
}

function buildGoogleWebClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars on the server"
    );
  }
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getGoogleWebRedirectUri()
  );
}

// Tiny HTML page that bounces the system browser to a custom-scheme URL.
// Custom-scheme 302 redirects are inconsistent across browsers (Safari, Chrome,
// in-app webviews); a meta refresh + JS + a visible fallback link covers all
// the cases we've hit. The page never shows for >1 frame in the happy path
// because openAuthSessionAsync detaches as soon as it sees the mobile:// URL.
function renderRedirectPage(url, message = "Returning to Nightvibe…") {
  // Escape the URL minimally for HTML/JS embedding.
  const safe = String(url).replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url=${safe}" />
  <title>Nightvibe</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background:#0f0a1f; color:#eee;
           display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    a { color:#a855f7; text-decoration:none; }
  </style>
</head><body>
  <div>
    <p>${message}</p>
    <p><a href="${safe}">Tap here if Nightvibe doesn't reopen automatically.</a></p>
  </div>
  <script>setTimeout(function(){ window.location.replace("${safe}"); }, 50);</script>
</body></html>`;
}

// Short, single-use state token kept in-memory. Stops a third-party site from
// CSRF-ing the callback. Tokens are 10-minute TTL; no DB row needed.
const googleWebStateStore = new Map(); // state -> { createdAt }
const GOOGLE_WEB_STATE_TTL_MS = 10 * 60 * 1000;

function rememberWebState(state) {
  googleWebStateStore.set(state, { createdAt: Date.now() });
  // Lazy GC so the map can't grow unbounded.
  if (googleWebStateStore.size > 500) {
    const cutoff = Date.now() - GOOGLE_WEB_STATE_TTL_MS;
    for (const [k, v] of googleWebStateStore) {
      if (v.createdAt < cutoff) googleWebStateStore.delete(k);
    }
  }
}

function consumeWebState(state) {
  const entry = googleWebStateStore.get(state);
  if (!entry) return false;
  googleWebStateStore.delete(state);
  if (Date.now() - entry.createdAt > GOOGLE_WEB_STATE_TTL_MS) return false;
  return true;
}

/**
 * GET /api/auth/google/web/start
 *
 * Entry point hit by the mobile app via WebBrowser.openAuthSessionAsync.
 * Redirects the browser to Google's consent screen.
 */
export async function googleWebStart(req, res) {
  const reqId = `gws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    const oauth2Client = buildGoogleWebClient();
    const state = crypto.randomBytes(24).toString("hex");
    rememberWebState(state);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "online",
      prompt: "select_account",
      scope: ["openid", "profile", "email"],
      state,
    });

    console.log(
      `[google-web-start ${reqId}] redirecting to Google ` +
        `redirect_uri=${getGoogleWebRedirectUri()} state=${state.slice(0, 8)}…`
    );
    res.redirect(302, authUrl);
  } catch (err) {
    console.error(`[google-web-start ${reqId}] ✗ ${err.message}`);
    // Surface the failure to the app via the same redirect channel so the
    // UI doesn't just hang on a blank page.
    res
      .status(500)
      .send(
        renderRedirectPage(
          `mobile://auth/google?error=${encodeURIComponent(err.message)}`,
          "Sign-in is not configured. Returning…"
        )
      );
  }
}

/**
 * GET /api/auth/google/web/callback
 *
 * Google redirects here after the user grants consent. We exchange the code
 * for tokens, verify the id_token, find-or-create the user, mint our JWT, and
 * bounce the browser to `mobile://auth/google?token=…&user=…`. The app's
 * WebBrowser session captures that URL and resolves.
 */
export async function googleWebCallback(req, res) {
  const reqId = `gwc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = Date.now();
  const { code, state, error: googleError } = req.query;

  console.log(
    `[google-web-callback ${reqId}] ▶ received code=${code ? "yes" : "no"} ` +
      `state=${state ? `${String(state).slice(0, 8)}…` : "missing"} ` +
      `googleError=${googleError || "none"}`
  );

  // Google returned an error (e.g. user denied) — bounce back with it.
  if (googleError) {
    console.warn(`[google-web-callback ${reqId}] google returned error=${googleError}`);
    return res
      .status(200)
      .send(
        renderRedirectPage(
          `mobile://auth/google?error=${encodeURIComponent(String(googleError))}`,
          "Sign-in was cancelled. Returning…"
        )
      );
  }

  if (!code || !state || !consumeWebState(String(state))) {
    console.warn(
      `[google-web-callback ${reqId}] ✗ invalid request (missing code/state or unknown state)`
    );
    return res
      .status(400)
      .send(
        renderRedirectPage(
          `mobile://auth/google?error=${encodeURIComponent("invalid_state")}`,
          "Sign-in expired. Returning…"
        )
      );
  }

  try {
    const oauth2Client = buildGoogleWebClient();
    const { tokens } = await oauth2Client.getToken(String(code));
    if (!tokens.id_token) {
      throw new Error("Google did not return an id_token");
    }
    console.log(`[google-web-callback ${reqId}] ✓ exchanged code for tokens`);

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;
    console.log(
      `[google-web-callback ${reqId}] ✓ verified id_token sub=${googleId} email=${email}`
    );

    if (!email) {
      throw new Error("Google did not return an email");
    }
    const normalizedEmail = email.toLowerCase().trim();

    // Find-or-create — same logic as native /google-auth so accounts created
    // through either path are interchangeable.
    let user = await User.findOne({
      $or: [{ googleId }, { email: normalizedEmail }],
    });

    if (user) {
      if (user.isBanned) {
        console.warn(`[google-web-callback ${reqId}] ✗ user is banned id=${user._id}`);
        return res
          .status(200)
          .send(
            renderRedirectPage(
              `mobile://auth/google?error=${encodeURIComponent("account_suspended")}`,
              "Account suspended. Returning…"
            )
          );
      }
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = "google";
        if (!user.profilePicture && picture) user.profilePicture = picture;
        await user.save();
        console.log(`[google-web-callback ${reqId}] linked Google to existing user id=${user._id}`);
      }
    } else {
      user = new User({
        username: name || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        authProvider: "google",
        googleId,
        profilePicture: picture || "",
        isVendor: false,
        termsAcceptedAt: new Date(),
      });
      await user.save();
      console.log(`[google-web-callback ${reqId}] ✓ created new user id=${user._id}`);
    }

    const token = jwt.sign({ id: user._id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    // Compact user payload — matches what the existing native flow returns so
    // the mobile finishAuth() helper works unchanged.
    const userPayload = {
      id: user._id,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture || "",
      isVendor: !!user.isVendor,
      authProvider: user.authProvider,
    };
    const userParam = encodeURIComponent(JSON.stringify(userPayload));
    const redirectUrl = `mobile://auth/google?token=${encodeURIComponent(token)}&user=${userParam}`;

    console.log(
      `[google-web-callback ${reqId}] ◀ success in ${Date.now() - startedAt}ms ` +
        `id=${user._id} isVendor=${user.isVendor}`
    );
    res.status(200).send(renderRedirectPage(redirectUrl));
  } catch (err) {
    console.error(
      `[google-web-callback ${reqId}] ✗ FAILED in ${Date.now() - startedAt}ms ` +
        `name=${err.name} message=${err.message}`
    );
    if (err.stack) console.error(`[google-web-callback ${reqId}] stack: ${err.stack}`);
    res
      .status(200)
      .send(
        renderRedirectPage(
          `mobile://auth/google?error=${encodeURIComponent(err.message || "auth_failed")}`,
          "Sign-in failed. Returning…"
        )
      );
  }
}

// Apple's public keys for verifying Sign in with Apple identity tokens.
// `jose` caches and refreshes the key set automatically.
const appleJWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);

/**
 * Sign in with Apple. The client sends the `identityToken` (a JWT) returned by
 * `expo-apple-authentication`, plus `fullName`/`email` which Apple only
 * provides on the FIRST authorization. We verify the token against Apple's
 * public keys, then find-or-create the user (matching first by appleId, then
 * by email so an existing email/Google account gets linked rather than
 * duplicated).
 */
export async function appleAuth(req, res) {
  const { identityToken, fullName, email: emailFromClient } = req.body;

  try {
    if (!identityToken) {
      return res.status(400).json({ message: "identityToken is required" });
    }

    // Verify signature, issuer, and audience (our app's bundle identifier).
    const { payload } = await jwtVerify(identityToken, appleJWKS, {
      issuer: "https://appleid.apple.com",
      audience: config.apple.clientId,
    });

    const appleId = payload.sub;
    if (!appleId) {
      return res.status(400).json({ message: "Invalid Apple identity token" });
    }

    // Email comes from the token when available, else the client payload
    // (first sign-in only). Returning users are matched by appleId instead.
    const tokenEmail = typeof payload.email === "string" ? payload.email : "";
    const normalizedEmail = (tokenEmail || emailFromClient || "")
      .toLowerCase()
      .trim();

    let user = await User.findOne({
      $or: [
        { appleId },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
      ],
    });

    if (user) {
      if (user.isBanned) {
        return res.status(403).json({
          message:
            "This account has been suspended for violating our content policy.",
        });
      }
      // Link Apple to an existing account if not already linked.
      if (!user.appleId) {
        user.appleId = appleId;
        if (user.authProvider === "local") user.authProvider = "apple";
        await user.save();
      }
    } else {
      if (!normalizedEmail) {
        return res.status(400).json({
          message:
            "Apple did not share an email. Please sign up with email first, or remove this app from your Apple ID settings and try again.",
        });
      }

      // Build a username from the provided name, else the email local part,
      // ensuring uniqueness against existing usernames.
      let baseUsername =
        (fullName && fullName.trim()) || normalizedEmail.split("@")[0];
      baseUsername = baseUsername.replace(/\s+/g, "").slice(0, 20) || "user";
      let username = baseUsername;
      let suffix = 0;
      // eslint-disable-next-line no-await-in-loop
      while (await User.exists({ username })) {
        suffix += 1;
        username = `${baseUsername}${suffix}`;
      }

      user = new User({
        username,
        email: normalizedEmail,
        authProvider: "apple",
        appleId,
        isVendor: false,
        termsAcceptedAt: new Date(),
      });
      await user.save();
    }

    const token = jwt.sign({ id: user._id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    res.json({
      message: "Apple authentication successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        isVendor: user.isVendor,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error("Apple auth error:", error);
    res
      .status(400)
      .json({ message: "Apple authentication failed", details: error.message });
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
