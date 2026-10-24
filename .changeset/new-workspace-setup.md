---
"@akanjs/cli": patch
---

A new workspace with the `shared` or `util` library now passes `akan typecheck` and `akan build`: `akan create-workspace` writes `@types/react` and `@types/react-dom` into its devDependencies, and `akan install-library` adds `@types/react-dom` with `shared` and `@types/nodemailer` with `util`, whose `react-dom` and `nodemailer` imports had no declaration file before. Upgrade note: a workspace created earlier adds them with `bun add -d @types/react @types/react-dom`, plus `@types/nodemailer` if it installed `util`.
