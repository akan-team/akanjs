---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

The Akan Graph follows an app's adaptor wiring further. `applyAdaptor(LlmAdaptorRole, ChatCompletionsLlm)` in an app's or lib's `option.ts` draws a `binds` edge from the role, `adaptor::LlmAdaptorRole`, to the implementation it binds, labelled with the app or lib and located at the call, so a method that calls a plugged role reaches the class that answers it. An app service holds the fields its module's lib services plug (`...user.services`), so `this.notifier.getMemo()` in an app method links to the `Notifier` a lib's `MemoService` plugs, where it linked to the `memo` model. A plug imported from a package outside the workspace, `plug(Stripe)` from `stripe-sdk`, is `adaptor::Stripe` with the package in `detail`, where it linked to a same-name adaptor the app declares. Two adaptors with the same class name in one app or lib are two nodes, each with its own location, digest and `plugs`, and a plug reaches the one its import names. A job's `detail` lists only the options its kind honours: `once` on an `initialize` job, `unlocked` on an `interval` or `cron` job; `cron("0 * * * *" as const)` reads `0 * * * *`.

Ids and details that change for a saved graph or a Change Map base:

- Two same-name adaptors of one owner are keyed by file, `adaptor:apps/demo:srvkit/clockB.ts#Clock`, where both read `adaptor:apps/demo:Clock`. An adaptor whose name no other adaptor of its owner shares keeps `adaptor:<owner>:<Name>`.
- A plug imported from a non-workspace package is `adaptor::<Name>` with the package as `detail`.
- A job's `detail` drops `once` and `unlocked` where the runtime ignores them, and `as const` from a cron expression.

- **`binds`** joins `AkanGraphEdgeKind` in `akanjs/common`.
- **`FileFacts.adaptorBindings`** in `@akanjs/language`: each `applyAdaptor(role, adaptor)` call a file makes; `AkanIndex.setFile` also reads non-test files that call `applyAdaptor`.
