import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { addBreadcrumbMock } = vi.hoisted(() => ({ addBreadcrumbMock: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ addBreadcrumb: addBreadcrumbMock }));

import { POST } from "@/app/api/sentry-alert-webhook/route";

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/sentry-alert-webhook", {
    method: "POST",
    body,
    headers,
  });
}

describe("sentry alert webhook route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    addBreadcrumbMock.mockReset();
  });

  it("rejects requests with an invalid signature when a secret is configured", async () => {
    vi.stubEnv("SENTRY_WEBHOOK_SECRET", "secret");

    const res = await POST(request("{}", { "sentry-hook-signature": "bad" }) as never);

    await expect(res.text()).resolves.toBe("invalid signature");
    expect(res.status).toBe(401);
    expect(addBreadcrumbMock).not.toHaveBeenCalled();
  });

  it("rejects invalid json after signature verification", async () => {
    vi.stubEnv("SENTRY_WEBHOOK_SECRET", "secret");
    const raw = "{";
    const signature = createHmac("sha256", "secret").update(raw).digest("hex");

    const res = await POST(request(raw, { "sentry-hook-signature": signature }) as never);

    await expect(res.text()).resolves.toBe("invalid json");
    expect(res.status).toBe(400);
  });

  it("acknowledges a valid webhook and records a breadcrumb", async () => {
    const res = await POST(
      request(JSON.stringify({ id: "evt-1" }), { "sentry-hook-resource": "issue" }) as never,
    );

    await expect(res.json()).resolves.toEqual({ received: true, resource: "issue" });
    expect(addBreadcrumbMock).toHaveBeenCalledWith({
      category: "sentry.webhook",
      level: "info",
      message: "received issue webhook",
    });
  });
});
