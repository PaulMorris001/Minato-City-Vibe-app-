import Guide, { guideTopicsList } from "../models/guide.model.js";
import User from "../models/user.model.js";
import { City } from "../models/vendor.model.js";
import mongoose from "mongoose";

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
    const { title, description, price, city, topic, sections, isDraft } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!title || !description || price === undefined || !city || !topic || !sections) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // Validate city ID format
    if (!mongoose.Types.ObjectId.isValid(city)) {
      return res.status(400).json({
        message: "Invalid city ID format. Please select a city from the list.",
        hint: "City must be a valid ID, not a city name. Use GET /api/guides/cities to fetch available cities."
      });
    }

    // Check if city exists in database
    const cityExists = await City.findById(city);
    if (!cityExists) {
      return res.status(400).json({
        message: "City not found in database. Please select a valid city from the list.",
        hint: "Use GET /api/guides/cities to fetch available cities."
      });
    }

    // Validate sections
    if (!Array.isArray(sections) || sections.length === 0 || sections.length > 10) {
      return res.status(400).json({ message: "A guide must have between 1 and 10 sections" });
    }

    // Validate each section
    for (const section of sections) {
      if (!section.title || !section.rank || !section.description) {
        return res.status(400).json({ message: "Each section must have a title, rank, and description" });
      }
      if (section.description.length > 3000) {
        return res.status(400).json({ message: "Section description cannot exceed 3000 characters" });
      }
    }

    // Get author name
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const guide = new Guide({
      title,
      author: userId,
      authorName: user.username,
      description,
      price: parseFloat(price),
      city,
      topic,
      sections,
      isDraft: isDraft || false
    });

    await guide.save();

    // Populate city data before returning
    await guide.populate("city", "name state");

    res.status(201).json({
      message: isDraft ? "Guide draft saved successfully" : "Guide created successfully",
      guide
    });
  } catch (error) {
    console.error("Create guide error:", error);
    res.status(500).json({ message: "Failed to create guide" });
  }
};

// Get all guides (published only, not drafts)
export const getGuides = async (req, res) => {
  try {
    const { city, topic, minPrice, maxPrice, search } = req.query;

    const filter = { isDraft: false, isActive: true };

    // Filter by city ID if provided
    if (city) filter.city = city;
    if (topic) filter.topic = topic;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { authorName: { $regex: search, $options: 'i' } }
      ];
    }

    const guides = await Guide.find(filter)
      .populate("author", "username email profilePicture")
      .populate("city", "name state")
      .sort({ createdAt: -1 });

    res.status(200).json({ guides });
  } catch (error) {
    console.error("Get guides error:", error);
    res.status(500).json({ message: "Failed to fetch guides" });
  }
};

// Get user's guides (including drafts)
export const getUserGuides = async (req, res) => {
  try {
    const userId = req.user.id;

    const guides = await Guide.find({ author: userId })
      .populate("city", "name state")
      .sort({ createdAt: -1 });

    res.status(200).json({ guides });
  } catch (error) {
    console.error("Get user guides error:", error);
    res.status(500).json({ message: "Failed to fetch user guides" });
  }
};

// Get a single guide by ID
export const getGuideById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const guide = await Guide.findById(id)
      .populate("author", "username email profilePicture")
      .populate("city", "name state");

    if (!guide) {
      return res.status(404).json({ message: "Guide not found" });
    }

    // Check if user has access to view the guide
    // Owner can always view, others can only view if it's published
    if (guide.isDraft && guide.author._id.toString() !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if user has purchased the guide
    const hasPurchased = userId && guide.purchasedBy.some(
      purchaser => purchaser.toString() === userId
    );

    // Increment views only if not the author
    if (guide.author._id.toString() !== userId) {
      guide.views += 1;
      await guide.save();
    }

    const isOwner = userId && guide.author._id.toString() === userId;

    res.status(200).json({
      guide,
      hasPurchased,
      isOwner
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
    const { title, description, price, city, topic, sections, isDraft } = req.body;

    const guide = await Guide.findById(id);

    if (!guide) {
      return res.status(404).json({ message: "Guide not found" });
    }

    // Check if user is the author
    if (guide.author.toString() !== userId) {
      return res.status(403).json({ message: "You can only edit your own guides" });
    }

    // Validate city if provided
    if (city !== undefined) {
      // Validate city ID format
      if (!mongoose.Types.ObjectId.isValid(city)) {
        return res.status(400).json({
          message: "Invalid city ID format. Please select a city from the list.",
          hint: "City must be a valid ID, not a city name. Use GET /api/guides/cities to fetch available cities."
        });
      }

      // Check if city exists in database
      const cityExists = await City.findById(city);
      if (!cityExists) {
        return res.status(400).json({
          message: "City not found in database. Please select a valid city from the list.",
          hint: "Use GET /api/guides/cities to fetch available cities."
        });
      }
    }

    // Validate sections if provided
    if (sections) {
      if (!Array.isArray(sections) || sections.length === 0 || sections.length > 10) {
        return res.status(400).json({ message: "A guide must have between 1 and 10 sections" });
      }

      for (const section of sections) {
        if (!section.title || !section.rank || !section.description) {
          return res.status(400).json({ message: "Each section must have a title, rank, and description" });
        }
        if (section.description.length > 3000) {
          return res.status(400).json({ message: "Section description cannot exceed 3000 characters" });
        }
      }
    }

    // Update fields
    if (title !== undefined) guide.title = title;
    if (description !== undefined) guide.description = description;
    if (price !== undefined) guide.price = parseFloat(price);
    if (city !== undefined) guide.city = city;
    if (topic !== undefined) guide.topic = topic;
    if (sections !== undefined) guide.sections = sections;
    if (isDraft !== undefined) guide.isDraft = isDraft;

    await guide.save();

    // Populate city data before returning
    await guide.populate("city", "name state");

    res.status(200).json({
      message: "Guide updated successfully",
      guide
    });
  } catch (error) {
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
      return res.status(403).json({ message: "You can only delete your own guides" });
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
      return res.status(400).json({ message: "You cannot purchase your own guide" });
    }

    // Check if user has already purchased
    if (guide.purchasedBy.includes(userId)) {
      return res.status(400).json({ message: "You have already purchased this guide" });
    }

    // Add user to purchasedBy array
    guide.purchasedBy.push(userId);
    await guide.save();

    res.status(200).json({
      message: "Guide purchased successfully",
      guide
    });
  } catch (error) {
    console.error("Purchase guide error:", error);
    res.status(500).json({ message: "Failed to purchase guide" });
  }
};

// Get purchased guides for a user
export const getPurchasedGuides = async (req, res) => {
  try {
    const userId = req.user.id;

    const guides = await Guide.find({
      purchasedBy: userId,
      isDraft: false,
      isActive: true
    })
      .populate("author", "username email profilePicture")
      .populate("city", "name state")
      .sort({ createdAt: -1 });

    res.status(200).json({ guides });
  } catch (error) {
    console.error("Get purchased guides error:", error);
    res.status(500).json({ message: "Failed to fetch purchased guides" });
  }
};

// Get guides by city ID
export const getGuidesByCity = async (req, res) => {
  console.log("\n\n🏙️ ========== getGuidesByCity HANDLER CALLED ==========");
  console.log("🏙️ Method:", req.method);
  console.log("🏙️ Path:", req.path);
  console.log("🏙️ Original URL:", req.originalUrl);
  console.log("🏙️ Params:", req.params);
  console.log("🏙️  getGuidesByCity called with cityId:", req.params.cityId);
  console.log("🏙️ =====================================================\n\n");
  try {
    const { cityId } = req.params;

    // Verify city exists
    const city = await City.findById(cityId);
    if (!city) {
      console.log("❌ City not found:", cityId);
      return res.status(404).json({ message: "City not found" });
    }

    console.log("✅ Found city:", city.name);

    const guides = await Guide.find({
      city: cityId,
      isDraft: false,
      isActive: true
    })
      .populate("author", "username email profilePicture")
      .populate("city", "name state")
      .sort({ createdAt: -1 });

    console.log(`📚 Found ${guides.length} guides for ${city.name}`);

    res.status(200).json({ guides, city });
  } catch (error) {
    console.error("Get guides by city error:", error);
    res.status(500).json({ message: "Failed to fetch guides" });
  }
};
