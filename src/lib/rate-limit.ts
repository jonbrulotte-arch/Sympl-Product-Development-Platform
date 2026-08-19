// Minimal in-memory rate limiter for login attempts. Suitable for the
// single-instance self-hosted deployment this app targets; a multi-instance
// deployment would need a shared store (Redis) instead.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 3;

function sweep() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function isLoginBlocked(key: string): boolean {
  const bucket = buckets.get(key);
  if (!bucket) return false;
  if (bucket.resetAt <= Date.now()) {
    buckets.delete(key);
    return false;
  }
  return bucket.count >= MAX_FAILURES;
}

export function recordLoginFailure(key: string): void {
  if (buckets.size > 10_000) sweep(); // bound memory under abuse
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    bucket.count++;
  }
}

export function clearLoginFailures(key: string): void {
  buckets.delete(key);
}

// ---------------------------------------------------------------------------
// Generic reusable rate limiter
// ---------------------------------------------------------------------------

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private maxRequests: number;
  private windowMs: number;

  constructor(opts: { maxRequests: number; windowMs: number }) {
    this.maxRequests = opts.maxRequests;
    this.windowMs = opts.windowMs;
  }

  private sweep() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  /** Returns true when the request should be rejected. */
  isLimited(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size > 10_000) this.sweep();
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return false;
    }
    bucket.count++;
    return bucket.count > this.maxRequests;
  }
}
