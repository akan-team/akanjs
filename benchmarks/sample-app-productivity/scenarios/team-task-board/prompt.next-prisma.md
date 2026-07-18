# Next.js + Prisma Stack Appendix

Before editing, inspect the generated Next.js starter files and package scripts.

Follow the starter conventions:

- Use the App Router under `src/app`; keep route handlers, pages, and layouts in the appropriate `src/app` segments.
- Put shared UI and domain helpers outside route files, for example under `src/components` and `src/lib`.
- Use Prisma with SQLite as the persistence layer, and keep schema/model definitions in `prisma/schema.prisma`.
- Keep database access in server-side code only; do not call Prisma from client components.
- Use React client components only where browser interaction is required.
- Do not replace Next.js with a separate REST framework or Vite app.
- Before finishing, make the configured build command and the shared smoke test pass.
