import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Guest booking pages can be embedded in client websites (Framer etc.)
      { source: "/:slug", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] },
      { source: "/:slug/3d", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] },
      // The staff screen must never be embedded elsewhere
      { source: "/:slug/host", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
