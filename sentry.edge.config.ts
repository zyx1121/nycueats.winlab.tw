import * as Sentry from "@sentry/nextjs";

// Edge runtime config — also covers proxy.ts, which runs on the edge
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  sendDefaultPii: true,

  // Full sampling in dev, 10% in production
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
