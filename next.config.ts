import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

// Content-Security-Policy. App chỉ dùng nguồn same-origin (SSE, /api/tts, API)
// ngoài ảnh QR từ api.qrserver.com. Dev cần 'unsafe-eval' cho React HMR.
const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://api.qrserver.com;
    font-src 'self' data:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    connect-src 'self';
`;

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
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader.replace(/\s{2,}/g, ' ').trim(),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
