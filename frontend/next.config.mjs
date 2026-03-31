import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: "http://127.0.0.1:8011/:path*",
      },
    ];
  },
};

export default nextConfig;
