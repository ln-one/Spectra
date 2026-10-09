import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    ...(process.env.BETTER_AUTH_URL ? [new URL(process.env.BETTER_AUTH_URL).hostname] : []),
  ],
  devIndicators: false,
  experimental: {
    cpus: process.env.CLOUDSTUDIO_WEBPACK_LOW_MEMORY === "true" ? 1 : 2,
    webpackMemoryOptimizations: true,
  },
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  serverExternalPackages: [
    "@dbos-inc/dbos-sdk",
    "@dbos-inc/drizzle-datasource",
    "@opentelemetry/exporter-trace-otlp-proto",
    "@opentelemetry/instrumentation-pino",
    "@opentelemetry/sdk-node",
  ],
  ...(process.env.CLOUDSTUDIO_WEBPACK_FALLBACK === "true" ||
  process.env.CLOUDSTUDIO_WEBPACK_LOW_MEMORY === "true"
    ? {
        webpack(config, { dev }) {
          if (dev && process.env.CLOUDSTUDIO_WEBPACK_LOW_MEMORY === "true") {
            config.cache = false;
            config.parallelism = 1;
          }
          if (process.env.CLOUDSTUDIO_WEBPACK_FALLBACK === "true") {
            config.resolve.fallback = { ...config.resolve.fallback, stream: false };
          }
          return config;
        },
      }
    : {}),
  ...(process.env.NEXT_TSCONFIG_PATH || process.env.CLOUDSTUDIO_SKIP_BUILD_TYPECHECK === "true"
    ? {
        typescript: {
          ...(process.env.NEXT_TSCONFIG_PATH
            ? { tsconfigPath: process.env.NEXT_TSCONFIG_PATH }
            : {}),
          ...(process.env.CLOUDSTUDIO_SKIP_BUILD_TYPECHECK === "true"
            ? { ignoreBuildErrors: true }
            : {}),
        },
      }
    : {}),
};

export default withNextIntl(nextConfig);
