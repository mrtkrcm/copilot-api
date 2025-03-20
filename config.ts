import { ValidationError } from "./types.ts";

// Explicitly define the headers interface
export interface HeadersConfig {
  "accept": string;
  "editor-version": string;
  "editor-plugin-version": string;
  "content-type": string;
  "user-agent": string;
  "accept-encoding": string;
  "openai-organization"?: string;
  [key: string]: string | undefined;
}

// Core configuration interface with essential parameters
export interface CopilotConfig {
  // Core settings
  clientId: string;
  tokenFile: string;

  // Server settings
  port: number;
  hostname: string;

  // Model settings
  model: {
    default: string;
  };

  // API endpoints (only if need to override defaults)
  endpoints?: {
    github?: {
      deviceCode?: string;
      accessToken?: string;
      copilotToken?: string;
      models?: string;
    };
    openai?: {
      completions?: string;
    };
  };
  
  // Headers configuration
  headers?: Partial<HeadersConfig>;
}

// Default configuration that rarely changes
const DEFAULT_CONFIG = {
  apiTimeout: 30000,
  maxRetries: 3,
  includeStackTraces: false,
  maxTokens: 150,
  temperature: 0.7,
  modelsCacheTTLMs: 3600000, // 1 hour
  rateLimit: {
    requestsPerMinute: 50,
    burstSize: 10,
  },
  endpoints: {
    github: {
      deviceCode: "https://github.com/login/device/code",
      accessToken: "https://github.com/login/oauth/access_token",
      copilotToken: "https://api.github.com/copilot_internal/v2/token",
      models: "https://api.github.com/copilot_internal/v2/engines",
    },
    openai: {
      completions: "https://copilot-proxy.githubusercontent.com/v1/engines/copilot-codex/completions",
    },
  },
  headers: {
    "accept": "application/json",
    "editor-version": "Neovim/0.6.1",
    "editor-plugin-version": "copilot.vim/1.16.0",
    "content-type": "application/json",
    "user-agent": "GithubCopilot/1.155.0",
    "accept-encoding": "gzip,deflate,br",
  },
  cors: {
    origin: "*",
    methods: "GET, POST, OPTIONS",
    headers: "Content-Type, Authorization",
    maxAge: "86400",
  },
};

/**
 * Load configuration with sensible defaults
 */
function loadConfig(): CopilotConfig & typeof DEFAULT_CONFIG {
  const env = Deno.env.toObject();

  // Only expose commonly modified settings in the main config
  const userConfig: CopilotConfig = {
    // Core settings
    clientId: env.COPILOT_CLIENT_ID || "Iv1.b507a08c87ecfe98",
    tokenFile: env.COPILOT_SECRET_FILE || ".copilot_secret",

    // Server settings
    port: parseInt(env.COPILOT_PORT || "4004"),
    hostname: env.COPILOT_HOSTNAME || "0.0.0.0",

    // Model settings
    model: {
      default: env.COPILOT_DEFAULT_MODEL || "gpt-4o",
    },
  };

  // Allow overriding endpoints if needed
  if (
    env.COPILOT_DEVICE_CODE_URL || env.COPILOT_ACCESS_TOKEN_URL ||
    env.COPILOT_TOKEN_URL || env.COPILOT_MODELS_URL || env.COPILOT_COMPLETIONS_URL
  ) {
    userConfig.endpoints = {
      github: {
        deviceCode: env.COPILOT_DEVICE_CODE_URL,
        accessToken: env.COPILOT_ACCESS_TOKEN_URL,
        copilotToken: env.COPILOT_TOKEN_URL,
        models: env.COPILOT_MODELS_URL,
      },
      openai: {
        completions: env.COPILOT_COMPLETIONS_URL,
      },
    };
  }

  // Merge with defaults
  // Create a properly merged config with required fields
  const mergedConfig = { 
    ...DEFAULT_CONFIG,
    ...userConfig,
    endpoints: {
      github: {
        ...DEFAULT_CONFIG.endpoints.github,
        ...userConfig.endpoints?.github
      },
      openai: {
        ...DEFAULT_CONFIG.endpoints.openai,
        ...userConfig.endpoints?.openai
      }
    },
    headers: {
      ...DEFAULT_CONFIG.headers,
      ...userConfig.headers
    }
  };
  
  return mergedConfig;
}

/**
 * Validates essential configuration
 * @throws {ValidationError} If configuration is invalid
 */
function validateConfig(config: CopilotConfig & typeof DEFAULT_CONFIG): void {
  if (config.port < 0 || config.port > 65535) {
    throw new ValidationError("Port must be between 0 and 65535", { field: "port" });
  }
}

// Create and validate configuration
const config = loadConfig();
validateConfig(config);

export const CONFIG = config;
export { DEFAULT_CONFIG };
