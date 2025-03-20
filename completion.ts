import { CONFIG } from "./config.ts";
import { CompletionResponse } from "./deps.ts";
import { getDefaultModel } from "./models.ts";
import { createResponse, sleep } from "./utils.ts";
// OpenAI import removed as it's not being used
import { debug } from "./logger.ts";
import { tokenManager } from "./token.ts";
import {
    APIError,
    CompletionOptions,
    CopilotRequest,
    ServerError,
    ValidationError
} from "./types.ts";
// RateLimitError, circuitBreaker, metrics, rateLimiter, validateLanguage are unused

// =========================================
// Direct OpenAI Implementation
// =========================================

/**
 * OpenAI provider with retry capabilities
 */
class CompletionProvider {
  private token: string | null = null;

  /**
   * Initialize with a new token
   */
  private async initializeClient(token: string): Promise<void> {
    // Store Copilot token for potential future use
    this.token = token;
  }

  /**
   * Generate completion with retry logic
   */
   async createCompletion(
     prompt: string,
     options: CompletionOptions = {},
   ): Promise<CompletionResponse> {
     if (!this.token) {
       const token = await tokenManager.getValidToken();
       await this.initializeClient(token);
     }

     return this.executeWithRetry(async () => {
       try {
         // Format for GitHub Copilot API - note API doesn't expect 'model' param here
         const requestBody = {
           prompt,
           suffix: "",
           max_tokens: options.max_tokens ?? CONFIG.maxTokens,
           temperature: options.temperature ?? 0,
           top_p: 1,
           n: 1,
           stop: options.stop ?? ["\n"],
           nwo: "github/copilot.vim",
           stream: true,
           extra: {
             language: options.language ?? "typescript"
           }
         };

         console.log("Request body:", JSON.stringify(requestBody, null, 2));

         // Log headers with sensitive info redacted
         const debugHeaders = {
           ...CONFIG.headers,
           "authorization": this.token ? `token ${this.token.substring(0, 10)}...` : "token <missing>",
         };
         console.log("Headers:", debugHeaders);

         // Make the actual API request
         // Construct URL with model
         const completionUrl = 'https://copilot-proxy.githubusercontent.com/v1/engines/copilot-codex/completions';
         debug("Making completion request to:", completionUrl);
         debug("Using headers:", {
           ...CONFIG.headers,
           Authorization: "token ***" + (this.token?.slice(-4) || "")
         });
         debug("Request body:", JSON.stringify(requestBody, null, 2));
         const response = await fetch(completionUrl, {
           method: "POST",
           headers: {
             "authorization": `Bearer ${this.token}`,
             "content-type": "application/json",
             "accept": "text/event-stream",
             "editor-version": CONFIG.headers["editor-version"],
             "editor-plugin-version": CONFIG.headers["editor-plugin-version"],
             "user-agent": CONFIG.headers["user-agent"],
             "connection": "keep-alive"
           },
           body: JSON.stringify(requestBody),
         });

         if (!response.ok) {
           const errorText = await response.text();
           console.error("Response error:", {
             status: response.status,
             statusText: response.statusText,
             headers: Object.fromEntries(response.headers.entries()),
             body: errorText,
           });

           // If we get a 401 Unauthorized, our token might be expired
           if (response.status === 401) {
             console.log("Authentication error - forcing token refresh");

             // Force token refresh on next attempt
             this.token = null;

             // Delete the token file to force re-authentication
             try {
               await Deno.remove(CONFIG.tokenFile);
               console.log("Removed invalid token file");
             } catch (err) {
               console.log("Error removing token file:", err);
             }

             // Try to get a fresh token
             try {
               // This will trigger full re-authentication if needed
               const newToken = await tokenManager.getValidToken();
               await this.initializeClient(newToken);
               console.log("Got fresh token after authentication error");

               // Make a simple request to validate the token works
               const testResponse = await fetch("https://api.github.com/user", {
                 headers: {
                   "Authorization": `token ${newToken}`,
                   "Accept": "application/json",
                 }
               });

               if (testResponse.ok) {
                 const userData = await testResponse.json();
                 console.log(`✅ Token validated for user: ${userData.login}`);
               } else {
                 console.log(`⚠️ Token validation failed with status: ${testResponse.status}`);
               }
             } catch (tokenError) {
               console.error("Failed to get fresh token:", tokenError);
             }
           }

           throw new ServerError(
             "Completion generation failed",
             response.status,
             "COMPLETION_ERROR",
             { error: errorText, requestInfo: { endpoint: CONFIG.endpoints.openai.completions } },
           );
         }

         // Get the stream reader
         const reader = response.body?.getReader();
         if (!reader) {
           throw new Error("No response body");
         }

         let fullText = "";
         let done = false;
         const decoder = new TextDecoder();

         while (!done) {
           const { value, done: doneReading } = await reader.read();
           if (doneReading) {
             done = true;
             break;
           }

           const chunk = decoder.decode(value);
           const lines = chunk.split('\n').filter(line => line.trim());
           
           for (const line of lines) {
             if (line === 'data: [DONE]') {
               done = true;
               break;
             }
             if (line.startsWith('data: ')) {
               try {
                 const data = JSON.parse(line.slice(6));
                 if (data.choices?.[0]?.text) {
                   fullText += data.choices[0].text;
                   // Log for debugging
                   debug('Received text chunk:', data.choices[0].text);
                 }
               } catch (e) {
                 debug('Skipping non-JSON line:', line);
               }
             }
           }
         }

         // Clean up reader
         reader.releaseLock();

         return {
           choices: [{
             text: fullText || "\r", // Return at least a carriage return if empty
             index: 0,
             finish_reason: "stop"
           }]
         };
       } catch (error) {
         console.error("Completion error:", error instanceof Error ? error.message : String(error));
         throw new ServerError(
           "Completion generation failed",
           500,
           "COMPLETION_ERROR",
           { error: error instanceof Error ? error.message : String(error) },
         );
       }
     });
   }

  /**
   * Generate streaming completion
   */
   async createStreamingCompletion(
     prompt: string,
     options: CompletionOptions = {},
   ): Promise<ReadableStream<CompletionResponse>> {
     if (!this.token) {
       const token = await tokenManager.getValidToken();
       await this.initializeClient(token);
     }

     return this.executeWithRetry(async () => {
       try {
         // Format for GitHub Copilot API
         const requestBody = {
           prompt,
           suffix: "",
           max_tokens: options.max_tokens ?? CONFIG.maxTokens,
           temperature: options.temperature ?? 0,
           top_p: 1,
           n: 1,
           stop: options.stop ?? ["\n"],
           nwo: "github/copilot.vim",
           stream: true,
           extra: {
             language: options.language ?? "typescript"
           }
         };

         console.log("Stream request body:", JSON.stringify(requestBody, null, 2));
         console.log("Stream headers:", {
           ...CONFIG.headers,
           "authorization": `token ${this.token?.substring(0, 10)}...`,
         });

         const response = await fetch(CONFIG.endpoints.openai.completions, {
           method: "POST",
           headers: {
             "authorization": `Bearer ${this.token}`,
             "content-type": "application/json",
             "accept": "application/json",
             "editor-version": CONFIG.headers["editor-version"],
             "editor-plugin-version": CONFIG.headers["editor-plugin-version"],
             "user-agent": CONFIG.headers["user-agent"]
           },
           body: JSON.stringify(requestBody),
         });

         if (!response.ok) {
           const errorText = await response.text();
           console.error("Stream response error:", {
             status: response.status,
             statusText: response.statusText,
             headers: Object.fromEntries(response.headers.entries()),
             body: errorText,
           });

           // If we get a 401 Unauthorized, our token might be expired
           if (response.status === 401) {
             // Force token refresh on next attempt
             this.token = null;
           }

           throw new ServerError(
             "Streaming completion generation failed",
             response.status,
             "STREAMING_ERROR",
             { error: errorText },
           );
         }

         // Create a ReadableStream that transforms the response
         return new ReadableStream({
           async start(controller) {
             const reader = response.body!.getReader();
             const decoder = new TextDecoder();

             try {
               while (true) {
                 const {value, done} = await reader.read();
                 if (done) break;

                 const chunk = decoder.decode(value);
                 const lines = chunk.split('\n').filter(line => line.trim());

                 for (const line of lines) {
                   if (line === 'data: [DONE]') {
                     controller.close();
                     return;
                   }
                   if (line.startsWith('data: ')) {
                     try {
                       const data = JSON.parse(line.slice(6));
                       controller.enqueue(data);
                     } catch (e) {
                       debug('Skipping non-JSON line:', line);
                     }
                   }
                 }
               }
               controller.close();
             } catch (error) {
               controller.error(error);
             } finally {
               reader.releaseLock();
             }
           }
         }) as ReadableStream<CompletionResponse>;
       } catch (error) {
         console.error("Stream error:", error instanceof Error ? error.message : String(error));
         throw new ServerError(
           "Streaming completion generation failed",
           500,
           "STREAMING_ERROR",
           { error: error instanceof Error ? error.message : String(error) },
         );
       }
     });
   }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (attempt < CONFIG.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await sleep(delay);

          // Refresh token and client on auth errors
          if (error instanceof APIError && error.context.status === 401) {
            const token = await tokenManager.getValidToken(); // Get token, will refresh if needed
            await this.initializeClient(token);
          }
        }
      }
    }

    throw lastError || new Error("Operation failed after retries");
  }
}

// Create singleton instance
const completionProvider = new CompletionProvider();

// =========================================
// Request Handler
// =========================================

/**
 * Handle completion requests
 */
export async function handleCompletionRequest(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return createResponse(null, { status: 204 });
  }

  // Validate method
  if (req.method !== "POST") {
    return createResponse(
      { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" },
      { status: 405 },
    );
  }

  // Validate content type
  const contentType = req.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    throw new ValidationError("Unsupported media type", {
      expected: "application/json",
      received: contentType,
    });
  }

  // Parse request body
  let body: CopilotRequest;
  try {
    body = await req.json();
  } catch (error) {
    throw new ValidationError("Invalid JSON in request body");
  }

  // Validate required fields
  if (!body.prompt) {
    throw new ValidationError("Missing required field: prompt", {
      field: "prompt",
    });
  }

  // Set default model if not specified
  if (!body.model) {
    body.model = await getDefaultModel();
  }

  try {
    if (body.stream) {
      const stream = await completionProvider.createStreamingCompletion(body.prompt, {
        model: body.model,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        presence_penalty: body.presence_penalty,
        frequency_penalty: body.frequency_penalty,
        stop: body.stop,
      });
      return createResponse(stream, { streaming: true });
    } else {
      const completion = await completionProvider.createCompletion(body.prompt, {
        model: body.model,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        presence_penalty: body.presence_penalty,
        frequency_penalty: body.frequency_penalty,
        stop: body.stop,
      });
      return createResponse(completion);
    }
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new ServerError(
      "Completion generation failed",
      500,
      "COMPLETION_ERROR",
      { error: error instanceof Error ? error.message : String(error) },
    );
  }
}
