---
"akanjs": patch
---

Phone update envelopes are checked the same way on every host, and the update report contract is shared.

- iOS, Android and the server-side `openEnvelope` check an envelope in one order through the shared kernel (`checkUpdateEnvelope`): a trusted, unrevoked signer, strict base64, a manifest of at most 1 MiB, then the signature. Vectors signed with the RFC 8032 test keys run on TypeScript, Swift and Kotlin.
- The report a phone posts to `updates.report.url` (events, reasons, what each status does to a batch, Retry-After, the caps and the dedup key) is one contract in the kernel. `@akanjs/native/api` exports `UpdateReportBody`, `UPDATE_REPORT_EVENTS`, `UPDATE_REPORT_REASONS`, `updateReportOutcome` and the `BundleInfo` / `UpdateManifest` / `UpdateEnvelope` types for a receiving server; `BundleInfo.updates` carries `reportUrl`. A batch is dropped only on 400, 413 or 422, and Retry-After is read as whole seconds only; a fraction, a sign or an HTTP date is ignored.
- A phone reads its report file once and writes it only when it changes, through the same atomic write as its update state.

Upgrade note: `updates.publicKey` must be padded standard base64 without line breaks, as `akan-native update keygen` prints it, and so must each of `publicKeys`; 3.0.2 took any form Node could decode, which left an iOS build with no updates. An envelope's manifest and signature must be strict base64 too, or every phone refuses it: `update publish` never writes anything else, but a hand-made signer that wraps lines or drops padding must stop.
