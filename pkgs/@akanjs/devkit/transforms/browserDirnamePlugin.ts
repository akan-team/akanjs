import path from "node:path";
import type { BunPlugin } from "bun";

const vendorScript = /[\\/]node_modules[\\/].+\.[cm]?js$/;

//* Bun's browser build declares `__dirname` / `__filename` in each module naming them as the absolute path it read the
//* module from, so a CSR bundle carried the checkout location and its hash moved with it. A vendor module gets its path
//* from `node_modules` on instead. Not `define`: Bun applies that to the modules a macro imports and runs, where a
//* server module reading files beside itself would read `/`, while a plugin never sees the macro graph.
export const createBrowserDirnamePlugin = (): BunPlugin => ({
  name: "akan-browser-dirname",
  setup(build) {
    build.onLoad({ filter: vendorScript }, async (args) => {
      const source = await Bun.file(args.path).text();
      if (!source.includes("__dirname") && !source.includes("__filename")) return undefined;
      const posixPath = args.path.replaceAll("\\", "/");
      const filename = posixPath.slice(posixPath.indexOf("/node_modules/"));
      const define = { __dirname: JSON.stringify(path.posix.dirname(filename)), __filename: JSON.stringify(filename) };
      return {
        loader: "js",
        contents: new Bun.Transpiler({ loader: "js", target: "browser", define }).transformSync(source),
      };
    });
  },
});
