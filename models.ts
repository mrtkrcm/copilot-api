import { debug, info, prettyError, warn } from "./logger.ts";
import { APIError, CopilotTokenString, ServerError } from "./types.ts";
import { CONFIG } from "./config.ts";
import { tokenManager } from "./token.ts";
import { sleep } from "./utils.ts";

// Cache of available models
interface Model {
  id: string;
  owned_by: string;
  object: string;
  created: number;
}

// In-memory cache with expiration
const modelsCache: {
  models: Model[] | null;
  timestamp: number;
} = {
  models: null,
  timestamp: 0,
};

/**
 * Get the default model from config
 */
export async function getDefaultModel(): Promise<string> {
  return CONFIG.model.default;
}

/**
 * Get all available models
 */
export async function getModels(): Promise<Model[]> {
  const now = Date.now();
  
  // Return from cache if available and not expired
  if (
    modelsCache.models !== null &&
    now - modelsCache.timestamp < CONFIG.modelsCacheTTLMs
  ) {
    return modelsCache.models;
  }

  try {
    const token = await tokenManager.getValidToken();
    
    debug("Fetching models from:", CONFIG.endpoints.github.models);
    const headers = {
      "authorization": `token ${token}`,
      "accept": "application/json",
      "editor-version": CONFIG.headers["editor-version"],
      "editor-plugin-version": CONFIG.headers["editor-plugin-version"],
      "content-type": "application/json",
      "user-agent": CONFIG.headers["user-agent"],
      // Only add openai-organization header if it exists and has a value
      ...(CONFIG.headers["openai-organization"] ? { "openai-organization": CONFIG.headers["openai-organization"] } : {}),
    };
    
    debug("Models request headers:", {
      ...headers, 
      authorization: "token ****"
    });
    
    const response = await fetch(CONFIG.endpoints.github.models, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ServerError(`Failed to fetch models: ${errorText}`, response.status);
    }

    const data = await response.json();
    debug("Models response:", data);

    if (!data.data || !Array.isArray(data.data)) {
      throw new ServerError("Invalid models response format", 500);
    }

    // Cache the models
    modelsCache.models = data.data;
    modelsCache.timestamp = now;

    return data.data;
  } catch (error) {
    warn("Failed to fetch models:", error);
    
    // If cache exists but is expired, still return it rather than fail
    if (modelsCache.models !== null) {
      warn("Returning stale models from cache");
      return modelsCache.models;
    }
    
    // Rethrow with appropriate error format
    const status = error instanceof APIError ? error.context.status : 500;
    const errorType = error instanceof APIError ? error.context.code : "server_error";
    
    throw new ServerError(
      `Failed to fetch models: ${error instanceof Error ? error.message : String(error)}`,
      status,
      errorType
    );
  }
}

/**
 * Get specific model by ID
 */
export async function getModel(id: string): Promise<Model | null> {
  const models = await getModels();
  return models.find((model) => model.id === id) || null;
}

/**
 * Handle models endpoint requests
 */
export async function handleModelsRequest(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // Handle specific model request
    if (path.startsWith("/v1/models/")) {
      const modelId = path.replace("/v1/models/", "");
      const model = await getModel(modelId);
      
      if (!model) {
        return new Response(
          JSON.stringify({
            error: {
              message: `Model '${modelId}' not found`,
              type: "not_found",
              param: null,
              code: "model_not_found",
            },
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
      
      return new Response(JSON.stringify(model), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // Handle models list
    const models = await getModels();
    
    return new Response(
      JSON.stringify({
        object: "list",
        data: models,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    prettyError(error instanceof Error ? error : new Error(String(error)), "Models API");
    
    const status = error instanceof APIError ? error.context.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    
    return new Response(
      JSON.stringify({
        error: {
          message,
          type: "api_error",
          status,
        },
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}