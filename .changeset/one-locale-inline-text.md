---
"@akanjs/cli": patch
---

The `ts` rule and the root guide's "Code Style" now say an app whose `i18n.locales` names one locale writes the text a user reads inline. `l.trans` and a dictionary entry each take a second language, which such an app never serves, so the rule was not followed there. An app with two or more locales keeps the rule as it was, and adding a locale later means moving each inline string into `l()` by hand.
