import path from "node:path";
import { plugin } from "bun";
import { transformUseClient } from "./rscUseClientTransform";

const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
const ui = path.join(workspaceRoot, "pkgs/akanjs/ui");
//? The build narrows these barrel imports to one file; each facet index loads react-dom/client, which react-server refuses.
const narrowed: Record<string, string> = {
  "akanjs/client": path.join(workspaceRoot, "pkgs/akanjs/client/cn.ts"),
  "akanjs/webkit": path.join(workspaceRoot, "pkgs/akanjs/webkit/lazy.tsx"),
};
plugin({
  name: "framework-objects-use-client",
  setup(build) {
    build.onLoad({ filter: /[\\/]pkgs[\\/]akanjs[\\/]ui[\\/].*\.tsx?$/ }, async (args) => {
      let source = await Bun.file(args.path).text();
      for (const [specifier, file] of Object.entries(narrowed))
        source = source.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(file)}`);
      return {
        contents: transformUseClient(source, { path: args.path, workspaceRoot }) ?? source,
        loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
      };
    });
  },
});

const { renderToReadableStream } = await import("react-server-dom-webpack/server.node");
const { Field } = await import(path.join(ui, "Field/index.tsx"));
const { Layout } = await import(path.join(ui, "Layout/index.ts"));
const { Model } = await import(path.join(ui, "Model/index.ts"));

const references = new Set<string>();
const clientManifest = new Proxy(
  {},
  {
    get: (_, key) => {
      const [id = "", name = ""] = String(key).split("#");
      references.add(String(key));
      return { id, chunks: [], name };
    },
  },
);
const errors: string[] = [];
const stream = await renderToReadableStream(
  <main>
    <Field label="Name">
      <Field.Text value="Ada" />
    </Field>
    <Layout.Header>Head</Layout.Header>
    <Model.View>Body</Model.View>
  </main>,
  clientManifest,
  { onError: (error: unknown) => void errors.push(String(error)) },
);
const flight = await new Response(stream).text();
process.stdout.write(
  JSON.stringify({
    references: [...references].sort(),
    serverMarkup: flight.includes("mt-2 flex w-full flex-col gap-4 px-4"),
    errors,
  }),
);
