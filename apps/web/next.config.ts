import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Revisiting a page within five minutes reuses the browser's copy. Plan
  // mutations revalidate the layout, which drops these copies straight away.
  experimental: { staleTimes: { dynamic: 300, static: 300 } },
  // The shared UI package exports TypeScript source rather than prebuilt JavaScript.
  transpilePackages: ["@coursemap/ui"],
  // CI browser shards rebuild source the Route gate build has already type-checked.
  typescript: {
    ignoreBuildErrors: process.env.COURSEMAP_SKIP_BUILD_TYPECHECK === "1",
  },
  // Repository-owned instructions take precedence over Next.js-generated agent guides.
  agentRules: false,
  // The local preview and test scripts bind to this loopback origin.
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [
      {
        source: "/auth/sign-in",
        destination: "/login",
        permanent: true,
      },
      {
        source: "/auth/sign-up",
        destination: "/signup",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
