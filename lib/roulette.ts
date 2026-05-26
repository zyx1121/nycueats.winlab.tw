/**
 * Pick a uniformly random element. `rand` is injectable so the choice is
 * deterministic in tests. Returns null for an empty pool.
 */
export function pickRandomItem<T>(items: T[], rand: () => number = Math.random): T | null {
  if (items.length === 0) return null;
  const index = Math.min(items.length - 1, Math.floor(rand() * items.length));
  return items[index];
}
