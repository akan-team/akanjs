---
"akanjs": patch
---

- **The logger masks more secret names.** Logger redaction (inline data and `attrs`) and the server env profile's secret scanner now follow one rule, `Logger.isSecretKey(name)`. The logger used to mask only password, token, JWT, authorization, cookie, secret, API key and private key names. It now also masks passphrase, a bare `pass`, `pwd`, access, auth, hash, signing, encryption, master and session keys, webhook, `cred`, names ending in `dsn`, connection string, IAP verify and service account. Before this, a webhook URL, a DSN, a cloud access key or a mailer's `pass` could reach a log record in the clear.
- **A malformed pipeline secret name is not echoed.** `PipelineNames.secretNameError` says "the name is not a secret name (…)", and the plan schema and the config reader point at the item by its index (`…secrets[2]`). A reserved name is still named, since it is one of the executor's own.
- **`@akanjs/native/api` exports `ServerPolicy`**: the `restart` and `watchdog` of a desktop app's carried server. The launcher and the build both read it through one `serverPolicyOf`.

Upgrade note: a log search or alert that matched the value of one of the newly masked keys now sees `[redacted]` instead.
