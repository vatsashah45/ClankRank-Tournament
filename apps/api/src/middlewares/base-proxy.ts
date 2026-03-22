import type { RequestHandler } from "express";

/**
 * createBaseProxy — creates a reverse proxy to SANDBOX_API_URL.
 *
 * When sandboxApiUrl is "mock" or undefined, returns a mock handler that
 * simulates realistic sandbox API responses without an external service.
 *
 * Mock response distribution: 200: ~70%, 429: ~20%, 500: ~10%
 */
export function createBaseProxy(sandboxApiUrl?: string): RequestHandler {
  if (!sandboxApiUrl || sandboxApiUrl === "mock") {
    return createMockSandboxHandler();
  }

  // Real proxy via http-proxy-middleware — create once, reuse per request
  let cachedProxy: RequestHandler | null = null;
  const proxyReady = import("http-proxy-middleware")
    .then(({ createProxyMiddleware }) => {
      cachedProxy = createProxyMiddleware({
        target: sandboxApiUrl,
        changeOrigin: true,
      }) as unknown as RequestHandler;
      return cachedProxy;
    })
    .catch(() => null);

  return async (req, res, next) => {
    try {
      const proxy = cachedProxy ?? (await proxyReady);
      if (proxy) {
        // @ts-ignore — proxy is a function-style middleware
        return proxy(req, res, next);
      }
    } catch {
      // fall through
    }
    next();
  };
}

/**
 * createMockSandboxHandler — simulates Sandbox API locally.
 *
 * Endpoint: GET /sandbox/api/data
 * Response distribution: 200 ~70%, 429 ~20%, 500 ~10%
 */
export function createMockSandboxHandler(): RequestHandler {
  return (req, res, next) => {
    // Only handle the sandbox data endpoint; pass through everything else
    if (req.path !== "/sandbox/api/data") {
      return next();
    }

    const roll = Math.random();

    if (roll < 0.10) {
      // 500 Internal Server Error
      res.status(500).json({ error: "Internal server error" });
    } else if (roll < 0.30) {
      // 429 Too Many Requests
      const retryAfters = [1, 3, 5, 10];
      const retryAfter = retryAfters[Math.floor(Math.random() * retryAfters.length)];
      res.status(429).setHeader("retry-after", String(retryAfter)).json({
        error: "Rate limit exceeded",
        retryAfter,
      });
    } else {
      // 200 OK with mock data
      res.status(200).json({
        data: {
          id: Math.floor(Math.random() * 1000),
          value: Math.random().toFixed(4),
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}
