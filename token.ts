import { CONFIG } from "./config.ts";
import { debug, prettyError, warn } from "./logger.ts";
import {
    APIError,
    AuthenticationError,
    CopilotTokenString,
    DeviceCodeResponse,
    ValidationError,
} from "./types.ts";
import { sleep } from "./utils.ts";



/**
 * Validates and brands a token string
 */
 function brandToken(token: string): CopilotTokenString {
   if (!token || typeof token !== "string" || token.trim() === "") {
     throw new ValidationError("Invalid token format", { field: "token" });
   }
 
   // For GitHub OAuth tokens (used for authentication)
   if (token.startsWith('ghu_')) {
     return token as CopilotTokenString;
   }
 
   // For Copilot tokens (used for completions)
   // These are JWT-like tokens that include exp=timestamp
   if (token.includes('exp=') && token.includes(';')) {
     // Validate expiration
     const expValue = extractExpValue(token);
     if (!expValue) {
       throw new ValidationError("Invalid token format: cannot parse expiration", { field: "token" });
     }
     if (expValue <= Math.floor(Date.now() / 1000)) {
       throw new ValidationError("Token is expired", { field: "token" });
     }
     return token as CopilotTokenString;
   }
 
   throw new ValidationError("Invalid token format", { field: "token" });
 }
 
 function extractExpValue(token: string): number | null {
   const pairs = token.split(';');
   for (const pair of pairs) {
     const [key, value] = pair.split('=');
     if (key.trim() === 'exp') {
       const expValue = parseInt(value.trim());
       return isNaN(expValue) ? null : expValue;
     }
   }
   return null;
 }

/**
 * Streamlined token manager
 */
class TokenManager {
  private accessToken: string | null = null;
  private copilotToken: CopilotTokenString | null = null;
  private expiresAt: number | null = null;
  private refreshPromise: Promise<void> | null = null;

  /**
   * Initialize the token manager
   */
   async initialize(): Promise<void> {
     try {
       // Check if token file exists first
       try {
         await Deno.stat(CONFIG.tokenFile);
       } catch (error) {
         if (error instanceof Deno.errors.NotFound) {
           console.log(`\nNo token file found at ${CONFIG.tokenFile}`);
           await this.authenticate();
         } else {
           throw error;
         }
       }
       // If token file exists, check if it's valid
       try {
         const tokenContent = await Deno.readTextFile(CONFIG.tokenFile);
         console.log(`\nFound existing token file (${tokenContent.length} characters)`);

         // Test the token against GitHub API
         try {
           const response = await fetch("https://api.github.com/user", {
             headers: {
               "Authorization": `token ${tokenContent}`,
               "Accept": "application/json",
               "GitHub-Authentication-Type": "copilot"
             }
           });

           if (!response.ok) {
             // Handle rate limiting
             if (response.status === 429) {
               const retryAfter = response.headers.get("Retry-After");
               const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
               console.log(`Rate limited, waiting ${waitTime}ms before retry`);
               await sleep(waitTime);
               return await this.doRefresh();
             }

             // Handle server errors with retry
             if (response.status >= 500) {
               console.log(`Server error ${response.status}, retrying...`);
               await sleep(2000);
               return await this.doRefresh();
             }
             console.log(`⚠️ GitHub token test failed with status ${response.status}`);
             console.log("Removing invalid token file and starting authentication...");
             await Deno.remove(CONFIG.tokenFile);
             await this.authenticate();
           } else {
             const user = await response.json();
             console.log(`✓ Token validated for GitHub user: ${user.login}`);
           }
         } catch (err) {
           console.log("⚠️ Error testing GitHub token:", err);
           console.log("Will try to use the token anyway...");
         }
       } catch (err) {
         console.log("Error reading token file:", err);
       }

       await this.refresh();
       this.startRefreshInterval();
       // Try to refresh token, authenticate if that fails
       try {
         await this.refresh();
         this.startRefreshInterval();
       } catch (refreshError) {
         console.log("⚠️ Token refresh failed:", refreshError instanceof Error ? refreshError.message : String(refreshError));
         console.log("Starting fresh authentication...");

         // Remove possibly corrupted token file
         try {
           await Deno.remove(CONFIG.tokenFile);
         } catch (err) {
           // Ignore error if file doesn't exist
         }

         await this.authenticate();
         await this.refresh();
         this.startRefreshInterval();
       }
     } catch (error) {
       // Log error but don't throw - we'll try again on next request
       prettyError(error instanceof Error ? error : new Error(String(error)), "TokenManager");
       warn("Token initialization failed, will retry on next request");
     }
   }

  /**
   * Start automatic token refresh
   */
  private startRefreshInterval(): void {
    // Refresh token every 25 minutes
    setInterval(() => {
      this.refresh().catch(console.error);
    }, 25 * 60 * 1000);
  }

  /**
   * Get a valid token, refreshing if necessary
   */
  async getValidToken(): Promise<CopilotTokenString> {
    try {
      if (!this.copilotToken || this.isExpired()) {
        await this.refresh();
      }
      if (!this.copilotToken) {
        throw new AuthenticationError("No valid token available");
      }
      return this.copilotToken;
    } catch (error) {
      prettyError(error instanceof Error ? error : new Error(String(error)), "TokenManager");
      throw new AuthenticationError("Failed to get valid token", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if current token is expired
   */
  private isExpired(): boolean {
    return !this.expiresAt || Date.now() >= this.expiresAt - 5 * 60 * 1000; // 5 min buffer
  }

  /**
   * Refresh the token
   */
  private async refresh(): Promise<void> {
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Perform the actual refresh
   */
   private async doRefresh(): Promise<void> {
       try {
         // Clear any existing tokens first
         this.copilotToken = null;
         this.expiresAt = null;
         
         // Get fresh access token
         this.accessToken = await this.getAccessToken();
        debug("Using access token:", this.accessToken ? "****" + this.accessToken.slice(-4) : "null");
        debug("Using token endpoint:", CONFIG.endpoints.github.copilotToken);

        // Use access token to get GitHub Copilot token
        debug("Refreshing token using endpoint:", CONFIG.endpoints.github.copilotToken);

        const headers = {
          "authorization": `token ${this.accessToken}`,
          "editor-version": CONFIG.headers["editor-version"],
          "editor-plugin-version": CONFIG.headers["editor-plugin-version"],
          "user-agent": CONFIG.headers["user-agent"]
        };

        debug("Token refresh request headers:", {
          ...headers,
          authorization: "token ****" + (this.accessToken ? this.accessToken.slice(-4) : ""),
        });

        const response = await fetch(CONFIG.endpoints.github.copilotToken, {
          method: "GET",
          headers,
        });

      debug("Token refresh response status:", response.status);
      debug("Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        debug("Token refresh failed with status", response.status, "and body:", errorText);
        debug("Request headers:", {
          ...CONFIG.headers,
          authorization: "token ****" + this.accessToken?.slice(-4),
        });

        // If authentication fails, try to re-authenticate completely
        if (response.status === 401) {
          console.log("⚠️ Authentication failed during token refresh. Re-authenticating...");

          // Force re-authentication by removing token file
          try {
            await Deno.remove(CONFIG.tokenFile);
          } catch (err) {
            // Ignore if file doesn't exist
          }

          // Get a new access token through the authentication flow
          this.accessToken = await this.authenticate();

          // Try the refresh again with the new token
          return await this.doRefresh();
        }

        throw new AuthenticationError(`Failed to refresh token: ${errorText}`, {
          details: {
            status: response.status,
            body: errorText,
            headers: Object.fromEntries(response.headers.entries())
          }
        });
      }

      const data = await response.json();

        debug("Token refresh response:", {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          data: JSON.stringify(data, null, 2)
        });
        debug("Token refresh response data:", {
          ...data,
          token: data.token ? "****" + data.token.slice(-4) : null
        });
  
        if (!data.token) {
          throw new AuthenticationError("Invalid token response: missing token field", {
            responseData: {
              ...data,
              token: "[redacted]"
            },
          });
        }
  
        // Store the raw token without validation since we'll use it directly
        this.copilotToken = data.token as CopilotTokenString;
        
        // Parse expiration from token if present
        const expValue = data.expires_in || (data.token.includes('exp=') ? extractExpValue(data.token) : null);
        this.expiresAt = expValue ? (Date.now() + expValue * 1000) : null;

      // Save successful token to file for debugging purposes
      try {
        await Deno.writeTextFile(CONFIG.tokenFile + ".debug",
          JSON.stringify({
            timestamp: new Date().toISOString(),
            expires_at: new Date(this.expiresAt).toISOString(),
            token_prefix: data.token.substring(0, 10) + "...",
          }, null, 2)
        );
      } catch (err) {
        debug("Could not write debug token file:", err);
      }

      debug("Successfully refreshed token, expires at:", new Date(this.expiresAt).toISOString());
    } catch (error) {
      console.error(
        "Token refresh failed:",
        error instanceof Error ? error.message : String(error),
      );
      if (error instanceof AuthenticationError && error.context.details) {
        console.error("Error details:", error.context.details);
      }
      // Only rethrow APIErrors, wrap others
      if (error instanceof APIError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Detailed token refresh error:", {
        message: errorMessage,
        token: this.accessToken ? "present" : "missing",
        endpoint: CONFIG.endpoints.github.copilotToken
      });
      
      throw new APIError(
        "Token refresh failed: " + errorMessage,
        500,
        "TOKEN_ERROR",
        { 
          error: errorMessage,
          endpoint: CONFIG.endpoints.github.copilotToken,
          tokenPresent: !!this.accessToken
        },
      );
    }
  }

  /**
   * Get GitHub access token, authenticate if needed
   */
  private async getAccessToken(): Promise<string> {
    try {
      return await Deno.readTextFile(CONFIG.tokenFile);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // Token file not found, authenticate
        return await this.authenticate();
      }

      throw new APIError(
        "Failed to read token file",
        500,
        "TOKEN_ERROR",
        { error: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  /**
   * Authenticate with GitHub via device flow
   */
   private async authenticate(): Promise<string> {
     console.log("\n╔══════════════════════════════════════════════════════════╗");
     console.log("║             GITHUB COPILOT AUTHENTICATION                ║");
     console.log("╚══════════════════════════════════════════════════════════╝");
     console.log("\nThis server needs to authenticate with GitHub Copilot.");
     console.log("You must have an active GitHub Copilot subscription.\n");

     // Request device code
     const deviceCodeResponse = await this.getDeviceCode();

     // Display device code and verification URL prominently
     console.log("╔══════════════════════════════════════════════════════════╗");
     console.log("║                                                          ║");
     console.log(`║  1. Open:  ${deviceCodeResponse.verification_uri.padEnd(39)} ║`);
     console.log(`║  2. Enter: ${deviceCodeResponse.user_code.padEnd(39)} ║`);
     console.log("║                                                          ║");
     console.log("╚══════════════════════════════════════════════════════════╝");

     console.log(`\nThis code will expire in ${deviceCodeResponse.expires_in} seconds.`);
     console.log("Waiting for authentication...\n");

     // Poll for token
     const accessToken = await this.pollForToken(deviceCodeResponse);

     try {
       console.log("\nTesting GitHub API access...");
       const userResponse = await fetch("https://api.github.com/user", {
         headers: {
           "Authorization": `token ${accessToken}`,
           "Accept": "application/json",
         }
       });

       if (userResponse.ok) {
         const user = await userResponse.json();
         console.log(`✓ Authenticated as GitHub user: ${user.login}`);
       } else {
         console.log(`✗ GitHub API returned status ${userResponse.status}`);
         console.log("The token may have limited scope, but we'll try to continue.");
       }
     } catch (error) {
       console.warn("✗ Could not validate GitHub identity:", error instanceof Error ? error.message : String(error));
       console.log("Continuing with received token anyway.");
     }

     // Save token to file
     await Deno.writeTextFile(CONFIG.tokenFile, accessToken);
     console.log("\n✅ Authentication successful! Token saved to", CONFIG.tokenFile);
     console.log("══════════════════════════════════════════════════════════\n");

     return accessToken;
   }

  /**
   * Get device code from GitHub
   */
   private async getDeviceCode(): Promise<DeviceCodeResponse> {
     console.log(`Requesting device code from ${CONFIG.endpoints.github.deviceCode}`);
     console.log(`Using client ID: ${CONFIG.clientId}`);

     const requestBody = {
       client_id: CONFIG.clientId,
       scope: "read:user copilot",
     };

     console.log("Request body:", JSON.stringify(requestBody));

     const response = await fetch(CONFIG.endpoints.github.deviceCode, {
       method: "POST",
       headers: {
         "Accept": "application/json",
         "Content-Type": "application/json",
         "User-Agent": "GithubCopilot/1.155.0",
       },
       body: JSON.stringify(requestBody),
     });

     console.log(`Device code response status: ${response.status}`);

     if (!response.ok) {
       const errorText = await response.text();
       console.error("Failed to get device code:", errorText);
       throw new AuthenticationError("Failed to get device code", {
         status: response.status,
         response: errorText
       });
     }

     const data = await response.json();
     console.log("Successfully received device code");
     return data;
   }

  /**
   * Poll for token using device code
   */
   private async pollForToken(deviceCodeResponse: DeviceCodeResponse): Promise<string> {
      const startTime = Date.now();
      const expiresIn = deviceCodeResponse.expires_in * 1000; // Convert to milliseconds
      const interval = deviceCodeResponse.interval * 1000; // Convert to milliseconds
 
      // Track polling attempts and show progress
      let attempts = 0;
      let progressInterval: number | null = null;
      
      // Ensure we have valid data
      if (!deviceCodeResponse.device_code) {
        throw new AuthenticationError("Missing device code in response");
      }

     // Show a simple status with dots to indicate progress
     console.log("Waiting for GitHub authentication");
     progressInterval = setInterval(() => {
       attempts++;
       if (attempts % 10 === 0) {
         console.log(`.${attempts / 10} (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
       }
     }, 1000);

     try {
       while (Date.now() - startTime < expiresIn) {
         try {
           const response = await fetch(CONFIG.endpoints.github.accessToken, {
             method: "POST",
             headers: {
               "Accept": "application/json",
               "Content-Type": "application/json",
               "User-Agent": "GithubCopilot/1.155.0",
             },
             body: JSON.stringify({
               client_id: CONFIG.clientId,
               device_code: deviceCodeResponse.device_code,
               grant_type: "urn:ietf:params:oauth:grant-type:device_code",
             }),
           });

           const responseText = await response.text();
           let data;

           try {
             data = JSON.parse(responseText);
           } catch (e) {
             debug(`Invalid JSON response: ${responseText}`);
             await sleep(interval);
             continue;
           }

           debug(`Poll response [${response.status}]: ${JSON.stringify(data)}`);

           if (!response.ok) {
             if (response.status === 428) {
               // Authorization pending, wait and try again
               await sleep(interval);
               continue;
             }

             throw new AuthenticationError(`Token polling failed with status ${response.status}`, {
               status: response.status,
               response: data,
             });
           }

           if (data.error) {
             if (data.error === "authorization_pending") {
               // Still waiting for user to authorize
               await sleep(interval);
               continue;
             } else if (data.error === "slow_down") {
               // GitHub is asking us to slow down polling
               debug("GitHub requested slow down in polling");
               await sleep(interval * 2);
               continue;
             }

             throw new AuthenticationError(`Token polling failed: ${data.error}`, {
               error: data.error,
               description: data.error_description || "",
             });
           }

           if (!data.access_token) {
             throw new AuthenticationError("No access token in response", {
               response: data,
             });
           }

           return data.access_token;
         } catch (error) {
           if (error instanceof AuthenticationError) {
             throw error;
           }

           // For network errors or other non-auth errors, log and retry
           debug("Error during token polling:", error instanceof Error ? error.message : String(error));
           await sleep(interval);
         }
       }

       throw new AuthenticationError("Device flow authentication timed out");
       } finally {
         // Clear the interval
         if (progressInterval !== null) {
           clearInterval(progressInterval);
           console.log("\nAuthentication process completed");
         }
       }
   }
}

// Create singleton instance
const tokenManager = new TokenManager();

// Export the singleton instance
export { tokenManager };
