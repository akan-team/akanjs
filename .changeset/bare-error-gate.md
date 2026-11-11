---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan lint` holds `server/`, `service/` and `signal/` of the `akanjs` package to the bare built-in `Error`s they construct or extend today (`akan.error.bare-error`): its `akan.baseline.json` records them per file and holds their total, so moving one between files passes and a new one anywhere fails. A change that removes one must lower the section too: `akan lint --no-fix` fails while the recorded total is above the code's, and `akan verify akanjs` or `akan lint akanjs` lowers it. No other package or workspace is measured by it. A baseline committed before a rule is added now adopts that rule with the debt its code held at the fork point.

A generated `errorCodes` guideline lists every code a framework error carries, with its status, whether it is forwarded, and whether the caller's JSON carries it; the `akan-err` skill ships it as a reference.
