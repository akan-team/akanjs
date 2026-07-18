# Quick Start

- Source: /docs/intro/quickstart
- Mirror: /llms/pages/docs/intro/quickstart.md
- Section: docs
- Category: Introduction
- Priority: P0

## Headings

- Quick Start (#quick-start)
- Requirements (#requirements)
- Create a Workspace (#create-workspace)
- Run the App (#run-app)
- Build (#build)

## Content

Quick Start

This guide gets you from an empty directory to a running Akan application.

Along the way, you will see the Akan way: describe business intent once, then let conventions connect pages, APIs, services, stores, data, and deployment surfaces.

Akan.js is monorepo-native. App execution, production builds, library development, and package management all happen from the workspace root.

After reading this guide, you will know how to create a workspace, start the local runtime, find the first files to edit, and build the app for production.

Requirements

For the first run, Bun is the only required dependency. Docker and native IDEs become useful when you add local services or mobile builds.

Bun 1.3.13 or higher

Docker for local database services

Android Studio or Xcode for native app builds

Create a Workspace

Start with the workspace creator. It asks a few questions, then lays out the monorepo conventions Akan uses for apps, libraries, pages, and domain modules.

Run terminal commands without copying the leading prompt symbol.

If you prefer a globally installed CLI, the same lifecycle is available through the akan command.

Run the App

Start the local Akan runtime with one command. It scans the workspace, reads the conventions, prepares generated artifacts, and opens the app.

By default, the local gateway listens on http://localhost:8282. Pages, API calls, WebSocket traffic, and generated assets all flow through this runtime.

Now the app is running through the Akan gateway. Edit a page and the same workspace can serve web, app-oriented client surfaces, API traffic, realtime traffic, and generated assets.

Edit a page

Akan pages live under apps/<app>/page. Index pages use the _index.tsx convention, so the first screen of myapp is apps/myapp/page/_index.tsx.

Change the component and refresh the local gateway to confirm your first UI change.

Open http://localhost:8282 to see the page through the Akan gateway.

The runtime uses the same page convention for the surfaces Akan builds, so you work in one page tree instead of maintaining separate client projects.

Know the app entry

The generated main.ts starts the Akan runtime. Most application work happens in pages and domain modules, so you rarely need to edit this file.

When akan start is running, the terminal shows the local runtime status. Use the gateway URL for pages and generated runtime surfaces.

Build

When the app is ready to ship, build it with the same conventions. Akan generates the server artifact, route manifests, client entries, static assets, and package metadata needed for production.

The production build result is generated in the dist/apps/myapp directory.

## Code Examples

### Terminal

```bash
bunx create-akan-workspace
```

### Terminal

```bash
bun install -g @akanjs/cli
akan create-workspace myorg --app myapp
cd myorg
```

### Terminal

```bash
akan start myapp --open
```

### apps/myapp/page/_index.tsx

```ts
export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center text-2xl">
      Hello Akan.js! 🎉
    </div>
  );
}
```

### apps/myapp/main.ts

```ts
import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp().start();
};

void run();
```

### Terminal

```bash
...
...
[AkanApp] INFO  AkanApp gateway is running on port 8282 +7ms
...
...
```

### Terminal

```bash
akan build myapp
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

