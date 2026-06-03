import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "xgbxjkvatffsjqmgtmwe.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "zyx1121",
  project: "nycueats",

  // Source map upload token (set SENTRY_AUTH_TOKEN in CI / .env.sentry-build-plugin)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider set of client source files for better stack traces
  widenClientFileUpload: true,

  // Route Sentry requests through the app to bypass ad-blockers
  tunnelRoute: "/monitoring",

  // Suppress SDK build logs except in CI
  silent: !process.env.CI,
});
