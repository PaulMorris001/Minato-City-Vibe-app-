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

export async function fetchVendorServices(vendorId: string) {
  const res = await fetch(`${BASE_URL}/vendors/${vendorId}/services`, {
    headers: await authHeaders(),
  });
  return res.json();
}
