---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan workflow plan` and `apply` for `create-ui` now write a Zone or a Util, for a database module and for a service module.

`--surface zone` and `--surface util` were advertised but apply refused them. They now write `<Model>.Zone.tsx` and `<Model>.Util.tsx` from the module templates. In a service module (`lib/_camera`, named `camera` or `_camera`) they write a small `Main` Zone or `Action` Util; `view`, `unit` and `template` stay refused there, since a service stores no model. `create-ui` also refuses, at plan and at apply, to overwrite a component file that already exists, which `view`, `unit` and `template` used to do silently.
