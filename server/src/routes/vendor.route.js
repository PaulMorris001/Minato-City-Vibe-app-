import express from "express";
import {
  getAllCities,
  getVendorTypesByCity,
  getVendorsByCityAndType,
  browseVendors,
  getVendorById,
  getAllVendorTypes,
  searchVendors,
  getTopVendors,
  rateVendor,
  getVendorReviews,
} from "../controllers/vendors.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/cities", getAllCities);
router.get("/vendor-types", getAllVendorTypes);
router.get("/cities/:cityId/vendor-types", getVendorTypesByCity);
router.get("/cities/:cityId/vendors/:vendorTypeId", getVendorsByCityAndType);
router.get("/vendors/search", searchVendors);
router.get("/vendors/browse", browseVendors);
// Must stay above /vendors/:vendorId — "top" would otherwise be read as an id.
router.get("/vendors/top", getTopVendors);
router.get("/vendors/:vendorId", getVendorById);
router.post("/vendors/:vendorId/rate", authenticate, rateVendor);
router.get("/vendors/:vendorId/reviews", authenticate, getVendorReviews);

export default router;
