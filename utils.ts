import { Status } from "./deps.ts";
import { CONFIG } from "./config.ts";
import { APIError, MetricsData, ValidationError } from "./types.ts";

// =========================================
// Response Handling Functions
// =========================================

/**
 * Creates a response with appropriate headers and status
 * Handles both JSON and streaming responses
 */
export function createResponse(
  data: unknown,
  options: {
    status?: number;
    headers?: Record<string, string>;
    streaming?: boolean;
    compress?: boolean;
  } = {},
): Response {
  const {
    status = Status.OK,
    headers = {},
    streaming = false,
    compress = false,
  } = options;

  // Base headers for all responses
  const baseHeaders = {
    "Content-Security-Policy": "default-src 'none'; script-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Access-Control-Allow-Origin": CONFIG.cors.origin,
    "Access-Control-Allow-Methods": CONFIG.cors.methods,
    "Access-Control-Allow-Headers": CONFIG.cors.headers,
    "Access-Control-Max-Age": CONFIG.cors.maxAge,
    ...headers,
  };

  // For streaming responses
  if (streaming) {
    if (!(data instanceof ReadableStream)) {
      throw new ValidationError("Streaming response requires ReadableStream data");
    }

    return new Response(data, {
      headers: {
        ...baseHeaders,
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive",
        "Cache-Control": "no-cache",
      },
    });
  }

  // For JSON responses
  const jsonData = typeof data === "string" ? data : JSON.stringify(data);

  // Handle compression if requested and supported
  if (compress && typeof CompressionStream !== "undefined") {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const encodedData = encoder.encode(jsonData);
        controller.enqueue(encodedData);
        controller.close();
      },
    }).pipeThrough(new CompressionStream("gzip"));

    return new Response(stream, {
      status,
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
    });
  }

  // Standard JSON response
  return new Response(jsonData, {
    status,
    headers: {
      ...baseHeaders,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Creates an error response from any API error
 */
export function createErrorResponse(error: APIError): Response {
  return createResponse(error.toJSON(), {
    status: error.context.status,
  });
}

// =========================================
// Token Management Utilities
// =========================================

/**
 * Extracts expiration time from a Copilot token
 */
export function extractExpTime(token: string): number {
  if (!token) {
    throw new ValidationError("Token cannot be empty", { field: "token" });
  }

  const expMatch = token.match(/exp=(\d+)/);
  if (!expMatch) {
    throw new ValidationError("Invalid token format: missing expiration", { field: "token" });
  }

  const expTime = parseInt(expMatch[1]) * 1000; // Convert to milliseconds
  if (isNaN(expTime)) {
    throw new ValidationError("Invalid token format: expiration is not a number", {
      field: "token",
    });
  }

  return expTime;
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(expiresAt: number | null, marginMs = 5 * 60 * 1000): boolean {
  if (!expiresAt) return true;
  if (typeof expiresAt !== "number") return true;
  if (isNaN(expiresAt)) return true;

  return Date.now() >= (expiresAt - marginMs);
}

// =========================================
// Safety Mechanisms
// =========================================

/**
 * Simple rate limiter implementation
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private readonly windowMs: number;
  private readonly limit: number;
  private readonly burstLimit: number;

  constructor(requestsPerMinute: number, burstSize: number) {
    this.limit = requestsPerMinute;
    this.burstLimit = burstSize;
    this.windowMs = 60 * 1000; // 1 minute in ms
  }

  /**
   * Try to acquire permission to proceed
   * @returns true if request can proceed, false if rate limited
   */
  async acquire(): Promise<boolean> {
    const now = Date.now();

    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter((time) => now - time < this.windowMs);

    // Check if we're over the limits
    if (this.timestamps.length >= this.limit) {
      return false;
    }

    // Check burst limit (more than burstLimit in the last second)
    const recentCount = this.timestamps.filter((time) => now - time < 1000).length;
    if (recentCount >= this.burstLimit) {
      return false;
    }

    // Add current timestamp and allow
    this.timestamps.push(now);
    return true;
  }
}

/**
 * Simple circuit breaker implementation
 */
export class CircuitBreaker {
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private failures = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private resetTimeout: number | null = null;
  private readonly halfOpenMaxCalls: number;
  private halfOpenCalls = 0;

  constructor(
    failureThreshold = 5,
    resetTimeoutMs = 30000,
    halfOpenMaxCalls = 3,
  ) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.halfOpenMaxCalls = halfOpenMaxCalls;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      throw new APIError("Service unavailable", 503, "CIRCUIT_OPEN");
    }

    if (this.state === "HALF_OPEN" && this.halfOpenCalls >= this.halfOpenMaxCalls) {
      throw new APIError("Service unavailable", 503, "CIRCUIT_OPEN");
    }

    try {
      if (this.state === "HALF_OPEN") {
        this.halfOpenCalls++;
      }

      const result = await fn();

      // Success - reset if in half-open state
      if (this.state === "HALF_OPEN") {
        this.reset();
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    if (this.state === "CLOSED") {
      this.failures++;
      if (this.failures >= this.failureThreshold) {
        this.trip();
      }
    } else if (this.state === "HALF_OPEN") {
      this.trip();
    }
  }

  private trip(): void {
    this.state = "OPEN";
    this.resetTimeout = setTimeout(() => {
      this.state = "HALF_OPEN";
      this.halfOpenCalls = 0;
    }, this.resetTimeoutMs);
  }

  private reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.halfOpenCalls = 0;
    if (this.resetTimeout !== null) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
  }
}

// =========================================
// Misc Utilities
// =========================================

/**
 * Sleep function with optional abort signal
 */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms < 0) throw new Error("Sleep duration must be non-negative");

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Sleep aborted", "AbortError"));
      return;
    }

    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("Sleep aborted", "AbortError"));
    }, { once: true });
  });
}

/**
 * Validates and normalizes a language identifier
 */
export function validateLanguage(language: string): string {
  const normalized = language.toLowerCase().trim();
  const validLanguages = new Set([
    "typescript",
    "javascript",
    "python",
    "java",
    "go",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "rust",
    "cpp",
    "csharp",
    "html",
    "css",
    "sql",
  ]);

  if (!validLanguages.has(normalized)) {
    throw new ValidationError(`Unsupported language: ${language}`, {
      field: "language",
      value: language,
      validOptions: Array.from(validLanguages),
    });
  }

  return normalized;
}

// Create global instances of safety mechanisms
export const rateLimiter = new RateLimiter(
  CONFIG.rateLimit.requestsPerMinute,
  CONFIG.rateLimit.burstSize,
);

export const circuitBreaker = new CircuitBreaker(
  5, // failureThreshold
  30000, // resetTimeoutMs
  3, // halfOpenMaxCalls
);

// Metrics tracker
class MetricsTracker {
  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private rateLimitedCount = 0;
  private totalLatency = 0;
  private lastError?: {
    timestamp: number;
    message: string;
    code: string;
  };

  recordRequest(latencyMs: number, isError = false): void {
    this.requestCount++;
    this.totalLatency += latencyMs;

    if (isError) {
      this.errorCount++;
    }
  }

  recordError(error: APIError): void {
    this.lastError = {
      timestamp: Date.now(),
      message: error.message,
      code: error.context.code,
    };
  }

  recordRateLimited(): void {
    this.rateLimitedCount++;
  }

  getStats(): MetricsData {
    const uptime = Date.now() - this.startTime;
    const rps = this.requestCount / (uptime / 1000);

    return {
      requests: this.requestCount,
      errors: this.errorCount,
      rateLimited: this.rateLimitedCount,
      avgLatencyMs: this.requestCount > 0 ? this.totalLatency / this.requestCount : 0,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
      uptime,
      rps,
      lastError: this.lastError,
    };
  }
}

export const metrics = new MetricsTracker();
