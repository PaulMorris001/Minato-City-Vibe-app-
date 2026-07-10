import express from "express";
import {
  getAllCities,
  getVendorTypesByCity,
  getVendorsByCityAndType,
  browseVendors,
  getVendorById,
  getAllVendorTypes,
  searchVendors,
  rateVendor,
  getVendorReviews,
  getExternalVendorById,
} from "../controllers/vendors.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/cities", getAllCities);
router.get("/vendor-types", getAllVendorTypes);
router.get("/cities/:cityId/vendor-types", getVendorTypesByCity);
router.get("/cities/:cityId/vendors/:vendorTypeId", getVendorsByCityAndType);
router.get("/vendors/search", searchVendors);
router.get("/vendors/browse", browseVendors);
router.get("/external-vendors/:id", getExternalVendorById);
router.get("/vendors/:vendorId", getVendorById);
router.post("/vendors/:vendorId/rate", authenticate, rateVendor);
router.get("/vendors/:vendorId/reviews", authenticate, getVendorReviews);

export default router;
