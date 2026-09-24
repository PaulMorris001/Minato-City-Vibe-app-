import { applyPriceVisibility } from "../utils/eventPricing.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";

export const getFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: "favorites",
      populate: { path: "createdBy", select: "username email profilePicture" },
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const events = user.favorites.map((event) => ({
      ...applyPriceVisibility(event.toObject()),
      isFavorited: true,
    }));

    res.json({ events });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const addFavorite = async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { favorites: eventId },
    });

    res.json({ message: "Added to favorites" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const removeFavorite = async (req, res) => {
  try {
    const { eventId } = req.params;

    await User.findByIdAndUpdate(req.user.id, {
      $pull: { favorites: eventId },
    });

    res.json({ message: "Removed from favorites" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
