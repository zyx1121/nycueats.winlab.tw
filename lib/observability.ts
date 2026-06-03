import * as Sentry from "@sentry/nextjs";

type AuthedUser = { id: string; email?: string | null };

/**
 * Attach the signed-in employee's identity + role/area to the Sentry scope so
 * events carry "who was affected" instead of an anonymous IP. Powers the
 * affected-user count and per-role triage the autonomous metrics agent reads
 * (design doc §5.4).
 */
export function identifyUser(
  user: AuthedUser,
  roles?: readonly string[] | null,
  areaId?: string | null,
) {
  Sentry.setUser({ id: user.id, email: user.email ?? undefined });
  if (roles && roles.length > 0) Sentry.setTag("user.roles", roles.join(","));
  if (areaId) Sentry.setTag("user.area", areaId);
}

/**
 * Report a failure that the caller handles by returning a graceful `{ error }`.
 * Without this the error never reaches Sentry. Wraps non-Error causes (e.g. a
 * Supabase PostgrestError) in an Error so the event keeps a usable message, and
 * lifts the Postgres error code into a `pg_code` tag for triage.
 */
export function captureActionError(
  cause: unknown,
  ctx: {
    action: string;
    tags?: Record<string, string | undefined>;
    extra?: Record<string, unknown>;
  },
) {
  const pgCode =
    typeof cause === "object" && cause !== null && "code" in cause
      ? String((cause as { code: unknown }).code)
      : undefined;
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === "object" && cause !== null && "message" in cause
        ? String((cause as { message: unknown }).message)
        : `action ${ctx.action} failed`;
  const error = cause instanceof Error ? cause : new Error(message);

  Sentry.captureException(error, {
    tags: { action: ctx.action, ...(pgCode ? { pg_code: pgCode } : {}), ...ctx.tags },
    extra: ctx.extra,
  });
}
