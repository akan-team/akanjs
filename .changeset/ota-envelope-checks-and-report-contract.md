---
"akanjs": patch
---

Phone update envelopes are checked the same way on every host, and the update report contract is shared.

- iOS, Android and the server-side `openEnvelope` check an envelope in one order through the shared kernel (`checkUpdateEnvelope`): a trusted, unrevoked signer, strict base64, a manifest of at most 1 MiB, then the signature. Vectors signed with the RFC 8032 test keys run on TypeScript, Swift and Kotlin.
- The report a phone posts to `updates.report.url` (events, reasons, what each status does to a batch, Retry-After, the caps and the dedup key) is one contract in the kernel. `@akanjs/native/api` exports `UpdateReportBody`, `UPDATE_REPORT_EVENTS`, `UPDATE_REPORT_REASONS`, `updateReportOutcome` and the `BundleInfo` / `UpdateManifest` / `UpdateEnvelope` types for a receiving server; `BundleInfo.updates` carries `reportUrl`. A batch is still dropped only on 400, 413 or 422.
- A phone reads its report file once and writes it only when it changes, through the same atomic write as its update state, instead of rewriting it on every return to the foreground. Android no longer throws on a damaged state entry whose sequence is not a finite number.

Upgrade note: Android now refuses an envelope whose manifest or signature is not padded standard base64 without line breaks, as iOS always did; `update publish` never wrote one, but a hand-made signer that wraps lines or drops padding must stop. `updates.publicKeys` must be strict base64 too. Retry-After on the report endpoint is read as whole seconds only; a fraction or sign is ignored, as an HTTP date already was.
