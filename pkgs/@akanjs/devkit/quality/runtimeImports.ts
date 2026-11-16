import path from "node:path";
import type { RuntimeFamily } from "./runtimeNameTable";

export type RuntimeImportKind =
  | "client"
  | "useClient"
  | "usePage"
  | "st"
  | "sig"
  | "piece"
  | "_st"
  | "_useClient"
  | "framework-store"
  | "framework-client"
  | "framework-fetch"
  | "framework-deep";

export interface RuntimeImportTarget {
  scope: string | null;
  kind: RuntimeImportKind;
}

export type RuntimeHandleKind =
  | "st"
  | "root"
  | "self"
  | "state"
  | "fetch"
  | "signal"
  | "akanjs/store"
  | "akanjs/client"
  | Exclude<RuntimeFamily, "fetch">;

export interface RuntimeHandle {
  kind: RuntimeHandleKind;
  members?: ReadonlySet<string>;
}

export type RuntimeBinding =
  | { type: "handle"; handle: RuntimeHandle }
  | { type: "rootStore" }
  | { type: "storeFactory" }
  | { type: "whole"; name: string };

export type RuntimeImportUse =
  | { binding: RuntimeBinding }
  | { reason: "unknown-name" | "whole-runtime-import"; why: string }
  | null;

const runtimePathPattern =
  /^((?:apps|libs)\/[^/]+)\/(client|lib\/useClient|lib\/usePage|lib\/st|lib\/sig|lib\/__client\/.+)$/;
const frameworkPathPattern = /^akanjs\/(store|client|fetch)(\/.+)?$/;
const quotedPattern = /(?=(["'])((?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\n\r])*)\1)|(?=`((?:\\[\s\S]|[^\\`])*)`)/g;
const loaderPattern = /\brequire\b|\bimport\s*(?:\(|\/[/*])/;
const escapePattern = /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g;
const simpleEscapes: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
  "\r\n": "",
  "\n": "",
  "\r": "",
  " ": "",
  " ": "",
};
const quietNames = new Set(["usePage", "msg", "Err"]);
const wholePieces = new Set(["_st", "_useClient"]);
//? Each of these hands out the tab's one root store or fetch client, so a name read through it is not visible here.
const frameworkWholeNames = new Set([
  "RootStore",
  "StoreRegistry",
  "StoreInstance",
  "base",
  "BaseStore",
  "StoreCatalogue",
  "StoreSurfaceSource",
  "ensureStoreSurface",
  "AgentBridge",
  "AgentContext",
  "FetchClient",
]);

export class RuntimeImports {
  static readonly frameworkWholeNames: ReadonlySet<string> = frameworkWholeNames;

  static mayUseRuntime(text: string, fileName: string) {
    if (loaderPattern.test(text)) return true;
    for (const [, , quoted, template] of text.matchAll(quotedPattern)) {
      const raw = quoted ?? template?.replace(/\r\n?/g, "\n") ?? "";
      if (RuntimeImports.targetOf(RuntimeImports.#decode(raw), fileName)) return true;
    }
    return false;
  }

  static targetOf(specifier: string, fileName: string): RuntimeImportTarget | null {
    const fileScope = fileName.match(/^((?:apps|libs)\/[^/]+)\//)?.[1] ?? null;
    if (specifier.startsWith("akanjs/")) {
      const framework = RuntimeImports.#stripped(path.posix.normalize(specifier)).match(frameworkPathPattern);
      const [, facet, deep] = framework ?? [];
      if (!facet || (facet === "client" && deep && /^\/native(?:\/|$)/.test(deep))) return null;
      return { scope: fileScope, kind: deep ? "framework-deep" : (`framework-${facet}` as RuntimeImportKind) };
    }
    const aliased = specifier.match(/^@(apps|libs)\/([\s\S]+)$/);
    const joined = aliased
      ? `${aliased[1]}/${aliased[2]}`
      : specifier.startsWith(".")
        ? path.posix.join(path.posix.dirname(fileName), specifier)
        : null;
    const match =
      joined === null ? null : RuntimeImports.#stripped(path.posix.normalize(joined)).match(runtimePathPattern);
    if (!match?.[1] || !match[2]) return null;
    const piece = match[2].match(/^lib\/__client\/(.+)$/)?.[1];
    const kind = piece === undefined ? match[2].replace(/^lib\//, "") : wholePieces.has(piece) ? piece : "piece";
    return { scope: match[1], kind: kind as RuntimeImportKind };
  }

  static useOf(target: RuntimeImportTarget, imported: string, typeOnly: boolean): RuntimeImportUse {
    const { kind } = target;
    if (kind.startsWith("framework-")) return typeOnly ? null : RuntimeImports.#frameworkUse(kind, imported);
    const whole = (why: string): RuntimeImportUse => ({ reason: "whole-runtime-import", why });
    if (imported === "RootStore" && (kind === "client" || kind === "st" || kind === "_st"))
      return typeOnly
        ? { binding: { type: "rootStore" } }
        : whole("a value import of RootStore loads the store runtime whole");
    if (typeOnly) return null;
    if (kind === "sig" || kind === "_st" || kind === "_useClient")
      return whole(`the ${kind} file holds the runtime of every module`);
    if (kind === "piece") return whole("a runtime piece imported by hand is not read name by name");
    const handle = (handleKind: RuntimeHandleKind): RuntimeImportUse => ({
      binding: { type: "handle", handle: { kind: handleKind } },
    });
    if ((imported === "fetch" || imported === "sig") && kind !== "st") return handle(imported);
    if (imported === "st" && kind !== "useClient") return handle("st");
    if (kind === "st" || (kind === "client" && imported === "store"))
      return whole(`${imported} holds every module's store`);
    if (kind !== "client" ? quietNames.has(imported) : quietNames.has(imported) || imported === "cnst") return null;
    if (kind === "client" && /^[A-Z]/.test(imported)) return null;
    return { reason: "unknown-name", why: `${imported} reaches past the names a module answers` };
  }

  static #frameworkUse(kind: RuntimeImportKind, imported: string): RuntimeImportUse {
    if (kind === "framework-deep")
      return { reason: "whole-runtime-import", why: "a framework internal may hand out the whole runtime" };
    if (frameworkWholeNames.has(imported)) return { binding: { type: "whole", name: imported } };
    if (kind === "framework-store" && imported === "st") return { binding: { type: "handle", handle: { kind: "st" } } };
    if (kind === "framework-store" && imported === "store") return { binding: { type: "storeFactory" } };
    if (kind === "framework-client" && (imported === "fetch" || imported === "sig"))
      return { binding: { type: "handle", handle: { kind: imported } } };
    return null;
  }

  static namespaceUse(kind: RuntimeImportKind, name: string): RuntimeImportUse {
    if (kind === "framework-store" || kind === "framework-client")
      return {
        binding: { type: "handle", handle: { kind: kind === "framework-store" ? "akanjs/store" : "akanjs/client" } },
      };
    if (kind === "framework-fetch") return { binding: { type: "whole", name } };
    return { reason: "whole-runtime-import", why: "a namespace or default import holds the whole runtime" };
  }

  static #stripped(resolved: string) {
    return resolved.replace(/\.(?:tsx?|jsx?)$/, "").replace(/\/index$/, "");
  }

  static #decode(raw: string) {
    return raw.replace(escapePattern, (_, escape: string) => {
      if (escape.startsWith("u{")) {
        const code = Number.parseInt(escape.slice(2, -1), 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      if (escape.length > 1 && /^[ux]/.test(escape)) return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
      return simpleEscapes[escape] ?? escape;
    });
  }
}
