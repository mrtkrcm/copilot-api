FROM denoland/deno:latest
WORKDIR /app
COPY . .
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "api.ts"]
