import { BASE_URL } from '../constants/constants';
import * as SecureStore from 'expo-secure-store';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchCities() {
  const res = await fetch(`${BASE_URL}/cities`);
  return res.json();
}

// ─── Location pickers (CSC API via server proxy) ─────────────────────────────
export async function fetchCountries() {
  const res = await fetch(`${BASE_URL}/locations/countries`);
  const data = await res.json();
  return data.countries || [];
}

export async function fetchStatesByCountry(countryIso: string) {
  const res = await fetch(`${BASE_URL}/locations/countries/${countryIso}/states`);
  const data = await res.json();
  return data.states || [];
}

export async function fetchCitiesByState(countryIso: string, stateIso: string) {
  const res = await fetch(
    `${BASE_URL}/locations/countries/${countryIso}/states/${stateIso}/cities`
  );
  const data = await res.json();
  return data.cities || [];
}

// Locations that actually have published guides (for browse)
export async function fetchGuideLocations() {
  const res = await fetch(`${BASE_URL}/guide/locations`, {
    headers: await authHeaders(),
  });
  const data = await res.json();
  return data.locations || [];
}

interface LocationQuery {
  country?: string;
  state?: string;
  city?: string;
}

function locationQueryString(params: LocationQuery) {
  const qs = new URLSearchParams();
  if (params.country) qs.append("country", params.country);
  if (params.state) qs.append("state", params.state);
  if (params.city) qs.append("city", params.city);
  return qs.toString();
}

// Vendors for the carousel browse view (flat, populated, optional location filter)
export async function fetchVendorsBrowse(params: LocationQuery = {}) {
  const res = await fetch(`${BASE_URL}/vendors/browse?${locationQueryString(params)}`, {
    headers: await authHeaders(),
  });
  const data = await res.json();
  return data.vendors || [];
}

// Published guides for the carousel browse view (optional location filter)
export async function fetchGuidesAll(params: LocationQuery = {}) {
  const res = await fetch(`${BASE_URL}/guides/all?${locationQueryString(params)}`, {
    headers: await authHeaders(),
  });
  const data = await res.json();
  return data.guides || [];
}

// Toggle saving (bookmarking) a guide — returns { saved: boolean }
export async function toggleGuideSave(guideId: string) {
  const res = await fetch(`${BASE_URL}/guides/${guideId}/save`, {
    method: "POST",
    headers: await authHeaders(),
  });
  return res.json();
}

// The current user's saved (bookmarked) guides
export async function fetchSavedGuides() {
  const res = await fetch(`${BASE_URL}/guides/saved`, {
    headers: await authHeaders(),
  });
  const data = await res.json();
  return data.guides || [];
}

export async function fetchVendorTypes() {
  const res = await fetch(`${BASE_URL}/vendor-types`);
  return res.json();
}

export async function fetchVendors(cityId: string, vendorTypeId: string) {
  const res = await fetch(
    `${BASE_URL}/cities/${cityId}/vendors/${vendorTypeId}`,
    { headers: await authHeaders() }
  );
  return res.json();
}

export async function fetchVendorServices(vendorId: string, categoryId?: string) {
  const qs = categoryId ? `?category=${categoryId}` : "";
  const res = await fetch(`${BASE_URL}/vendors/${vendorId}/services${qs}`, {
    headers: await authHeaders(),
  });
  return res.json();
}

// Top-level catalogue categories for a vendor's public storefront.
export async function fetchVendorCategories(vendorId: string) {
  const res = await fetch(`${BASE_URL}/vendors/${vendorId}/categories`, {
    headers: await authHeaders(),
  });
  return res.json();
}
