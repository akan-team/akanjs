---
"akanjs": patch
---

Akan Studio lands on the Runtime view in two more cases where no dev builder can draw the others, and says the right thing when web is off.

- **An empty or unknown `view`** (`/_akan/studio?view=`, `?view=bogus`) lands on Runtime when the server has no dev builder, as a bare `/_akan/studio` already did. It used to answer the ERD's 503.
- **A builder that never answers.** When the builder RPC times out, a bare `/_akan/studio` lands on Runtime instead of answering 503. A view asked for by name still answers 503 inside Studio's nav with the timeout, and a failed build still shows its error without landing.
- **Web off.** On a server that serves the API only (`AKAN_SSR=false` or `setWeb(false)`), a builder view says the builder is reached only with the web surface on, instead of telling you to open it under `akan start`, which does not change that.
