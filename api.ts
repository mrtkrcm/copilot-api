import { handleCompletionRequest } from "./completion.ts";
import { CONFIG } from "./config.ts";
import { ServeInit, Status } from "./deps.ts";
import { configure, debug, info, LogLevel, prettyError, warn } from "./logger.ts";
import { handleModelsRequest } from "./models.ts";
import { tokenManager } from "./token.ts";
import { APIError, ServerError } from "./types.ts";
import { createErrorResponse, createResponse, metrics } from "./utils.ts";

/**
 * Main request handler
 */
async function handleRequest(req: Request): Promise<Response> {
  const startTime = Date.now();
  let isError = false;

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    // Route requests to appropriate handlers
    if (path === "/health") {
      return createResponse({ status: "ok" });
    } else if (path === "/metrics") {
      return createResponse(metrics.getStats());
    } else if (path === "/v1/completions") {
      try {
        return await handleCompletionRequest(req);
      } catch (error) {
        isError = true;
        if (error instanceof APIError) {
          metrics.recordError(error);
        }
        throw error;
      }
    } else if (path === "/v1/models" || path.startsWith("/v1/models/")) {
      try {
        return await handleModelsRequest(req);
      } catch (error) {
        isError = true;
        if (error instanceof APIError) {
          metrics.recordError(error);
        }
        throw error;
      }
    } else {
      // CORS preflight for any endpoint
      if (req.method === "OPTIONS") {
        return createResponse(null, { status: Status.NoContent });
      }

      // Not found
      return createResponse(
        { error: { message: "Not Found", code: "NOT_FOUND" } },
        { status: Status.NotFound },
      );
    }
  } catch (error) {
    isError = true;
    prettyError(error instanceof Error ? error : new Error(String(error)), "API");

    // Return appropriate error response
    if (error instanceof APIError) {
      return createErrorResponse(error);
    }

    // For unknown errors, create a generic server error
    const serverError = new ServerError(
      "Internal server error",
      500,
      "INTERNAL_ERROR",
      { originalError: error instanceof Error ? error.message : String(error) },
      CONFIG.includeStackTraces,
    );

    return createErrorResponse(serverError);
  } finally {
    // Record metrics
    metrics.recordRequest(Date.now() - startTime, isError);
  }
}

/**
 * Start the API server
 */
async function startServer(): Promise<void> {
  // Configure logger based on environment
  configure({
    level: Deno.env.get("COPILOT_LOG_LEVEL") === "debug" ? LogLevel.DEBUG : LogLevel.INFO,
    showTimestamp: true,
    colorize: true,
  });

  // Log configuration details
  info("Starting Copilot API server");
  debug("API Configuration:", {
    modelsEndpoint: CONFIG.endpoints.github.models,
    completionsEndpoint: CONFIG.endpoints.openai.completions,
    defaultModel: CONFIG.model.default,
  });

  // Initialize token manager
  try {
    info("Initializing token manager...");
    await tokenManager.initialize();
  } catch (error) {
    prettyError(error instanceof Error ? error : new Error(String(error)), "Startup");
    warn("Token manager initialization failed, continuing with limited functionality");
  }

  const port = CONFIG.port;
  const hostname = CONFIG.hostname;

  info(`Starting server on ${hostname}:${port}...`);

  // Server configuration
  const serverOptions: ServeInit = {
    port,
    hostname,
    onListen: ({ hostname, port }) => {
      info(`Server running at http://${hostname}:${port}/`);
    },
  };

  // Enable parallel processing if supported
  if (Deno.env.get("ENABLE_PARALLEL") === "true") {
    serverOptions.parallel = true;
    info("Parallel request processing enabled");
  }

  try {
    // Start the server
    await Deno.serve(serverOptions, handleRequest).finished;
  } catch (error) {
    prettyError(error instanceof Error ? error : new Error(String(error)), "Server");
  }
}

// Start the server if this is the main module
if (import.meta.main) {
  startServer();
}

export { handleRequest, startServer };
