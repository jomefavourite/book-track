import type { NextConfig } from "next";
import path from "path";

// No next-pwa: its Workbox service worker cached pages and App Router payloads,
// which served mixed app versions after deploys. The app's only service worker
// is the hand-written, push-only public/sw.js (registered from Settings).
const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingRoot: path.join(__dirname),

  // Security headers recommended by the Next.js PWA guide
  // (node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Never cache the service worker, so installed apps update promptly.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
