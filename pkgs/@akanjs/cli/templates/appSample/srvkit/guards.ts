import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "guards.ts",
    content: `import type { Guard, GuardScope, SignalContext } from "akanjs/signal";

// ===== guards.ts =====
// Convention: srvkit/ folder — server-only helpers, cannot import from client code.
// Implements the Guard interface from akanjs/signal.
// Guards are applied at endpoint/slice declaration: { guards: { root: SignedIn } }.
// Naming: camelCase file, PascalCase classes; each static name matches its guard identifier.
// Scanned by akan sync into srvkit/index.ts barrel automatically.

export class SignedIn implements Guard {
  static name = "SignedIn";
  // "account" — the verdict reads the caller and nothing about the call, so an MCP catalogue can evaluate it with
  // no arguments and hide what this caller certainly cannot use. Required: "resource" is never evaluated for a
  // listing, so a guard like this one marked that way would filter nothing.
  static scope: GuardScope = "account";

  canPass(context: SignalContext): boolean {
    // Reads the account the middleware resolved, so the same guard answers over HTTP, a websocket and MCP alike.
    // A guest still has an account — libs/shared resolves one to \`{ appName, environment }\` — so only an
    // identity on it proves a sign-in: your own middleware's \`id\`, or libs/shared's \`self\` (user) / \`me\` (admin).
    const account = context.get<{ id?: string; self?: { id?: string }; me?: { id?: string } }>("account");
    return !!(account?.id ?? account?.self?.id ?? account?.me?.id);
  }
}

// Open locally and under \`akan test\` so the sample works before sign-in; once the app signs users in, use SignedIn.
export class LocalOrSignedIn implements Guard {
  static name = "LocalOrSignedIn";
  static scope: GuardScope = "account";

  canPass(context: SignalContext): boolean {
    const environment = process.env.AKAN_PUBLIC_ENV;
    return environment === "local" || environment === "testing" || new SignedIn().canPass(context);
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
