import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  async rewrites() {
    const isProd = process.env.NODE_ENV === "production";
    const backendBaseUrl =
      process.env.BACKEND_INTERNAL_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      (isProd ? "http://backend:8000" : "http://localhost:8000");
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
