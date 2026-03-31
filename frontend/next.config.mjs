import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  async rewrites() {
    const backendBaseUrl =
      process.env.BACKEND_INTERNAL_URL?.trim() || "http://backend:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendBaseUrl}/api/:path*`,
      },
      {
        source: "/health/:path*",
        destination: `${backendBaseUrl}/health/:path*`,
      },
    ];
  },
};

export default nextConfig;
