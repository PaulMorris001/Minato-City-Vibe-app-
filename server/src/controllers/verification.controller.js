import { uploadBase64Image } from "../services/image.service.js";
import VerificationRequest from "../models/verification.model.js";

export async function submitVerification(req, res) {
  const { documentImage } = req.body;

  try {
    if (!documentImage) {
      return res.status(400).json({ message: "Document image is required" });
    }

    // Upload image to Cloudinary
    let documentImageUrl = documentImage;
    if (documentImage.startsWith("data:image")) {
      const result = await uploadBase64Image(documentImage, "verifications");
      documentImageUrl = result.url;
    }

    // Upsert — one request per user (resubmit resets status to pending)
    const request = await VerificationRequest.findOneAndUpdate(
      { user: req.user.id },
      {
        documentImageUrl,
        status: "pending",
        reviewNotes: "",
        reviewedAt: undefined,
        reviewedBy: undefined,
      },
      { upsert: true, new: true }
    );

    res.json({ status: request.status, submittedAt: request.updatedAt });
  } catch (error) {
    res.status(400).json({ message: "Error submitting verification", details: error.message });
  }
}

export async function getVerificationStatus(req, res) {
  try {
    const request = await VerificationRequest.findOne({ user: req.user.id }).lean();

    if (!request) {
      return res.json({ status: "none" });
    }

    res.json({
      status: request.status,
      documentImageUrl: request.documentImageUrl,
      reviewNotes: request.reviewNotes,
      submittedAt: request.updatedAt,
    });
  } catch (error) {
    res.status(400).json({ message: "Error fetching verification status", details: error.message });
  }
}
