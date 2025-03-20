#!/bin/sh
# Start script for Copilot API

# Run the API server with appropriate permissions
deno run --allow-net --allow-env --allow-read --allow-write api.ts "$@"