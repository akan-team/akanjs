---
"@akanjs/cli": patch
---

Two agent rules now match the code. The secret-field rule showed `this.userModel.pickById(id, { passwordHash: true })`, which does not typecheck: the model facade is `this.User` in the Model class and `this.userModel.User` from a service, and both the module rule and the query guideline now say so. The auth rule says where the scaffold's `root: None, cru: None` comes from: `Admin` belongs to `libs/shared`, and an app without that lib is scaffolded shut until it names a guard of its own. The byte budgets of `.claude/rules/akan/module.md` (+68), `.claude/rules/akan/auth.md` (+140) and the `akan-query` skill's `queryRule.md` (+214) are raised on purpose.
