// API Types
export interface CopilotRequest {
  prompt: string;
  language?: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  model?: string;
  presence_penalty?: number;
  frequency_penalty?: number;
  stop?: string | string[];
}

export interface CopilotResponse {
  choices: Array<{
    text: string;
    finish_reason?: "stop" | "length" | "error";
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Streaming response types
export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    finish_reason: null | "stop" | "length";
  }>;
}

// Auth Types
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

// Token types
export type CopilotTokenBrand = { readonly __brand: unique symbol };
export type CopilotTokenString = string & CopilotTokenBrand;

export interface CopilotToken {
  token: CopilotTokenString;
  expires_at: number;
}

// Unified Error System
export interface ErrorContext {
  code: string;
  status: number;
  details?: Record<string, unknown> | undefined;
  stack?: string | undefined;
}

// Base API Error
export class APIError extends Error {
  readonly context: ErrorContext;

  constructor(
    message: string,
    status: number = 500,
    code: string = "API_ERROR",
    details?: Record<string, unknown> | undefined,
    includeStack = false,
  ) {
    super(message);
    this.name = "APIError";

    this.context = {
      code,
      status,
      details,
      stack: includeStack ? this.stack : undefined,
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.context.code,
        message: this.message,
        status: this.context.status,
        details: this.context.details,
        ...(this.context.stack ? { stack: this.context.stack } : {}),
      },
    };
  }
}

// Client Error (400-level)
export class ClientError extends APIError {
  constructor(
    message: string,
    status: number = 400,
    code: string = "CLIENT_ERROR",
    details?: Record<string, unknown>,
    includeStack = false,
  ) {
    super(message, status, code, details, includeStack);
    this.name = "ClientError";
  }
}

// Server Error (500-level)
export class ServerError extends APIError {
  constructor(
    message: string,
    status: number = 500,
    code: string = "SERVER_ERROR",
    details?: Record<string, unknown>,
    includeStack = false,
  ) {
    super(message, status, code, details, includeStack);
    this.name = "ServerError";
  }
}

// Common error subtypes
export class ValidationError extends ClientError {
  constructor(message: string, details?: Record<string, unknown>, includeStack = false) {
    super(message, 400, "VALIDATION_ERROR", details, includeStack);
  }
}

export class AuthenticationError extends ClientError {
  constructor(message: string, details?: Record<string, unknown>, includeStack = false) {
    super(message, 401, "AUTHENTICATION_ERROR", details, includeStack);
  }
}

export class RateLimitError extends ClientError {
  constructor(message: string, details?: Record<string, unknown>, includeStack = false) {
    super(message, 429, "RATE_LIMIT_ERROR", details, includeStack);
  }
}

// Utility Types
export interface ValidationResult<T> {
  isValid: boolean;
  value?: T;
  errors?: string[];
}

export interface MetricsData {
  requests: number;
  errors: number;
  rateLimited: number;
  avgLatencyMs: number;
  errorRate: number;
  uptime: number;
  rps: number;
  lastError?: {
    timestamp: number;
    message: string;
    code: string;
  } | undefined;
}

// Completion types with optional fields properly typed
export interface CompletionOptions {
  model?: string | undefined;
  max_tokens?: number | undefined;
  temperature?: number | undefined;
  top_p?: number | undefined;
  n?: number | undefined;
  stream?: boolean | undefined;
  stop?: string | string[] | null | undefined;
  presence_penalty?: number | undefined;
  frequency_penalty?: number | undefined;
  timeoutMs?: number | undefined;
}
