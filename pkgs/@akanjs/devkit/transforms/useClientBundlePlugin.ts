import type { BunPlugin } from "bun";
import { loaderFor } from "./moduleSyntax";
import { transformUseClient } from "./rscUseClientTransform";

/** `workspaceRoot` makes reference keys workspace-relative; they must match the client manifest's keys. */
export function createUseClientBundlePlugin(
  options: { workspaceRoot?: string; onClientModule?: (path: string, exports: string[]) => void } = {},
): BunPlugin {
  return {
    name: "akan-use-client-bundle",
    setup(build) {
      build.onLoad({ filter: /\.(tsx|ts|jsx|js)$/ }, async (args) => {
        if (args.path.includes("/node_modules/")) return undefined;
        let source: string;
        try {
          source = await Bun.file(args.path).text();
        } catch {
          return undefined;
        }
        const stubbed = transformUseClient(source, {
          path: args.path,
          workspaceRoot: options.workspaceRoot,
          onClientModule: options.onClientModule,
        });
        if (stubbed === null) return undefined;
        return { contents: stubbed, loader: loaderFor(args.path) };
      });
    },
  };
}
