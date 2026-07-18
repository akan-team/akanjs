# Akan.js Stack Appendix

Before editing, read the generated `AGENTS.md`, `.cursor/rules/akan.mdc`, and the existing scaffold under `apps/taskboard`.

Follow Akan.js conventions:

- Keep route files in `apps/taskboard/page/`; put reusable UI in `apps/taskboard/ui/` and domain code in `apps/taskboard/lib/`.
- Model users, teams, and tasks as domain modules under `apps/taskboard/lib/user`, `apps/taskboard/lib/team`, and `apps/taskboard/lib/task`.
- For CRUD domain modules, keep responsibilities split across `*.constant.ts`, `*.document.ts`, `*.service.ts`, `*.signal.ts`, `*.store.ts`, and UI files.
- Put SQLite persistence and queries in `*.document.ts`, business workflow in `*.service.ts`, API contracts in `*.signal.ts`, and client fetch/state actions in `*.store.ts`.
- Do not create a parallel REST/API framework, separate server, Prisma/Drizzle schema, or page-local persistence layer.
- Do not manually edit generated Akan files such as `akan.app.json`, `client.ts`, `server.ts`, `lib/cnst.ts`, `lib/sig.ts`, `lib/st.ts`, `lib/srv.ts`, or module `index.ts` files.
- Before finishing, make `bun run akan lint taskboard`, `bun run akan build taskboard`, and the shared smoke test pass.
