/** @type {import('next').NextScript} */
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const nextConfig = {
  allowedDevOrigins: [
    "app.conkudaden.online",
    "api.conkudaden.online",
    "*.conkudaden.online",
    "localhost:3000"
  ],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
