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
    // floating bottom-right widget. Labels localized to zh-TW.
    Sentry.feedbackIntegration({
      colorScheme: "system",
      autoInject: false,
      showBranding: false,
      formTitle: "回報問題",
      submitButtonLabel: "送出",
      cancelButtonLabel: "取消",
      nameLabel: "姓名",
      namePlaceholder: "你的名字",
      emailLabel: "Email",
      emailPlaceholder: "你的 email",
      messageLabel: "問題描述",
      messagePlaceholder: "請描述你遇到的問題，越具體越好…",
      isRequiredLabel: "（必填）",
      addScreenshotButtonLabel: "加上截圖",
      removeScreenshotButtonLabel: "移除截圖",
      successMessageText: "感謝你的回報！",
    }),
  ],
});

// Captures App Router navigation transitions as spans
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
