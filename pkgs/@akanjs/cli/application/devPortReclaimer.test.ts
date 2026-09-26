import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DevPortReclaimer } from "./devPortReclaimer";

const roots: string[] = [];
const spawned: Bun.Subprocess[] = [];
//? Ports above 55535 put `port + 10_000` out of range, so a reclaim here can never reach a real dev server.
const listenerSource = `
for (;;) {
  const port = 55_536 + Math.floor(Math.random() * 9_999);
  try {
    Bun.serve({ port, fetch: () => new Response("") });
    console.log(\`port=\${port}\`);
    break;
  } catch {}
}
`;

const startListener = async (relativePath: string) => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-port-reclaim-"));
  roots.push(root);
  const entry = path.join(root, relativePath);
  await mkdir(path.dirname(entry), { recursive: true });
  await writeFile(entry, listenerSource);
  const proc = Bun.spawn(["bun", entry], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
  spawned.push(proc);
  const reader = proc.stdout.getReader();
  let output = "";
  while (!/port=\d+/.test(output)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`listener exited before binding: ${output}`);
    output += new TextDecoder().decode(value);
  }
  reader.releaseLock();
  return { proc, port: Number(/port=(\d+)/.exec(output)?.[1]) };
};

afterAll(async () => {
  for (const proc of spawned) proc.kill("SIGKILL");
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("DevPortReclaimer on this machine", () => {
  test("names the process on a port and leaves one that is not akan's alone", async () => {
    const { proc, port } = await startListener("listener.ts");

    const holders = await new DevPortReclaimer().holdersOf(port);

    expect(holders).toEqual([
      { pid: proc.pid, listenerPid: proc.pid, port, akan: false, command: expect.stringContaining("listener.ts") },
    ]);
    expect((await new DevPortReclaimer().reclaim([port])).killed).toEqual([]);
    expect(proc.exitCode).toBeNull();
  }, 60_000);

  test("reclaims a port held by an akan app entry", async () => {
    const { proc, port } = await startListener(path.join("apps", "demo", "main.ts"));

    const { killed, foreign } = await new DevPortReclaimer().reclaim([port]);

    expect(foreign).toEqual([]);
    expect(killed.map((holder) => [holder.pid, holder.port])).toEqual([[proc.pid, port]]);
    await proc.exited;
  }, 60_000);
});
