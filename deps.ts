// Standard Deno HTTP types
// Defining ConnInfo interface directly
export interface ConnInfo {
  readonly localAddr: Deno.Addr;
  readonly remoteAddr: Deno.Addr;
}

export interface ServeInit {
  port: number;
  hostname?: string;
  handler?: (request: Request, connInfo: ConnInfo) => Response | Promise<Response>;
  onListen?: (params: { hostname: string; port: number }) => void;
  onError?: (error: unknown) => Response | Promise<Response>;
  signal?: AbortSignal;
  reusePort?: boolean;
  reuseAddr?: boolean;
  parallel?: boolean;
}

// Status codes from Deno
export enum Status {
  Continue = 100,
  SwitchingProtocols = 101,
  Processing = 102,
  EarlyHints = 103,
  OK = 200,
  Created = 201,
  Accepted = 202,
  NonAuthoritativeInfo = 203,
  NoContent = 204,
  ResetContent = 205,
  PartialContent = 206,
  MultiStatus = 207,
  AlreadyReported = 208,
  IMUsed = 226,
  MultipleChoices = 300,
  MovedPermanently = 301,
  Found = 302,
  SeeOther = 303,
  NotModified = 304,
  UseProxy = 305,
  TemporaryRedirect = 307,
  PermanentRedirect = 308,
  BadRequest = 400,
  Unauthorized = 401,
  PaymentRequired = 402,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  NotAcceptable = 406,
  ProxyAuthRequired = 407,
  RequestTimeout = 408,
  Conflict = 409,
  Gone = 410,
  LengthRequired = 411,
  PreconditionFailed = 412,
  RequestEntityTooLarge = 413,
  RequestURITooLong = 414,
  UnsupportedMediaType = 415,
  RequestedRangeNotSatisfiable = 416,
  ExpectationFailed = 417,
  Teapot = 418,
  MisdirectedRequest = 421,
  UnprocessableEntity = 422,
  Locked = 423,
  FailedDependency = 424,
  TooEarly = 425,
  UpgradeRequired = 426,
  PreconditionRequired = 428,
  TooManyRequests = 429,
  RequestHeaderFieldsTooLarge = 431,
  UnavailableForLegalReasons = 451,
  InternalServerError = 500,
  NotImplemented = 501,
  BadGateway = 502,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
  HTTPVersionNotSupported = 505,
  VariantAlsoNegotiates = 506,
  InsufficientStorage = 507,
  LoopDetected = 508,
  NotExtended = 510,
  NetworkAuthenticationRequired = 511,
}

export const STATUS_TEXT: Record<Status, string> = {
  [Status.Continue]: "Continue",
  [Status.SwitchingProtocols]: "Switching Protocols",
  [Status.Processing]: "Processing",
  [Status.EarlyHints]: "Early Hints",
  [Status.OK]: "OK",
  [Status.Created]: "Created",
  [Status.Accepted]: "Accepted",
  [Status.NonAuthoritativeInfo]: "Non-Authoritative Information",
  [Status.NoContent]: "No Content",
  [Status.ResetContent]: "Reset Content",
  [Status.PartialContent]: "Partial Content",
  [Status.MultiStatus]: "Multi-Status",
  [Status.AlreadyReported]: "Already Reported",
  [Status.IMUsed]: "IM Used",
  [Status.MultipleChoices]: "Multiple Choices",
  [Status.MovedPermanently]: "Moved Permanently",
  [Status.Found]: "Found",
  [Status.SeeOther]: "See Other",
  [Status.NotModified]: "Not Modified",
  [Status.UseProxy]: "Use Proxy",
  [Status.TemporaryRedirect]: "Temporary Redirect",
  [Status.PermanentRedirect]: "Permanent Redirect",
  [Status.BadRequest]: "Bad Request",
  [Status.Unauthorized]: "Unauthorized",
  [Status.PaymentRequired]: "Payment Required",
  [Status.Forbidden]: "Forbidden",
  [Status.NotFound]: "Not Found",
  [Status.MethodNotAllowed]: "Method Not Allowed",
  [Status.NotAcceptable]: "Not Acceptable",
  [Status.ProxyAuthRequired]: "Proxy Authentication Required",
  [Status.RequestTimeout]: "Request Timeout",
  [Status.Conflict]: "Conflict",
  [Status.Gone]: "Gone",
  [Status.LengthRequired]: "Length Required",
  [Status.PreconditionFailed]: "Precondition Failed",
  [Status.RequestEntityTooLarge]: "Request Entity Too Large",
  [Status.RequestURITooLong]: "Request URI Too Long",
  [Status.UnsupportedMediaType]: "Unsupported Media Type",
  [Status.RequestedRangeNotSatisfiable]: "Requested Range Not Satisfiable",
  [Status.ExpectationFailed]: "Expectation Failed",
  [Status.Teapot]: "I'm a teapot",
  [Status.MisdirectedRequest]: "Misdirected Request",
  [Status.UnprocessableEntity]: "Unprocessable Entity",
  [Status.Locked]: "Locked",
  [Status.FailedDependency]: "Failed Dependency",
  [Status.TooEarly]: "Too Early",
  [Status.UpgradeRequired]: "Upgrade Required",
  [Status.PreconditionRequired]: "Precondition Required",
  [Status.TooManyRequests]: "Too Many Requests",
  [Status.RequestHeaderFieldsTooLarge]: "Request Header Fields Too Large",
  [Status.UnavailableForLegalReasons]: "Unavailable For Legal Reasons",
  [Status.InternalServerError]: "Internal Server Error",
  [Status.NotImplemented]: "Not Implemented",
  [Status.BadGateway]: "Bad Gateway",
  [Status.ServiceUnavailable]: "Service Unavailable",
  [Status.GatewayTimeout]: "Gateway Timeout",
  [Status.HTTPVersionNotSupported]: "HTTP Version Not Supported",
  [Status.VariantAlsoNegotiates]: "Variant Also Negotiates",
  [Status.InsufficientStorage]: "Insufficient Storage",
  [Status.LoopDetected]: "Loop Detected",
  [Status.NotExtended]: "Not Extended",
  [Status.NetworkAuthenticationRequired]: "Network Authentication Required",
};

// OpenAI types from JSR
import OpenAI from "jsr:@openai/openai@^4.89.0";
export type CompletionCreateParams = Parameters<typeof OpenAI.prototype.completions.create>[0];
export type CompletionResponse = Awaited<ReturnType<typeof OpenAI.prototype.completions.create>>;
