import path from "node:path";

const built = await Bun.build({
  entrypoints: [path.join(import.meta.dir, "useDismissDrag.page.fixture.tsx")],
  target: "browser",
  format: "esm",
  splitting: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
const files = new Map<string, string>();
for (const artifact of built.outputs) files.set(`/${path.basename(artifact.path)}`, await artifact.text());
const entry = `/${path.basename(built.outputs.find((artifact) => artifact.kind === "entry-point")?.path ?? "")}`;
const gestureChunks = [...files].filter(([, text]) => text.includes("keyboardDisplacement")).map(([name]) => name);
const gated = gestureChunks.find((name) => name !== entry);

let openGate: () => void = () => undefined;
let gate = Promise.resolve();
const closeGate = () => {
  gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
};
const requests: string[] = [];
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    requests.push(pathname);
    if (pathname === "/")
      return new Response(`<!doctype html><html><body><script type="module" src="${entry}"></script></body></html>`, {
        headers: { "content-type": "text/html" },
      });
    const text = files.get(pathname);
    if (text === undefined) return new Response("", { status: 404 });
    if (pathname === gated) await gate;
    return new Response(text, { headers: { "content-type": "text/javascript" } });
  },
});

const errors: string[] = [];
const view = new Bun.WebView({
  backend: "chrome",
  width: 400,
  height: 600,
  console: (type: string, ...args: unknown[]) => {
    if (type === "error") errors.push(args.map(String).join(" "));
  },
});
const mouse = (type: "mousePressed" | "mouseMoved" | "mouseReleased", y: number) =>
  view.cdp("Input.dispatchMouseEvent", {
    type,
    x: 100,
    y,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: type === "mouseMoved" ? 0 : 1,
  });
const drag = async (path: number[], pauseBeforeRelease = 0) => {
  await mouse("mousePressed", path[0] ?? 0);
  for (const y of path.slice(1)) await mouse("mouseMoved", y);
  await Bun.sleep(pauseBeforeRelease);
  await mouse("mouseReleased", path.at(-1) ?? 0);
};
const until = async (expression: string) => {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (await view.evaluate(expression)) return;
    await Bun.sleep(25);
  }
  errors.push(`timed out waiting for ${expression}`);
};
const released = "window.dragLog.some((entry) => 'release' in entry)";
const takeLog = () => view.evaluate("window.dragLog.splice(0)");
const openPage = async () => {
  closeGate();
  requests.length = 0;
  await view.navigate(`http://127.0.0.1:${server.port}/`);
  await until("!!window.dragLog && !!document.getElementById('handle')");
};

try {
  await openPage();
  const beforePress = requests.filter((name) => gestureChunks.includes(name));
  await drag([50, 60, 90, 130, 170, 210]);
  const whileLoading = await takeLog();
  const requestedOnPress = gated !== undefined && requests.includes(gated);
  openGate();
  await until(released);
  const heldWhole = await takeLog();
  await drag([50, 65, 80], 100);
  await until(released);
  const live = await takeLog();

  await openPage();
  await drag([50, 50]);
  await drag([50, 65, 80], 100);
  openGate();
  await until(released);
  const heldSlow = await takeLog();

  await openPage();
  await mouse("mousePressed", 50);
  openGate();
  await until(
    `performance.getEntriesByType("resource").some((entry) => entry.name.endsWith(${JSON.stringify(gated)}) && entry.responseEnd > 0)`,
  );
  await view.evaluate("new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50)))");
  for (const y of [70, 110, 150, 190]) await mouse("mouseMoved", y);
  await mouse("mouseReleased", 190);
  await until(released);
  const pressHeld = await takeLog();
  await drag([50, 50]);
  await until("window.dragLog.length > 0");
  const tap = await takeLog();

  process.stdout.write(
    JSON.stringify({
      gestureChunks,
      beforePress,
      whileLoading,
      requestedOnPress,
      heldWhole,
      live,
      heldSlow,
      pressHeld,
      tap,
      errors,
    }),
  );
} finally {
  view.close();
  server.stop(true);
}
