import type { NextConfig } from "next";
import path from "path";

// No next-pwa: its Workbox service worker cached pages and App Router payloads,
// which served mixed app versions after deploys. The app's only service worker
// is the hand-written, push-only public/sw.js (registered from Settings).
const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
