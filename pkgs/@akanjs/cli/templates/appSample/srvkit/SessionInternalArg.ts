import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "SessionInternalArg.ts",
    content: `import type { InternalArg, SignalContext } from "akanjs/signal";

// ===== SessionInternalArg.ts =====
// Convention: srvkit/ folder — server-only helpers.
// Implements the InternalArg interface from akanjs/signal.
// InternalArg is an auto-injected argument for resolveField/endpoint .with() chains.
// Appended to a query/mutation via: .with(CurrentUserId, { nullable: true }).exec(...)
// Naming: PascalCase .ts, class name = arg identifier.
// Scanned by akan sync into srvkit/index.ts barrel automatically.

export class CurrentUserId implements InternalArg<string | null> {
  getArg(context: SignalContext): string | null {
    // \`context.get\` reads what the account middleware resolved, on every transport. Branching on
    // \`getHttpContext()\` would return null for the same caller arriving over a websocket or MCP.
    return context.get<{ id?: string }>("account")?.id ?? null;
  }
}

// ---- Expandable additional fields: ----
// Inject current session language/locale
// export class CurrentLocale implements InternalArg<string> {
//   getArg(context: SignalContext): string {
//     return context.get<string>("locale") ?? "en";
//   }
// }
`,
  };
}
