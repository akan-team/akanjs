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

Akan.js is a full-stack TypeScript framework that prioritizes designing and implementing actual business code.

You can build a type-safe service with minimal code and deploy it to web, mobile, server, and DB infrastructure at the same time.

This guide takes you from an empty directory to a running app.

Requirements

Bun is the only required dependency for the first run.

Bun 1.4.0 or higher

Git for source code management

Android Studio or Xcode for native app builds

Create a Workspace

The quickest way is to let your coding agent do it. Open Claude Code or Codex in an empty directory and paste this prompt. It checks Bun, creates the workspace and starts the app:

To create it yourself, run the workspace creator. It asks for a workspace name and an app name:

Or use the globally installed akan command:

Run the App

Start the app with one command:

The app opens on http://localhost:8282. The dev port is 8282 plus the app's index in alphabetical order, so the only app is 8282.

Edit a page

Akan pages live under apps/<app>/page. Edit the first screen and refresh:

Know the app entry

The generated main.ts starts the Akan runtime.

The terminal shows the local runtime status.

Build

Build the app for production:

The result is generated in the dist/apps/myapp directory.

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
import { page } from "akanjs/client";

export default page().render(() => {
  return (
    <div className="flex min-h-screen items-center justify-center text-2xl">
      Hello Akan.js! 🎉
    </div>
  );
});
```

### apps/myapp/main.ts

```ts
import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp().start();
};

void run();
```

### Terminal

```bash
...
...
[AkanApp] INFO  AkanApp gateway is running on port http://localhost:8282 +7ms
...
...
```

### Terminal

```bash
akan build myapp
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

