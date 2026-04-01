import type { NextConfig } from "next";

const backendBaseURL = process.env.BITMAGNET_INTERNAL_API_BASE_URL || "http://localhost:3333";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (process.env.NEXT_PUBLIC_BITMAGNET_API_BASE_URL) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${backendBaseURL}/api/:path*`
      },
      {
        source: "/graphql",
        destination: `${backendBaseURL}/graphql`
      }
    ];
  }
};

export default nextConfig;
