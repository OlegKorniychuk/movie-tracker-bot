export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await fn(item);
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}
