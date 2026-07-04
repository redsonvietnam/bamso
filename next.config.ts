import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Standalone output is heavy on RAM (4-8+ GB). Only enable for Docker/production builds.
  // Set environment variable NEXT_BUILD_STANDALONE=1 for production/Docker builds.
  output: process.env.NEXT_BUILD_STANDALONE ? 'standalone' : undefined,
  // Allow HMR/dev resources from LAN IP for development
  allowedDevOrigins: ['192.168.1.148', '192.168.1.149', '192.168.1.150', 'localhost'],
  serverExternalPackages: ['ioredis'],
};

export default nextConfig;
