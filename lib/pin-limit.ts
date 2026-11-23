type Bucket = { count: number; until: number };
export class PinLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(private readonly capacity = 10000) {}
  reserve(users: string[], ip?: string) {
    const now = Date.now();
    for (const [key, bucket] of this.buckets)
      if (bucket.until <= now) this.buckets.delete(key);
    const userKeys = users.map((id) => 'user:' + id),
      ipKey = 'ip:' + ip;
    const keys = [...new Set([...userKeys, ...(ip ? [ipKey] : [])])];
    if (
      keys.some(
        (k) => (this.buckets.get(k)?.count ?? 0) >= (k === ipKey ? 20 : 5),
      )
    )
      return null;
    const entries = keys.map((key) => {
      const bucket = this.buckets.get(key) ?? {
        count: 0,
        until: now + 15 * 60 * 1000,
      };
      bucket.count++;
      this.buckets.delete(key);
      while (this.buckets.size >= this.capacity) {
        const oldest = this.buckets.keys().next().value;
        if (oldest === undefined) break;
        this.buckets.delete(oldest);
      }
      this.buckets.set(key, bucket);
      return { key, bucket };
    });
    return () => {
      for (const { key, bucket } of entries)
        if (this.buckets.get(key) === bucket) {
          if (key === ipKey) bucket.count = Math.max(0, bucket.count - 1);
          else this.buckets.delete(key);
        }
    };
  }
  clear() {
    this.buckets.clear();
  }
}
export const pinLimiter = new PinLimiter();
export const ownerPinLimiter = new PinLimiter();
export const invalidPinLimiter = new PinLimiter(1);
export const pinLockMessage =
  'Thử PIN quá nhiều lần. Vui lòng chờ 15 phút rồi thử lại.';
export function clientIP(headers: Headers, socketAddress?: string) {
  if (process.env.TRUST_PROXY !== 'true') return socketAddress;
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    socketAddress
  )?.slice(0, 64);
}
