import express from "express";
import {
  getAllCities,
  getVendorTypesByCity,
  getVendorsByCityAndType,
  getAllVendorTypes,
  searchVendors,
} from "../controllers/vendors.controller.js";

const router = express.Router();

router.get("/cities", getAllCities);
router.get("/vendor-types", getAllVendorTypes);
router.get("/cities/:cityId/vendor-types", getVendorTypesByCity);
router.get("/cities/:cityId/vendors/:vendorTypeId", getVendorsByCityAndType);
router.get("/vendors/search", searchVendors);

export default router;
