# Hono + Drizzle + React/Vite Stack Appendix

Before editing, inspect the generated Vite starter files and package scripts.

Follow the starter conventions:

- Keep React UI in the Vite client entry and reusable components under `src/components` or `src/ui`.
- Put Hono API/server code in a clear server module, for example `src/server.ts` or `src/api.ts`.
- Use Drizzle with SQLite as the persistence layer, with schema definitions kept separate from React components.
- Make `bun run dev --host 127.0.0.1` start both the Vite frontend and the Hono backend needed by the smoke test.
- Do not replace Hono with another server framework or Prisma.
- Before finishing, make the configured build command and the shared smoke test pass.
