---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan remove-application`, `remove-library`, `remove-package`, `remove-module` and `remove-scalar` no longer delete a target they picked themselves. Left out, or named but not in the workspace, the target is refused in a terminal or not, with the choices and the line to rerun, such as ``Missing app: this command deletes files and never picks its target, so rerun it as `akan remove-application <app>` (choices: pokedex).`` Before, `akan remove-application` in a one-app workspace removed `apps/<app>` without asking, and without a terminal `akan remove-scalar <name>` removed the scalar from the only app or lib. A terminal is no longer offered a select for these commands. Other commands still take the only app, or the only app or lib without a terminal, as before. A command declares this with `destructive: true` on its target.
