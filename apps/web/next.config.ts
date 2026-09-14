import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The shared UI package exports TypeScript source rather than prebuilt JavaScript.
  transpilePackages: ["@coursemap/ui"],
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
