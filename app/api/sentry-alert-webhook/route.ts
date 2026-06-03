import * as Sentry from "@sentry/nextjs";
import { createHmac, timingSafeEqual } from "crypto";
import { type NextRequest } from "next/server";

// Receiving end of the design doc's §5.4 "Alert-Driven" trigger: Sentry fires a
// webhook on a new error / error-rate spike, the Autonomous Metrics Agent picks
// it up here and starts its observe → analyze → act loop. This is the endpoint
// stub — it verifies the signature and acknowledges; the agent hand-off is TODO.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secret = process.env.SENTRY_WEBHOOK_SECRET;

  // Sentry signs the raw body with the integration's client secret (HMAC-SHA256).
  if (secret) {
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const got = request.headers.get("sentry-hook-signature") ?? "";
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return new Response("invalid signature", { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const resource = request.headers.get("sentry-hook-resource") ?? "unknown";
  Sentry.addBreadcrumb({
    category: "sentry.webhook",
    level: "info",
    message: `received ${resource} webhook`,
  });

  // TODO(§5.4): hand `payload` to the Autonomous Metrics Agent (read metrics →
  // LLM analyze → open GitHub issue / PR). For now just acknowledge receipt.
  console.log(`[sentry-webhook] ${resource}`, payload);

  return Response.json({ received: true, resource });
}
