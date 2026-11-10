---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan remove-module` now removes a service module named exactly, as in `akan remove-module pokedex:_billing` for `apps/pokedex/lib/_billing`. Before, no command could remove a service module: `remove-module` left out every `lib/_<name>` folder and refused one by name with `Invalid module name: _billing`. A service module left out or misnamed gets the same refusal as any target of a remove command, and its choices now list the service modules. `create-view`, `create-unit`, `create-template` and `create-crud-page` still take only a model module. A command opts in to service modules by taking `ModuleOrService` instead of `Module`.
