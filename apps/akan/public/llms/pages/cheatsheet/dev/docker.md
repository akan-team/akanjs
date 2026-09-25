# Docker

- Source: /cheatsheet/dev/docker
- Mirror: /llms/pages/cheatsheet/dev/docker.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Docker (#overview)
- Minimal Compose (#compose)
- Open Console (#console)
- Important Env (#env)
- Scale With AKAN_REPLICA (#replica)
- Tips (#tips)

## Content

Docker

For a small edge server, start with one Akan app container.

Expose the app on port 8282. Route to service port 80.

Mount sqlite data so local data survives container restarts.

Mount logs so troubleshooting does not depend on container lifetime.

Minimal Compose

This is a simplified example for one app. Replace `myapp` and the image name with your app.

Open Console

`akan build` embeds `console.js` next to `main.js`, so you can open an operator console without creating files inside the container.

Set `AKAN_CONSOLE=1` only on the exec command for production-like environments.

Docker exec

Important Env

`AKAN_PUBLIC_OPERATION_MODE=edge`: tells the app it is running as an edge deployment.

`AKAN_SQLITE_DIR`: keeps sqlite files in a mounted folder.

`AKAN_LOG_DIR`: keeps runtime logs outside the container filesystem.

`AKAN_REPLICA`: controls child process roles for scaling.

Scale With AKAN_REPLICA

`AKAN_REPLICA` is a compact way to choose how many federation, batch, and all-purpose child processes the app starts.

Replica examples

Tips

Keep the first compose file boring. Add extra services only when the app really needs them.

Back up the sqlite volume before replacing edge hardware.

Check logs from the mounted folder when the container restarts repeatedly.

## Code Examples

### docker-compose.yaml

```ts
version: "3.8"

services:
  myapp:
    image: registry.mydomain.com/myorg/myapp:latest
    container_name: myapp
    restart: unless-stopped
    ports:
      - "8282:80"
    environment:
      AKAN_REPLICA: "1,0,0"
      AKAN_PUBLIC_APP_NAME: myapp
      AKAN_PUBLIC_ENV: main
      AKAN_PUBLIC_OPERATION_MODE: edge
      AKAN_PUBLIC_SERVE_DOMAIN: example.com
      AKAN_SQLITE_DIR: /workspace/sqlite
      AKAN_LOG_DIR: /workspace/logs
    volumes:
      - ./sqlite:/workspace/sqlite
      - ./logs:/workspace/logs
```

### Code

```bash
docker exec -it myapp sh -lc 'AKAN_CONSOLE=1 bun console.js'
```

### Code

```ts
AKAN_REPLICA="1,0,0"  # one request-serving child
AKAN_REPLICA="2,1,0"  # two request children and one batch child
AKAN_REPLICA="0,0,1"  # one all-purpose child
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

