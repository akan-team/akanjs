# Fastify + Prisma + React/Vite Stack Appendix

Before editing, inspect the generated Vite starter files and package scripts.

Follow the starter conventions:

- Keep React UI in the Vite client entry and reusable components under `src/components` or `src/ui`.
- Put Fastify API/server code in a clear server module, for example `src/server.ts` or `src/api.ts`.
- Use Prisma with SQLite as the persistence layer, and keep schema/model definitions in `prisma/schema.prisma`.
- Make `bun run dev --host 127.0.0.1` start both the Vite frontend and the Fastify backend needed by the smoke test.
- Do not replace Fastify with another server framework or Drizzle.
- Before finishing, make the configured build command and the shared smoke test pass.
