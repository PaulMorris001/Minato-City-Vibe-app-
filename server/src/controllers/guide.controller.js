import mongoose from "mongoose";
import Guide, { guideTopicsList } from "../models/guide.model.js";
import User from "../models/user.model.js";
import { getBlockedIds } from "../utils/blockFilter.js";
import { assertClean } from "../utils/contentFilter.js";
import {
  currencyForUser,
  PAYOUT_ROUTING_FIELDS,
} from "../services/payments/resolveProvider.js";
import { rejectIfCannotSell } from "../services/payments/sellingEligibility.js";
import { fulfillGuide } from "../services/payments/fulfillment.js";
import { isSupportUser } from "../utils/supportAccount.js";
import { escapeRegex, exactCaseInsensitive } from "../utils/escapeRegex.js";
import { MAX_MEDIA_ITEMS } from "../utils/mediaLimit.js";
import { resolveUserId } from "../utils/resolveUser.js";

/**
 * Reconcile the two shapes a section's media can arrive in.
 *
 * Sections used to carry a single `image`; they now carry a `media` array of up
 * to MAX_MEDIA_ITEMS photos/videos. Older app builds still send `image`, so a
 * payload with only that is promoted into a one-item array. Going the other
 * way, `image` is kept mirroring `media[0]` so any client still reading the old
 * field shows the section's cover instead of nothing.
 */
function normalizeSectionMedia(section) {
  const media = Array.isArray(section.media)
    ? section.media.filter(Boolean).slice(0, MAX_MEDIA_ITEMS)
    : section.image
      ? [section.image]
      : [];
  return { media, image: media[0] || "" };
}

// Get all topics
export const getTopics = async (req, res) => {
  try {
    res.status(200).json({ topics: guideTopicsList });
  } catch (error) {
    console.error("Get topics error:", error);
    res.status(500).json({ message: "Failed to fetch topics" });
  }
};

// Create a new guide
export const createGuide = async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      city,
      cityState,
      country,
      coverImage,
      topic,
      sections,
      isDraft,
    } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (
      !title ||
      !description ||
      price === undefined ||
      !city ||
      !cityState ||
      !topic ||
      !sections
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be provided" });
    }

    // Validate sections
    if (
      !Array.isArray(sections) ||
      sections.length === 0 ||
      sections.length > 10
    ) {
      return res
        .status(400)
        .json({ message: "A guide must have between 1 and 10 sections" });
    }

    // Validate each section
    for (const section of sections) {
      if (!section.title || !section.rank || !section.description) {
        return res
          .status(400)
          .json({
            message: "Each section must have a title, rank, and description",
          });
      }
      if (section.description.length > 3000) {
        return res
          .status(400)
          .json({
            message: "Section description cannot exceed 3000 characters",
          });
      }
    }

    // Content policy filter
    assertClean([
      { field: "Title", value: title },
      { field: "Description", value: description },
      ...sections.flatMap((s, i) => [
        { field: `Section ${i + 1} title`, value: s.title },
        { field: `Section ${i + 1} body`, value: s.description },
      ]),
    ]);

    // Get author name
    const user = await User.findById(userId).select(`username ${PAYOUT_ROUTING_FIELDS}`);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // A paid guide needs somewhere for the money to land. Free guides skip this
    // entirely — anyone anywhere can publish one.
    if (parseFloat(price) > 0 && rejectIfCannotSell(res, user)) return;

    const guide = new Guide({
      title,
      author: userId,
      authorName: user.username,
      description,
      price: parseFloat(price),
      // Price in the author's local currency (NGN for Nigerian vendors, etc.).
      // Server-authoritative — it must match the provider the seller collects
      // through, so a client-sent currency is ignored.
      currency: currencyForUser(user),
      city,
      cityState,
      country: country || "United States",
      coverImage: coverImage || "",
      topic,
      sections: sections.map((s) => ({
        title: s.title,
        rank: s.rank,
        description: s.description,
        ...normalizeSectionMedia(s),
      })),
      isDraft: isDraft || false,
    });

    await guide.save();

    res.status(201).json({
      message: isDraft
        ? "Guide draft saved successfully"
        : "Guide created successfully",
      guide,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Create guide error:", error);
    res.status(500).json({ message: "Failed to create guide" });
  }
};

// Get all guides (published only, not drafts)
export const getGuides = async (req, res) => {
  try {
    const { city, state, country, topic, minPrice, maxPrice, search } = req.query;
    // Generous default so the pre-pagination callers (bests, city guides, saved
    // guides) keep getting everything they used to.
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const blockedIds = req.user?.id ? await getBlockedIds(req.user.id) : [];

    const filter = buildGuideQuery({ city, state, country, topic, minPrice, maxPrice, search, blockedIds });

    const [guides, total] = await Promise.all([
      Guide.find(filter)
        .populate("author", "username email profilePicture")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Guide.countDocuments(filter),
    ]);

    res.status(200).json({ guides, total, page });
  } catch (error) {
    console.error("Get guides error:", error);
    res.status(500).json({ message: "Failed to fetch guides" });
  }
};

/**
 * Shared guide filter builder — used by getGuides and the unified /search
 * endpoint so the two can't drift.
 *
 * OR-groups go into `$and` rather than assigning `filter.$or` directly: a bare
 * assignment means the next feature that needs its own OR-group silently
 * clobbers this one.
 */
export function buildGuideQuery({ city, state, country, topic, minPrice, maxPrice, search, blockedIds = [] }) {
  const filter = {
    isDraft: false,
    isActive: true,
    ...(blockedIds.length > 0 ? { author: { $nin: blockedIds } } : {}),
  };

  // Location filters are anchored exact matches, not substrings.
  if (city) filter.city = { $regex: exactCaseInsensitive(city) };
  if (state) filter.cityState = { $regex: exactCaseInsensitive(state) };
  if (country) filter.country = { $regex: exactCaseInsensitive(country) };

  if (topic) filter.topic = topic;
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = parseFloat(minPrice);
    if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
  }

  const andConditions = [];
  if (search) {
    const safe = escapeRegex(String(search));
    andConditions.push({
      $or: [
        { title: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
        { authorName: { $regex: safe, $options: "i" } },
      ],
    });
  }
  if (andConditions.length > 0) filter.$and = andConditions;

  return filter;
}

// Get the top-selling published guides (most purchases, then most views)
export const getTopGuides = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const { city } = req.query;
    const blockedIds = req.user?.id ? await getBlockedIds(req.user.id) : [];

    const match = { isDraft: false, isActive: true };
    if (blockedIds.length > 0) {
      match.author = {
        $nin: blockedIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }
    if (city) {
      const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      match.city = { $regex: new RegExp(`^${esc(city)}$`, "i") };
    }

    const guides = await Guide.aggregate([
      { $match: match },
      { $addFields: { salesCount: { $size: { $ifNull: ["$purchasedBy", []] } } } },
      { $sort: { salesCount: -1, views: -1, createdAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "author",
          foreignField: "_id",
          as: "author",
        },
      },
      { $unwind: "$author" },
      {
        $project: {
          title: 1,
          authorName: 1,
          description: 1,
          price: 1,
          // Without this the home-screen cards fall back to "$" for every
          // seller, whatever currency they actually priced the guide in.
          currency: 1,
          city: 1,
          cityState: 1,
          coverImage: 1,
          topic: 1,
          sections: 1,
          views: 1,
          salesCount: 1,
          createdAt: 1,
          "author._id": 1,
          "author.username": 1,
          "author.email": 1,
          "author.profilePicture": 1,
        },
      },
    ]);

    res.status(200).json({ guides });
  } catch (error) {
    console.error("Get top guides error:", error);
    res.status(500).json({ message: "Failed to fetch top guides" });
  }
};

// Get user's guides (including drafts), each with its sales count.
//
// $size on the in-document array is the cheapest correct count — no $lookup,
// no extra index. The $project exclusion also fixes a real leak: the previous
// bare find() shipped every buyer's ObjectId to the client on every load.
export const getUserGuides = async (req, res) => {
  try {
    const userId = req.user.id;

    const guides = await Guide.aggregate([
      { $match: { author: new mongoose.Types.ObjectId(userId) } },
      { $addFields: { salesCount: { $size: { $ifNull: ["$purchasedBy", []] } } } },
      // Counted off purchasedBy, not the newer `sales` ledger: purchasedBy is
      // complete for guides sold before the ledger existed. Both are dropped
      // from the payload — a list screen has no use for buyer ids, and the
      // money detail belongs to /earnings.
      { $project: { purchasedBy: 0, sales: 0 } },
      { $sort: { createdAt: -1 } },
    ]);

    res.status(200).json({ guides });
  } catch (error) {
    console.error("Get user guides error:", error);
    res.status(500).json({ message: "Failed to fetch user guides" });
  }
};

// Get a specific user's published guides (for their public profile)
export const getUserPublicGuides = async (req, res) => {
  try {
    // The param may be a share slug (`/user/setemil`) rather than an _id —
    // resolve it before it reaches a query, or Mongoose cast-errors into a 500.
    const userId = await resolveUserId(req.params.userId);
    if (!userId) {
      return res.status(200).json({ guides: [] });
    }

    // The support account has no public profile to hang guides off.
    if (isSupportUser(userId)) {
      return res.status(200).json({ guides: [] });
    }

    // Respect blocks in either direction — hide guides from blocked users
    if (req.user?.id) {
      const blockedIds = await getBlockedIds(req.user.id);
      if (blockedIds.some((id) => String(id) === String(userId))) {
        return res.status(200).json({ guides: [] });
      }
    }

    const guides = await Guide.find({
      author: userId,
      isDraft: false,
      isActive: true,
    })
      .populate("author", "username email profilePicture")
      .sort({ createdAt: -1 });

    res.status(200).json({ guides });
  } catch (error) {
    console.error("Get user public guides error:", error);
    res.status(500).json({ message: "Failed to fetch user guides" });
  }
};

// Get a single guide by ID
export const getGuideById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Accept either a Mongo id or a share slug. Routing non-ids to the slug
    // lookup also fixes the old CastError → 500 on arbitrary params.
    const guide = await (mongoose.isValidObjectId(id)
      ? Guide.findById(id)
      : Guide.findOne({ slug: id.toLowerCase() })
    ).populate("author", "username email profilePicture");

    if (!guide) {
      return res.status(404).json({ message: "Guide not found" });
    }

    // Check if user has access to view the guide
    // Owner can always view, others can only view if it's published
    if (guide.isDraft && guide.author._id.toString() !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if user has purchased the guide
    const hasPurchased =
      userId &&
      guide.purchasedBy.some((purchaser) => purchaser.toString() === userId);

    // Increment views only if not the author
    if (guide.author._id.toString() !== userId) {
      guide.views += 1;
      await guide.save();
    }

    const isOwner = userId && guide.author._id.toString() === userId;
    const isSaved =
      userId && (guide.savedBy || []).some((u) => u.toString() === userId);

    res.status(200).json({
      guide,
      hasPurchased,
      isOwner,
      isSaved,
    });
  } catch (error) {
    console.error("Get guide by ID error:", error);
    res.status(500).json({ message: "Failed to fetch guide" });
  }
};

// Update a guide
export const updateGuide = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      title,
      description,
      price,
      city,
      cityState,
      country,
      coverImage,
      topic,
      sections,
      isDraft,
    } = req.body;

    const guide = await Guide.findById(id);

    if (!guide) {
      return res.status(404).json({ message: "Guide not found" });
    }

    // Check if user is the author
    if (guide.author.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You can only edit your own guides" });
    }

    // Same payout gate as creation — otherwise publishing a free guide and then
    // editing a price onto it would walk straight around it.
    if (price !== undefined && parseFloat(price) > 0) {
      const author = await User.findById(userId).select(PAYOUT_ROUTING_FIELDS);
      if (rejectIfCannotSell(res, author)) return;
    }

    // Validate sections if provided
    if (sections) {
      if (
        !Array.isArray(sections) ||
        sections.length === 0 ||
        sections.length > 10
      ) {
        return res
          .status(400)
          .json({ message: "A guide must have between 1 and 10 sections" });
      }

      for (const section of sections) {
        if (!section.title || !section.rank || !section.description) {
          return res
            .status(400)
            .json({
              message: "Each section must have a title, rank, and description",
            });
        }
        if (section.description.length > 3000) {
          return res
            .status(400)
            .json({
              message: "Section description cannot exceed 3000 characters",
            });
        }
      }
    }

    // Content policy filter on text fields being updated
    const fieldsToCheck = [];
    if (title !== undefined) fieldsToCheck.push({ field: "Title", value: title });
    if (description !== undefined) fieldsToCheck.push({ field: "Description", value: description });
    if (sections !== undefined) {
      sections.forEach((s, i) => {
        fieldsToCheck.push({ field: `Section ${i + 1} title`, value: s.title });
        fieldsToCheck.push({ field: `Section ${i + 1} body`, value: s.description });
      });
    }
    if (fieldsToCheck.length > 0) assertClean(fieldsToCheck);

    // Update fields
    if (title !== undefined) guide.title = title;
    if (description !== undefined) guide.description = description;
    if (price !== undefined) guide.price = parseFloat(price);
    if (city !== undefined) guide.city = city;
    if (cityState !== undefined) guide.cityState = cityState;
    if (country !== undefined) guide.country = country;
    if (coverImage !== undefined) guide.coverImage = coverImage;
    if (topic !== undefined) guide.topic = topic;
    if (sections !== undefined)
      guide.sections = sections.map((s) => ({
        title: s.title,
        rank: s.rank,
        description: s.description,
        ...normalizeSectionMedia(s),
      }));
    if (isDraft !== undefined) guide.isDraft = isDraft;

    await guide.save();

    res.status(200).json({
      message: "Guide updated successfully",
      guide,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Update guide error:", error);
    res.status(500).json({ message: "Failed to update guide" });
  }
};

// Delete a guide
export const deleteGuide = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const guide = await Guide.findById(id);

    if (!guide) {
      return res.status(404).json({ message: "Guide not found" });
    }

    // Check if user is the author
    if (guide.author.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You can only delete your own guides" });
    }

    await Guide.findByIdAndDelete(id);

    res.status(200).json({ message: "Guide deleted successfully" });
  } catch (error) {
    console.error("Delete guide error:", error);
    res.status(500).json({ message: "Failed to delete guide" });
  }
};

// Purchase a guide
export const purchaseGuide = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const guide = await Guide.findById(id);

    if (!guide) {
      return res.status(404).json({ message: "Guide not found" });
    }

    // Check if guide is published
    if (guide.isDraft) {
      return res.status(400).json({ message: "Cannot purchase a draft guide" });
    }

    // Check if user is the author
    if (guide.author.toString() === userId) {
      return res
        .status(400)
        .json({ message: "You cannot purchase your own guide" });
    }

    // Check if user has already purchased
    if (guide.purchasedBy.includes(userId)) {
      return res
        .status(400)
        .json({ message: "You have already purchased this guide" });
    }

    // Paid guides must go through Stripe — reject direct purchase
    if (guide.price > 0) {
      return res.status(400).json({
        message: "This guide requires payment. Use the Stripe checkout flow.",
      });
    }

    // Free guide — same fulfillment path as paid purchases (ledger entry with
    // gross 0, plus both-party notifications and emails rendering "Free").
    await fulfillGuide({ guideId: id, userId });

    const updated = await Guide.findById(id);
    res.status(200).json({
      message: "Guide accessed successfully",
      guide: updated,
    });
  } catch (error) {
    console.error("Purchase guide error:", error);
    res.status(500).json({ message: "Failed to purchase guide" });
  }
};

// Toggle saving (bookmarking) a guide for the current user
export const toggleSaveGuide = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const guide = await Guide.findById(id).select("savedBy");
    if (!guide) return res.status(404).json({ message: "Guide not found" });

    const already = guide.savedBy.some((u) => u.toString() === userId);
    if (already) {
      await Guide.updateOne({ _id: id }, { $pull: { savedBy: userId } });
    } else {
      await Guide.updateOne({ _id: id }, { $addToSet: { savedBy: userId } });
    }

    res.status(200).json({ saved: !already });
  } catch (error) {
    console.error("Toggle save guide error:", error);
    res.status(500).json({ message: "Failed to update saved guide" });
  }
};

// Get the guides the current user has saved (bookmarked)
export const getSavedGuides = async (req, res) => {
  try {
    const userId = req.user.id;
    const guides = await Guide.find({
      savedBy: userId,
      isDraft: false,
      isActive: true,
    })
      .populate("author", "username email profilePicture")
      .sort({ createdAt: -1 });

    res.status(200).json({ guides });
  } catch (error) {
    console.error("Get saved guides error:", error);
    res.status(500).json({ message: "Failed to fetch saved guides" });
  }
};

// Get purchased guides for a user
export const getPurchasedGuides = async (req, res) => {
  try {
    const userId = req.user.id;

    const guides = await Guide.find({
      purchasedBy: userId,
      isDraft: false,
      isActive: true,
    })
      .populate("author", "username email profilePicture")
      .sort({ createdAt: -1 });

    res.status(200).json({ guides });
  } catch (error) {
    console.error("Get purchased guides error:", error);
    res.status(500).json({ message: "Failed to fetch purchased guides" });
  }
};

// Get guides by city name
export const getGuidesByCity = async (req, res) => {
  console.log("\n\n🏙️ ========== getGuidesByCity HANDLER CALLED ==========");
  console.log("🏙️ Method:", req.method);
  console.log("🏙️ Path:", req.path);
  console.log("🏙️ Original URL:", req.originalUrl);
  console.log("🏙️ Query:", req.query);
  console.log("🏙️ =====================================================\n\n");
  try {
    // Get city name from query parameter
    const { name, country, state } = req.query;

    if (!name) {
      return res.status(400).json({ message: "City name is required" });
    }

    // Decode URL-encoded city name (e.g., "new-york-city" -> "New York City")
    const decodedCityName = decodeURIComponent(name).replace(/-/g, ' ');

    console.log("✅ Searching for city:", decodedCityName);

    const blockedIds = req.user?.id ? await getBlockedIds(req.user.id) : [];

    // country/state disambiguate same-named cities across countries
    const locationFilter = {};
    if (country) locationFilter.country = { $regex: new RegExp(`^${decodeURIComponent(country)}$`, 'i') };
    if (state) locationFilter.cityState = { $regex: new RegExp(`^${decodeURIComponent(state)}$`, 'i') };

    const guides = await Guide.find({
      city: { $regex: new RegExp(`^${decodedCityName}$`, 'i') },
      ...locationFilter,
      isDraft: false,
      isActive: true,
      ...(blockedIds.length > 0 ? { author: { $nin: blockedIds } } : {}),
    })
      .populate("author", "username email profilePicture")
      .sort({ createdAt: -1 });

    console.log(`📚 Found ${guides.length} guides for ${decodedCityName}`);

    res.status(200).json({ guides });
  } catch (error) {
    console.error("Get guides by city error:", error);
    res.status(500).json({ message: "Failed to fetch guides" });
  }
};

// Get the distinct locations that actually have published guides.
// Powers the "Browse guides by city" list so it reflects real content
// instead of a curated city catalog.
export const getGuideLocations = async (req, res) => {
  try {
    const blockedIds = req.user?.id ? await getBlockedIds(req.user.id) : [];

    const match = { isDraft: false, isActive: true };
    if (blockedIds.length > 0) {
      match.author = {
        $nin: blockedIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    const locations = await Guide.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            city: "$city",
            state: "$cityState",
            country: { $ifNull: ["$country", "United States"] },
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          city: "$_id.city",
          state: "$_id.state",
          country: "$_id.country",
          count: 1,
        },
      },
      { $sort: { country: 1, state: 1, city: 1 } },
    ]);

    res.status(200).json({ locations });
  } catch (error) {
    console.error("Get guide locations error:", error);
    res.status(500).json({ message: "Failed to fetch guide locations" });
  }
};
