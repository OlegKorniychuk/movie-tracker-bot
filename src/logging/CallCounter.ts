export class CallCounter {
  private count = 0;

  track<T>(fn: () => Promise<T>): Promise<T> {
    this.count++;
    return fn();
  }

  get value(): number {
    return this.count;
  }
}
