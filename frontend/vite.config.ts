import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, proxy API + auth routes to the Flask backend on :5001. AUTH0_CALLBACK_URL in .env must
// point at :5173 (this server), NOT :5001 — Auth0 redirects the browser there directly (it's an
// absolute URL, so the proxy can't help), and only :5173 is where the SPA actually lives. The
// callback response then flows back through this proxy to Flask, keeping the session cookie
// same-origin with the SPA.
// BACKEND_URL overrides the Flask target (e.g. when :5001 is taken by another local app).
// `process` is declared here rather than pulling in @types/node just for this one lookup.
declare const process: { env: Record<string, string | undefined> };
const backend = process.env.BACKEND_URL ?? "http://localhost:5001";

export default defineConfig({
  // base is passed on the CLI in prod: `vite build --base=/match/`. Defaults to root for dev.
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/login": backend,
      "/logout": backend,
      "/callback": backend,
      "/health": backend,
    },
  },
  build: { outDir: "dist" },
});
