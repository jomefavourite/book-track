import type { NextConfig } from "next";
import withPWA from "next-pwa";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {},
  outputFileTracingRoot: path.join(__dirname),
};

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
})(nextConfig);
