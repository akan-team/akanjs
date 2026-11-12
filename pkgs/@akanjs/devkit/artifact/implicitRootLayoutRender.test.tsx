import { describe, expect, spyOn, test } from "bun:test";
import { mkdir, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { act, Children, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import { createFromNodeStream } from "react-server-dom-webpack/client.node";
import { PagesBundleBuilder } from "../frontendBuild/pagesBundleBuilder";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { resolveSsrPageEntries } from "./implicitRootLayout";

Object.assign(process.env, {
  AKAN_PUBLIC_APP_NAME: "demo",
  AKAN_PUBLIC_REPO_NAME: "demo",
  AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
  AKAN_PUBLIC_ENV: "testing",
  AKAN_PUBLIC_OPERATION_MODE: "cloud",
});
const akanjsRoot = path.resolve(import.meta.dir, "../../../akanjs");
process.env.AKAN_RSC_WORKER_PATH = path.join(akanjsRoot, "server/rscWorker.tsx");
const { RscWorker } = await import("akanjs/server/rscWorkerHost.ts");
const { SsrFromRscRenderer } = await import("akanjs/server/ssrFromRscRenderer.tsx");
const { resetEnvCache } = await import("akanjs/base");
const { Logger } = await import("akanjs/common");
const { makePageProto, registerClientRuntime, router } = await import("akanjs/client");
//? What the app's client bundle registers in a browser; the hydrated System.Provider reads it.
const socket = { connect: () => undefined, connectOnUse: () => undefined };
registerClientRuntime({ ...makePageProto({ en: {} }), fetch: { instance: socket } } as never);

const makeTempRoot = tempDirs("akan-root-level-render-");
const boundedLayout = "<RouteLevelBoundary>{layout}</RouteLevelBoundary>";
const pageSource = 'import { page } from "akanjs/client";\nexport default page().render(() => <p>page</p>);\n';
const idsLayoutSource = `import { rootLayout } from "akanjs/client";
import { UsesId } from "../usesId";
export default rootLayout().render(({ children }) => <section id="user"><UsesId />{children}</section>);
`;
//? Throws only once the test has read the shell's body, so the boundary streams pending whatever the payload's size.
const lateLayoutSource = `import { rootLayout } from "akanjs/client";
export default rootLayout()
  .loading(() => <i>root loading</i>)
  .render(async () => {
    while (!(await Bun.file(process.env.AKAN_TEST_SHELL_READ ?? "").exists())) await Bun.sleep(5);
    throw new Error("root layout broke");
  });
`;

const linkPackage = async (root: string, name: string, dir: string) => {
  await mkdir(path.dirname(path.join(root, "node_modules", name)), { recursive: true });
  await symlink(dir, path.join(root, "node_modules", name));
};

const writeApp = async (routes: Record<string, string>) => {
  const root = await makeTempRoot();
  const appDir = path.join(root, "apps/demo");
  await linkPackage(root, "akanjs", akanjsRoot);
  for (const name of ["react", "react-dom", "react-server-dom-webpack"])
    await linkPackage(root, name, path.dirname(Bun.resolveSync(`${name}/package.json`, akanjsRoot)));
  await write(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@apps/*": ["./apps/*"] } } }),
  );
  await write(path.join(appDir, "env/env.client.ts"), "export const env = {};\n");
  await write(path.join(appDir, "lib/dict.ts"), "export const getAllDictionary = () => ({});\n");
  //? With lib/st.ts present the generated layout imports both, and the worker's System.Provider reads this runtime.
  await write(
    path.join(appDir, "lib/useClient.ts"),
    'import { makePageProto, registerClientRuntime } from "akanjs/client";\nregisterClientRuntime(makePageProto({}) as never);\n',
  );
  await write(path.join(appDir, "lib/st.ts"), "export {};\n");
  await write(
    path.join(appDir, "page/usesId.tsx"),
    '"use client";\nimport { useId } from "react";\nexport const UsesId = () => <b id={useId()}>uses id</b>;\n',
  );
  for (const [file, source] of Object.entries(routes)) await write(path.join(appDir, "page", file), source);
  return { root, appDir, pageKeys: Object.keys(routes).map((file) => `./${file}`) };
};

//? Each client reference's stub names its workspace-relative path in the error it throws when called on the server.
const clientReferenceIds = async (serverDir: string) => {
  const ids = new Set<string>();
  for (const file of await readdir(serverDir, { recursive: true })) {
    if (!file.endsWith(".js")) continue;
    const source = await Bun.file(path.join(serverDir, file)).text();
    for (const [, id] of source.matchAll(/Attempted to call '[^']+' from '([^']+)' on the server/g))
      if (id) ids.add(id);
  }
  return [...ids];
};

const ssrManifest: { moduleLoading: null; moduleMap: Record<string, unknown> } = { moduleLoading: null, moduleMap: {} };

const readHtml = async (stream: ReadableStream<Uint8Array>, onBody: () => Promise<unknown>) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let bodyRead = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return html + decoder.decode();
    html += decoder.decode(value, { stream: true });
    if (bodyRead || !html.includes("<body")) continue;
    bodyRead = true;
    await onBody();
  }
};

interface Rendered {
  html: string;
  status: number;
  payload: Uint8Array;
}

const withBuiltPages = async (
  { routes, unbounded }: { routes: Record<string, string>; unbounded?: string },
  run: (render: (route: string) => Promise<Rendered>) => Promise<void>,
) => {
  const { root, appDir, pageKeys } = await writeApp(routes);
  const app = {
    name: "demo",
    cwdPath: appDir,
    dist: { cwdPath: path.join(root, "dist/apps/demo") },
    workspace: { workspaceRoot: root },
    getConfig: async () => ({ basePaths: [], barrelImports: [], externalLibs: [] }),
    getTsConfig: async () => ({ compilerOptions: { paths: { "@apps/*": ["./apps/*"] } } }),
    getPublicEnv: () => ({}),
    verbose: () => undefined,
  };
  const entries = await resolveSsrPageEntries({ appCwdPath: appDir, appName: "demo", pageKeys });
  if (unbounded) {
    const generated = entries.find((entry) => entry.key === `./${unbounded}/__root_layout.tsx`);
    if (!generated) throw new Error(`no generated root layout for ${unbounded}`);
    const source = await Bun.file(generated.moduleAbsPath).text();
    expect(source).toContain(boundedLayout);
    await Bun.write(generated.moduleAbsPath, source.replace(boundedLayout, "layout"));
  }
  const { bundlePath } = await new PagesBundleBuilder(app as never, "build", entries).build();
  const ids = await clientReferenceIds(path.dirname(bundlePath));
  ssrManifest.moduleMap = Object.fromEntries(
    ids.map((id) => {
      const file = path.resolve(root, id);
      return [id, { "*": { id: file, chunks: [file, file], name: "*" } }];
    }),
  );
  const shellRead = path.join(root, "shell-read");
  process.env.AKAN_TEST_SHELL_READ = shellRead;
  const rsc = new RscWorker({
    pagesBundlePath: bundlePath,
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: Object.fromEntries(ids.map((id) => [id, { id, chunks: [], name: "" }])),
  } as never);
  try {
    await rsc.ready;
    await run(async (route) => {
      const request = new Request(`http://localhost/en/${route}`);
      const result = await rsc.renderWithMeta(request);
      if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
      const [rscStream, payloadStream] = result.stream.tee();
      const payload = new Response(payloadStream).arrayBuffer();
      payload.catch(() => undefined);
      const stream = await new SsrFromRscRenderer().render({
        request,
        rscStream,
        ssrManifest,
        lateControl: result.lateControl,
      } as never);
      const html = await readHtml(stream, () => Bun.write(shellRead, ""));
      await rm(shellRead, { force: true });
      return { html, status: result.status ?? 200, payload: new Uint8Array(await payload) };
    });
  } finally {
    rsc.kill();
    delete process.env.AKAN_TEST_SHELL_READ;
  }
};

const bodyOf = async (payload: Uint8Array): Promise<ReactNode> => {
  const html = await createFromNodeStream<ReactElement<{ children: ReactNode }>>(
    Readable.from([payload]),
    ssrManifest as never,
  );
  const body = Children.toArray(html.props.children).find(
    (child): child is ReactElement<{ children: ReactNode }> => isValidElement(child) && child.type === "body",
  );
  return createElement(Fragment, null, body?.props.children);
};

const markupOf = async (node: ReactNode) => {
  const stream = await renderToReadableStream(node, { onError: () => undefined });
  await stream.allReady;
  return await new Response(stream).text();
};

const hydrated = async (
  payload: Uint8Array,
  keptSelectors: string[],
  run: (container: HTMLElement, uncaught: unknown[], recoverable: unknown[]) => void | Promise<void>,
) => {
  const markup = await markupOf(await bodyOf(payload));
  const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
  GlobalRegistrator.register({ url: "http://localhost/en/" });
  //? getEnv() caches its side, and the SSR render above ran with no window.
  resetEnvCache();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { hydrateRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  container.innerHTML = markup;
  document.body.appendChild(container);
  const uncaught: unknown[] = [];
  const recoverable: unknown[] = [];
  const kept = keptSelectors.map((selector) => [selector, container.querySelector(selector)] as const);
  //? React's dev check tags a context with the last renderer to provide it, and Fizz rendered these in this process.
  const logged = console.error;
  const quiet = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (!String(args[0]).startsWith("Detected multiple renderers concurrently")) logged(...args);
  });
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    const tree = await bodyOf(payload);
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onUncaughtError: (error) => void uncaught.push(error),
        onCaughtError: () => undefined,
        onRecoverableError: (error) => void recoverable.push(error),
      });
    });
    await act(async () => {});
    for (const [selector, node] of kept) expect(container.querySelector(selector)).toBe(node);
    await run(container, uncaught, recoverable);
  } finally {
    await act(async () => {
      root?.unmount();
    });
    quiet.mockRestore();
    await GlobalRegistrator.unregister();
    resetEnvCache();
  }
};

const withLoggedErrors = async (run: () => Promise<void>) => {
  const logged = spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  try {
    await run();
  } finally {
    logged.mockRestore();
  }
};

describe("The generated System root layout, built and rendered", () => {
  test("draws a late root failure's notice inside System.Provider, whose bridge started the router its retry calls", async () => {
    const refreshes: string[] = [];
    globalThis.__AKAN_RSC_REFRESH__ = async () => void refreshes.push("refresh");
    try {
      await withLoggedErrors(async () => {
        const routes = { "(late)/_layout.tsx": lateLayoutSource, "(late)/late.tsx": pageSource };
        await withBuiltPages({ routes }, async (render) => {
          const late = await render("late");
          expect(late.status).toBe(200);
          expect(late.html).toContain('<body><!--$?--><template id="B:0"></template><i>root loading</i><!--/$-->');
          expect(late.html).toContain('$RX("B:0"');

          //? Only the hydrated ClientSsrBridge can start it: the server's own init ran in the worker.
          expect(router.isInitialized).toBe(false);
          await hydrated(late.payload, [], async (container, uncaught) => {
            expect(uncaught).toEqual([]);
            const notice = container.querySelector("#pageContent > [role='alert']");
            expect(notice).not.toBeNull();
            await act(async () => notice?.querySelector("button")?.click());
            expect(refreshes).toEqual(["refresh"]);
          });
        });
      });
    } finally {
      globalThis.__AKAN_RSC_REFRESH__ = undefined;
    }
  }, 30_000);

  test("keeps the markup and useId values the template had without the boundary, and hydrates them in place", async () => {
    const routes = {
      "(ids)/_layout.tsx": idsLayoutSource,
      "(ids)/ids.tsx": pageSource,
      "(bare)/_layout.tsx": idsLayoutSource,
      "(bare)/bar.tsx": pageSource,
    };
    await withBuiltPages({ routes, unbounded: "(bare)" }, async (render) => {
      const beforeScripts = (html: string) => html.slice(html.indexOf("<body>"), html.indexOf("<script"));
      const bounded = await render("ids");
      const bare = beforeScripts((await render("bar")).html);
      expect(beforeScripts(bounded.html)).toContain('<section id="user"><b id="_R_');
      expect(beforeScripts(bounded.html).replace('data-firstpath="ids"', 'data-firstpath="bar"')).toBe(bare);

      await hydrated(bounded.payload, ["#pageContent", "#user", "#user b"], (container, uncaught, recoverable) => {
        expect(container.querySelector("#user b")?.id).toStartWith("_R_");
        expect({ uncaught, recoverable }).toEqual({ uncaught: [], recoverable: [] });
      });
    });
  }, 30_000);
});
