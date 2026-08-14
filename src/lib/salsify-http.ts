// Every Salsify call goes through here.
//
// Node's fetch keeps connections alive and pools them. When Salsify closes an
// idle socket that the pool still considers usable, the next request on it dies
// with a bare `TypeError: fetch failed` — the real reason sits on `err.cause`.
// That shows up as a handful of products failing at random in an otherwise
// healthy sync, and it clears on a retry because the retry gets a fresh socket.
//
// So: retry transient failures, put a ceiling on how long any one call can
// hang, and never surface "fetch failed" without the cause that explains it.

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

// Socket-level failures worth another attempt. Anything else (a bad URL, a
// malformed request) would fail identically on a retry.
const RETRYABLE_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ECONNABORTED",
  "EAI_AGAIN", "ENOTFOUND", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT",
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with jitter, so a batch doesn't retry in lockstep. */
const backoffMs = (attempt: number) =>
  Math.round(250 * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5));

/**
 * Unwraps the cause chain Node hides behind "fetch failed" into something a
 * user can act on — "fetch failed (ECONNRESET: socket hang up)" rather than
 * "TypeError: fetch failed".
 */
export function describeFetchError(err: unknown): string {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  let current: unknown = err;
  while (current && !seen.has(current)) {
    seen.add(current);
    const e = current as { message?: string; code?: string; cause?: unknown };
    if (e.code && !parts.includes(e.code)) parts.push(e.code);
    if (e.message && !parts.some((p) => p === e.message)) parts.push(e.message);
    current = e.cause;
  }
  return parts.length > 0 ? parts.join(": ") : String(err);
}

function errorCode(err: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && !seen.has(current)) {
    seen.add(current);
    const e = current as { code?: string; cause?: unknown };
    if (e.code) return e.code;
    current = e.cause;
  }
  return undefined;
}

function isRetryableError(err: unknown): boolean {
  const code = errorCode(err);
  if (code) return RETRYABLE_CODES.has(code);
  // A timeout we imposed ourselves is worth one more try.
  const name = (err as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError") return true;
  // An unrecognized socket failure still reads as "fetch failed"; those are
  // overwhelmingly transient, so retry rather than fail the product outright.
  return /fetch failed|socket|network|terminated/i.test(String((err as Error)?.message ?? ""));
}

export type SalsifyFetchOptions = {
  /** Total attempts including the first. */
  attempts?: number;
  /** Per-attempt ceiling; a hung socket shouldn't stall a whole batch. */
  timeoutMs?: number;
  /** Aborts all attempts — pass the caller's signal to cancel early. */
  signal?: AbortSignal;
};

/**
 * fetch() for Salsify with retries on transient failures. Non-retryable HTTP
 * responses (404, 422, …) are returned as-is for the caller to interpret;
 * only network failures and 429/5xx are retried. Throws an Error carrying the
 * unwrapped cause once attempts are exhausted.
 */
export async function salsifyFetch(
  url: string,
  init: RequestInit = {},
  { attempts = 3, timeoutMs = 20_000, signal }: SalsifyFetchOptions = {},
): Promise<Response> {
  let lastDescription = "Salsify request failed";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw new Error("Cancelled");
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      const res = await fetch(url, {
        ...init,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });

      if (!RETRYABLE_STATUS.has(res.status) || attempt === attempts) return res;

      // Salsify tells us how long to wait when it rate-limits; obey it.
      const retryAfter = Number(res.headers.get("retry-after"));
      lastDescription = `HTTP ${res.status}`;
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10_000)
          : backoffMs(attempt),
      );
    } catch (err) {
      lastDescription = describeFetchError(err);
      if (signal?.aborted) throw new Error("Cancelled");
      if (attempt === attempts || !isRetryableError(err)) {
        throw new Error(lastDescription);
      }
      await sleep(backoffMs(attempt));
    }
  }

  throw new Error(lastDescription);
}
