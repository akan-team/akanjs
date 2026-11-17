import fs from "node:fs";
import path from "node:path";
import type { BunPlugin } from "bun";
import { VENDOR_SPECIFIERS, type VendorSpecifier } from "./vendorSpecifiers";

//? Bun puts a module in the chunk of every entry that reaches it, read or not, so a deprecated re-export would keep
//? its target in a vendor every page loads; a narrowed build blanks it unless a route imports one of its names.
const deprecatedReexports: Partial<Record<VendorSpecifier, string>> = { "akanjs/store": "store/deprecatedAgent.ts" };

export interface VendorEntry {
  specifier: VendorSpecifier;
  absPath: string;
}

export class VendorNarrowing {
  readonly #akanjsRoot: string;
  readonly #vendorExports: Partial<Record<VendorSpecifier, readonly string[]>>;

  static async akanServerPath(workspaceRoot: string): Promise<string> {
    const candidates: string[] = [];
    try {
      candidates.push(path.dirname(Bun.resolveSync("akanjs/server", workspaceRoot)));
    } catch {
      // Source workspaces and bundled CLI execution have different resolution roots; try explicit candidates below.
    }
    candidates.push(
      path.join(workspaceRoot, "pkgs/akanjs/server"),
      path.join(workspaceRoot, "node_modules/akanjs/server"),
    );
    try {
      candidates.push(path.dirname(Bun.resolveSync("akanjs/server", path.dirname(Bun.main))));
    } catch {
      // Published CLI installs may hoist dependencies differently; explicit Bun.main candidates cover that.
    }
    candidates.push(
      path.join(path.dirname(Bun.main), "node_modules/akanjs/server"),
      path.join(path.dirname(Bun.main), "../../akanjs/server"),
      path.resolve(import.meta.dir, "../../server"),
      path.resolve(import.meta.dir, "../server"),
    );
    for (const candidate of candidates) {
      if (await Bun.file(path.join(candidate, "rscClient.tsx")).exists()) return candidate;
    }
    throw new Error(`[base-artifact] failed to locate akanjs/server; looked in: ${candidates.join(", ")}`);
  }

  //? A devkit newer than the installed akanjs finds no agent vendor or deprecated re-export there, and builds that
  //? akanjs's vendors whole, as the devkit it shipped with did.
  static entriesIn(akanServerPath: string): VendorEntry[] {
    return VENDOR_SPECIFIERS.map((specifier) => ({
      specifier,
      absPath: path.resolve(akanServerPath, "vendor", `${specifier.replaceAll("/", "-").replaceAll(".", "-")}.ts`),
    })).filter(({ absPath }) => fs.existsSync(absPath));
  }

  constructor(akanjsRoot: string, vendorExports: Partial<Record<VendorSpecifier, readonly string[]>>) {
    this.#akanjsRoot = akanjsRoot;
    const current = Object.values(deprecatedReexports).every((file) => fs.existsSync(path.join(akanjsRoot, file)));
    this.#vendorExports = current ? vendorExports : {};
  }

  entryExports(vendorEntries: VendorEntry[]): Record<string, readonly string[]> {
    return Object.fromEntries(
      vendorEntries.flatMap(({ specifier, absPath }) => {
        const names = this.#vendorExports[specifier];
        return names ? [[absPath, names]] : [];
      }),
    );
  }

  async plugins(): Promise<BunPlugin[]> {
    const blanked: string[] = [];
    for (const [specifier, file] of Object.entries(deprecatedReexports) as [VendorSpecifier, string][]) {
      const used = this.#vendorExports[specifier];
      if (!used) continue;
      const source = await Bun.file(path.join(this.#akanjsRoot, file)).text();
      const names = new Bun.Transpiler({ loader: "ts" }).scan(source).exports;
      if (!names.some((name) => used.includes(name))) blanked.push(`akanjs/${file}`);
    }
    if (blanked.length === 0) return [];
    const escaped = blanked.map((file) => file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("/", "[\\\\/]"));
    const filter = new RegExp(`[\\\\/](?:${escaped.join("|")})$`);
    return [
      {
        name: "akan-blank-deprecated-reexports",
        setup(build) {
          build.onLoad({ filter }, () => ({ contents: "export {};\n", loader: "ts" }));
        },
      },
    ];
  }
}
