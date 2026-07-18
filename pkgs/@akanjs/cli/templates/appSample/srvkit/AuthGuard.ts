import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "AuthGuard.ts",
    content: `import type { Guard, SignalContext } from "akanjs/signal";

// ===== AuthGuard.ts =====
// Convention: srvkit/ folder — server-only helpers, cannot import from client code.
// Implements the Guard interface from akanjs/signal.
// Guards are applied at endpoint/slice declaration: { guards: { root: SignedIn } }.
// Naming: PascalCase .ts, static name property matches the guard identifier.
// Scanned by akan sync into srvkit/index.ts barrel automatically.

export class SignedIn implements Guard {
  static name = "SignedIn";

  canPass(context: SignalContext): boolean {
    const user = context.getHttpContext<{ user?: { id: string } }>().req.user;
    return !!user;
  }
}

// ---- Expandable additional fields: ----
// Role-based guard: only allow users with a specific role
// export class IsAdmin implements Guard {
//   static name = "IsAdmin";
//   canPass(context: SignalContext): boolean {
//     const user = context.getHttpContext<{ user?: { role: string } }>().req.user;
//     return user?.role === "admin";
//   }
// }
`,
  };
}
