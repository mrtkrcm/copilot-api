FROM denoland/deno:2.0
WORKDIR /app
COPY . .
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "api.ts"]
