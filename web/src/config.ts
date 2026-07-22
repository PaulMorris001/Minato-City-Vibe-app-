// Base URL of the OurCityvibe backend API (without the trailing `/api` — the
// api helper appends it per call).
//
// Environment-aware, mirroring the mobile app (mobile/constants/constants.ts):
//   1. An explicit `VITE_API_URL` always wins — handy for testing prod from a
//      dev build, pointing at a staging box, or using a LAN IP from another
//      device.
//   2. `vite dev` (import.meta.env.DEV) → your local server on :3100
//      (same port the mobile dev build expects).
//   3. Production build (`vite build`) → the deployed backend on Render.
const override = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE =
  override ||
  (import.meta.env.DEV
    ? "http://localhost:3100"
    : "https://api.ourcityvibe.com");
