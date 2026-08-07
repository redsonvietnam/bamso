import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Standalone output is heavy on RAM (4-8+ GB). Only enable for Docker/production builds.
  // Set environment variable NEXT_BUILD_STANDALONE=1 for production/Docker builds.
  output: process.env.NEXT_BUILD_STANDALONE ? 'standalone' : undefined,
  // Allow HMR/dev resources from any origin for ngrok/local IP testing
  allowedDevOrigins: ['*', '192.168.1.148'],
  serverExternalPackages: ['ioredis'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.qrserver.com' },
    ],
  },
};

export default nextConfig;
