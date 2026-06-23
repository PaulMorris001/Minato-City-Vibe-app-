import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Marketing + legal site for CityVibe (www.ourcityvibe.com).
// Builds to static files in dist/ for upload to Hostinger.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
});
