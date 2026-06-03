import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  sendDefaultPii: true,

  // Full sampling in dev, 10% in production
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Replay 10% of sessions and 100% of sessions with an error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
    // Feedback form wired to a custom Bug button in the header (see
    // components/feedback-button.tsx); autoInject disables the default
    // floating bottom-right widget.
    Sentry.feedbackIntegration({ colorScheme: "system", autoInject: false }),
  ],
});

// Captures App Router navigation transitions as spans
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
