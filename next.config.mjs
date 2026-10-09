import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    ...(process.env.BETTER_AUTH_URL ? [new URL(process.env.BETTER_AUTH_URL).hostname] : []),
  ],
  devIndicators: false,
  experimental: { cpus: 2 },
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  serverExternalPackages: ["@dbos-inc/dbos-sdk", "@dbos-inc/drizzle-datasource"],
  ...(process.env.NEXT_TSCONFIG_PATH
    ? { typescript: { tsconfigPath: process.env.NEXT_TSCONFIG_PATH } }
    : {}),
};

export default withNextIntl(nextConfig);
