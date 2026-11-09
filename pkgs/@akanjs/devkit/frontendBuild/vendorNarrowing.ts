import path from "node:path";
import type { BunPlugin } from "bun";
import type { VendorSpecifier } from "./vendorSpecifiers";

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

  constructor(akanjsRoot: string, vendorExports: Partial<Record<VendorSpecifier, readonly string[]>>) {
    this.#akanjsRoot = akanjsRoot;
    this.#vendorExports = vendorExports;
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
