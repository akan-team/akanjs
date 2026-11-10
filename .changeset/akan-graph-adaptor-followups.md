---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

The Akan Graph follows an app's adaptor wiring further. `applyAdaptor(LlmAdaptorRole, ChatCompletionsLlm)` in an app's or lib's `option.ts` draws a `binds` edge from the role, `adaptor::LlmAdaptorRole`, to the implementation it binds, labelled with the app or lib and located at the call, so a method that calls a plugged role reaches the class that answers it. `get_graph` scoped to an app keeps that app's bindings, or a lib's where the app binds the role itself nowhere; scoped to a lib or a module it keeps every binding of a role it reaches; and a Change Map seen from one app drops other apps' bindings. An app service holds the fields its module's lib services plug (`...user.services`), so `this.notifier.getMemo()` in an app method links to the `Notifier` a lib's `MemoService` plugs, where it linked to the `memo` model; a service whose own builder declares the field (`notifier: use<…>()`) inherits nothing. A plug imported from a package outside the workspace, `plug(Stripe)` from `stripe-sdk`, or through a lib's one-line re-export of it, is `adaptor:stripe-sdk:Stripe` with the package in `detail`, where it linked to a same-name adaptor the app declares or to an unlocated `adaptor:libs/util:Stripe`. Two adaptors with the same class name in one app or lib are two nodes, each with its own location, digest and `plugs`, and a plug reaches the one its import names. A job's `detail` lists only the options its kind honours: `once` on an `initialize` job, `unlocked` on an `interval` job (`Bun.cron` never overlaps a cron job, so `lock: false` changes nothing there); `cron("0 * * * *" as const)` reads `0 * * * *`.

Ids and details that change for a saved graph or a Change Map base:

- While two adaptors of one owner share a class name, each is keyed by its file, `adaptor:apps/demo:srvkit/clockB.ts#Clock`; an adaptor whose name no other adaptor of its owner shares keeps `adaptor:<owner>:<Name>`. The Change Map treats the two forms of one declaration as one node, so a second same-name adaptor shows as one added node, not a removal of the first.
- A plug from a non-workspace package is `adaptor:<package>:<Name>` with the package as `detail`, where it was `adaptor::<Name>` or a workspace adaptor of that name.
- A job's `detail` drops `once` and `unlocked` where the runtime ignores them, and `as const` from a cron expression.

- **`binds`** joins `AkanGraphEdgeKind` in `akanjs/common`.
- **`FileFacts.adaptorBindings`** in `@akanjs/language`: each `applyAdaptor(role, adaptor)` call a file makes; `AkanIndex.setFile` also reads non-test files whose text mentions `applyAdaptor`. **`ServiceClassFact.fields`**: the names a service's builder declares.
