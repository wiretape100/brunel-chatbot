export const RATE_LIMIT_MESSAGE = "I'm receiving a lot of requests at the moment. Please wait a moment and try again.";

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 30;
const buckets = new Map();

export function getRequestIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  const realIp = req?.headers?.["x-real-ip"];
  const candidate = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded || realIp || req?.socket?.remoteAddress || "unknown";

  return String(candidate)
    .split(",")[0]
    .trim() || "unknown";
}

export function checkRateLimit(identifier, options = {}) {
  const key = String(identifier || "unknown");
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const windowMs = Number.isFinite(options.windowMs) ? options.windowMs : DEFAULT_WINDOW_MS;
  const maxRequests = Number.isFinite(options.maxRequests) ? options.maxRequests : DEFAULT_MAX_REQUESTS;

  purgeExpiredBuckets(now);

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = {
      count: 0,
      resetAt: now + windowMs
    };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  return {
    allowed: bucket.count <= maxRequests,
    remaining: Math.max(0, maxRequests - bucket.count),
    resetAt: bucket.resetAt
  };
}

export function resetRateLimitForTests() {
  buckets.clear();
}

function purgeExpiredBuckets(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}
