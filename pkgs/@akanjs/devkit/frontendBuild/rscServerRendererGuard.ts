import { realpathSync } from "node:fs";
import path from "node:path";

interface ImportEdge {
  from: string;
  dynamic: boolean;
}

//? Every `react-dom/server` entry resolves to `server.react-server.js` under the react-server condition, which throws.
const SERVER_RENDERER_RE = /^react-dom\/server(?:\.\w+)?$/;

export class RscServerRendererGuard {
  //? Bun keeps an external `import` after tree-shaking drops its bindings, and hoists one out of a lazily wrapped module.
  static offenders(metafile: Bun.BuildMetafile): { input: string; specifier: string }[] {
    const offenders: { input: string; specifier: string }[] = [];
    const included = new Set(
      Object.values(metafile.outputs).flatMap((output) =>
        Object.entries(output.inputs)
          .filter(([, { bytesInOutput }]) => bytesInOutput > 0)
          .map(([input]) => input),
      ),
    );
    for (const input of included)
      for (const edge of metafile.inputs[input]?.imports ?? [])
        if (edge.external && edge.kind === "import-statement" && SERVER_RENDERER_RE.test(edge.path))
          offenders.push({ input, specifier: edge.path });
    return offenders;
  }

  static chain(metafile: Bun.BuildMetafile, target: string): { input: string; dynamic: boolean }[] {
    const entries = Object.values(metafile.outputs).flatMap((output) => (output.entryPoint ? [output.entryPoint] : []));
    const reached = new Map<string, ImportEdge | null>(entries.map((entry) => [entry, null]));
    const queue = [...entries];
    for (let input = queue.shift(); input !== undefined && !reached.has(target); input = queue.shift())
      for (const edge of metafile.inputs[input]?.imports ?? []) {
        if (edge.external || reached.has(edge.path)) continue;
        reached.set(edge.path, {
          from: input,
          dynamic: edge.kind === "dynamic-import" || edge.kind === "require-call",
        });
        queue.push(edge.path);
      }
    const chain: { input: string; dynamic: boolean }[] = [];
    for (let input: string | undefined = target; input !== undefined; ) {
      const edge: ImportEdge | null | undefined = reached.get(input);
      chain.unshift({ input, dynamic: edge?.dynamic ?? false });
      input = edge?.from;
    }
    return chain;
  }

  static assert(metafile: Bun.BuildMetafile | undefined, workspaceRoot: string) {
    const [offender] = metafile ? RscServerRendererGuard.offenders(metafile) : [];
    if (!metafile || !offender) return;
    const root = realpathSync(workspaceRoot);
    const shown = (input: string) => path.relative(root, path.resolve(input)) || input;
    const lines = RscServerRendererGuard.chain(metafile, offender.input).map(
      ({ input, dynamic }, idx) => `  ${idx === 0 ? "" : dynamic ? "→ import() " : "→ "}${shown(input)}`,
    );
    throw new Error(
      [
        `[PagesBundleBuilder] The server pages bundle imports ${offender.specifier} as it loads, and the RSC worker runs under the react-server condition, where that import throws. It is reached through:`,
        ...lines,
        "A module in the page graph that imports the app's server entry, or anything that starts the server, brings the SSR renderer with it: import only what that module uses, or hand it in from the code that boots the server.",
      ].join("\n"),
    );
  }
}
