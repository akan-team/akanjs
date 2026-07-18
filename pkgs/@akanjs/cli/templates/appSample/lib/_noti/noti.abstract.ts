import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "noti.abstract.md",
    content: `# Noti Abstract

## Akan.js Module Pattern

Noti is a **pure service module** — not a database module. It demonstrates the Akan.js convention
for modules that orchestrate behavior without owning a persistent document model.

Both module types follow the same layer pattern, but service modules have fewer layers:
no constant.ts (no data shape), no document.ts (no DB queries), no UI components.

- noti.service.ts — business logic via serve("noti" as const, ...) (named service, no DB binding)
- noti.signal.ts — real-time pubsub endpoint bound via endpoint(srv.noti, ...)
- noti.store.ts — client state via store("noti" as const, ...) (named store, no signal binding)
- noti.dictionary.ts — i18n via serviceDictionary() (no model field labels)

## Convention: lib/_<service>/ directory naming

- Service modules live under lib/_<service>/ — the underscore prefix signals "this is a service, not a database model."
- Files drop the underscore: lib/_noti/noti.service.ts, not lib/_noti/_noti.service.ts.
- Scan registers into the same barrel files: srv.ts, sig.ts, st.ts, dict.ts.

## Convention: named serve/store (no DB binding)

- serve("noti" as const, ...) — service name passed as string, no db.<module> binding.
- store("noti" as const, ...) — store name passed as string, no sig.<module> binding.

## Related Modules

- lib/task/ — database module reference (compare structure differences)
- lib/__scalar/workHistory/ — reusable scalar field modules (double-underscore prefix, embedded in models)
`,
  };
}
