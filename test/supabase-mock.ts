import { vi } from "vitest";

/**
 * Shared Supabase mock for Server Action unit tests.
 *
 * Models the PostgREST query builder as a thenable object so both terminal
 * forms work: `.single()` / `.maybeSingle()` and bare `await from(...).update()`.
 * `from(table)` consumes one expectation from an ordered queue, so a test
 * declares the exact table-access sequence an action is expected to perform
 * (including the `profiles` read inside `requireRole`).
 */

export type QueryResult = { data?: unknown; error?: unknown };
export type FromExpectation = { table: string; result?: QueryResult };
export type MutationOp = "insert" | "update" | "upsert" | "delete";
export type MutationCapture = { table: string; op: MutationOp; payload?: unknown };

const PASSTHROUGH = [
  "select",
  "eq",
  "neq",
  "in",
  "is",
  "gte",
  "lte",
  "order",
  "limit",
] as const;

const MUTATIONS: MutationOp[] = ["insert", "update", "upsert", "delete"];

export function createSupabaseMock({
  user,
  expectations,
  invokeResult,
}: {
  user: { id: string } | null;
  expectations: FromExpectation[];
  invokeResult?: QueryResult;
}) {
  const queue = [...expectations];
  const mutations: MutationCapture[] = [];
  const fromOrder: string[] = [];

  function makeBuilder(result: QueryResult, table: string) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of PASSTHROUGH) builder[m] = vi.fn(() => builder as never);
    for (const op of MUTATIONS) {
      builder[op] = vi.fn((payload?: unknown) => {
        mutations.push({ table, op, payload });
        return builder as never;
      });
    }
    builder.single = vi.fn(async () => result);
    builder.maybeSingle = vi.fn(async () => result);
    (builder as unknown as { then: (r: (v: QueryResult) => void) => Promise<void> }).then = (
      resolve,
    ) => Promise.resolve(result).then(resolve);
    return builder;
  }

  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from: vi.fn((table: string) => {
      const exp = queue.shift();
      if (!exp) throw new Error(`Unexpected from(${table}) — expectation queue is empty`);
      if (exp.table !== table) {
        throw new Error(`Expected from(${exp.table}), got from(${table})`);
      }
      fromOrder.push(table);
      return makeBuilder(exp.result ?? {}, table);
    }),
    functions: {
      invoke: vi.fn(async () => invokeResult ?? { data: { results: [] }, error: null }),
    },
  };

  return { client, mutations, fromOrder };
}

/** `requireRole(role)` reads `profiles.role`; this is the expectation it consumes. */
export function roleProfile(...roles: string[]): FromExpectation {
  return { table: "profiles", result: { data: { role: roles } } };
}
