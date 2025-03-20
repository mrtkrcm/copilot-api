# Copilot API

A streamlined GitHub Copilot API client for efficient integration with OpenAI's completions API.

## Overview

This API provides a clean, efficient interface to GitHub Copilot's capabilities with a focus on simplicity and maintainability. The implementation emphasizes:

- Minimal dependencies
- Clear error handling
- Sensible defaults
- Simple architecture

## Structure

The codebase is organized in a flat structure with 7 core files:

- **api.ts** - Main server and request handling
- **types.ts** - Core types and error handling
- **config.ts** - Configuration management
- **token.ts** - Authentication and token management
- **completion.ts** - OpenAI API integration
- **models.ts** - Dynamic model discovery and management
- **utils.ts** - Utility functions and helpers

## Features

### API Endpoints

- `/health` - Health check endpoint
- `/metrics` - Performance metrics and statistics
- `/v1/completions` - Core completions endpoint
- `/v1/models` - Available models endpoint

### Key Features

- **Simple Error System** - Three-tier error hierarchy for clear error handling
- **Flexible Configuration** - Environment-variable based configuration with sensible defaults
- **Unified Response Handling** - Single utility for JSON and streaming responses
- **Efficient Token Management** - Automated token refresh and authentication
- **Direct OpenAI Integration** - Streamlined API integration with retry capabilities
- **Built-in Safety Mechanisms** - Rate limiting and circuit breaker protection
- **Dynamic Model Discovery** - Automatic fetching and caching of available models

## Getting Started

### Prerequisites

- Deno 2.x or later

### Installation

```bash
# Clone the repository
git clone https://github.com/mrtkrcm/copilot-api.git
cd copilot-api

# Run the server
deno task start
```

### Configuration

Configuration is handled through environment variables with sensible defaults. Key variables include:

- `COPILOT_CLIENT_ID` - GitHub OAuth client ID
- `COPILOT_SECRET_FILE` - Path to token storage file
- `COPILOT_PORT` - Server port (default: 8080)
- `COPILOT_HOSTNAME` - Server hostname (default: 0.0.0.0)
- `COPILOT_DEFAULT_MODEL` - Default model to use (default: "gpt-4o")
- `COPILOT_MODELS_CACHE_TTL_MS` - TTL for models cache in milliseconds (default: 3600000)

## API Usage

### Basic Completion Request

```bash
curl -X POST http://localhost:8080/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "function reverseString(str) {",
    "max_tokens": 100,
    "temperature": 0.7
  }'
```

### Streaming Completion

```bash
curl -X POST http://localhost:8080/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "function reverseString(str) {",
    "max_tokens": 100,
    "temperature": 0.7,
    "stream": true
  }'
```

### List Available Models

```bash
curl http://localhost:8080/v1/models
```

### Get Model Details

```bash
curl http://localhost:8080/v1/models/gpt-4o
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Legal Notices

### Disclaimer

This project is an unofficial API client for GitHub Copilot and is not affiliated with, officially maintained by, or in any way officially connected with GitHub, Inc. or any of its subsidiaries or affiliates.

### GitHub Copilot Terms

- The use of GitHub Copilot through this API is subject to [GitHub's Terms for Additional Products and Features](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#github-copilot).
- You must have a valid GitHub Copilot license to use this API.
- The code suggestions ("Suggestions") returned by GitHub Copilot are not owned by GitHub. You retain ownership of your code and are responsible for the suggestions you include in your code.
- It is recommended to have reasonable policies and practices in place to ensure that any used suggestions do not violate the rights of others.

### Data Collection Notice

GitHub Copilot may collect and process:
- Prompts, suggestions, and code snippets based on your settings
- Usage information tied to your account
- Additional data as described in the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement)

### Acceptable Use

Your use of this API and GitHub Copilot must comply with GitHub's Acceptable Use Policies. You may not:
- Use prompts with content that is unlawful or prohibited by GitHub's policies
- Use the API for cryptomining or unauthorized access
- Place disproportionate burden on GitHub's servers
- Use the service for any purpose unrelated to software development

### Third-Party Terms

This project interacts with GitHub Copilot, which is subject to its own terms and conditions. Your use of GitHub Copilot through this API is governed by:

- [GitHub Terms for Additional Products and Features](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)
- [GitHub Copilot Product Specific Terms](https://github.com/customer-terms/github-copilot-product-specific-terms)
- [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement)

GitHub® and GitHub Copilot® are registered trademarks of GitHub, Inc. This project is not endorsed by or affiliated with GitHub, Inc.
