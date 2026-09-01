import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "AuthGuard.ts",
    content: `import type { Guard, GuardScope, SignalContext } from "akanjs/signal";

// ===== AuthGuard.ts =====
// Convention: srvkit/ folder — server-only helpers, cannot import from client code.
// Implements the Guard interface from akanjs/signal.
// Guards are applied at endpoint/slice declaration: { guards: { root: SignedIn } }.
// Naming: PascalCase .ts, static name property matches the guard identifier.
// Scanned by akan sync into srvkit/index.ts barrel automatically.

export class SignedIn implements Guard {
  static name = "SignedIn";
  // "account" — the verdict reads the caller and nothing about the call, so an MCP catalogue can evaluate it with
  // no arguments and hide what this caller certainly cannot use. Required: "resource" is never evaluated for a
  // listing, so a guard like this one marked that way would filter nothing.
  static scope: GuardScope = "account";

  canPass(context: SignalContext): boolean {
    // Reads the account the middleware resolved, so the same guard answers over HTTP, a websocket and MCP alike.
    return !!context.get<{ id?: string }>("account");
  }
}

// ---- Expandable additional fields: ----
// Role-based guard: only allow users with a specific role
// export class IsAdmin implements Guard {
//   static name = "IsAdmin";
//   static scope: GuardScope = "account";
//   canPass(context: SignalContext): boolean {
//     return context.get<{ role?: string }>("account")?.role === "admin";
//   }
// }
`,
  };
}
