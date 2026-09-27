// Serves scripts/vm/windows-setup.ps1 to a new Windows VM and records what it reports back
// (docs/testing-windows-linux.md). Run on the Mac:
//
//   bun scripts/vm/serve-setup.ts
//
// and in the VM (administrator PowerShell) the printed `irm … | iex` line. The script is filled in
// with ~/.akan/native/vm/id_ed25519.pub (created here if missing) and the report goes to
// ~/.akan/native/vm/windows.json, from which scripts/vm/windows.ts takes the address and user name.
// The random path keeps other machines on the network from fetching it by accident; the file
// holds only a public key.

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const VM_DIR = join(homedir(), ".akan", "native", "vm");
const KEY = join(VM_DIR, "id_ed25519");
const PORT = Number(process.env.PORT ?? 8799);

mkdirSync(VM_DIR, { recursive: true });
if (!existsSync(KEY)) {
  const keygen = Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", "akan-native-vm", "-f", KEY]);
  if (keygen.exitCode !== 0) throw new Error(`ssh-keygen failed: ${keygen.stderr}`);
}
const publicKey = readFileSync(`${KEY}.pub`, "utf8").trim();
// The same address across restarts of this server, so a line already typed into the VM still works.
const TOKEN_FILE = join(VM_DIR, "setup-token");
const token = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, "utf8").trim() : randomBytes(4).toString("hex");
writeFileSync(TOKEN_FILE, `${token}\n`);
const template = readFileSync(join(import.meta.dir, "windows-setup.ps1"), "utf8");

/** Host addresses a VM reaches the Mac at: UTM's shared network, Parallels' shared network. */
const HOSTS = ["192.168.64.1", "10.211.55.2"];

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req, server) {
    const url = new URL(req.url);
    const from = server.requestIP(req)?.address ?? "?";
    if (req.method === "GET" && url.pathname === `/${token}`) {
      // What `irm … | iex` runs: download the real script and run it as a file (see its header).
      console.info(`${new Date().toLocaleTimeString()} bootstrap sent to ${from}`);
      const bootstrap = [
        `$f = Join-Path $env:TEMP 'akan-native-windows-setup.ps1'`,
        `Invoke-WebRequest -UseBasicParsing -Uri 'http://${url.host}/${token}/setup.ps1' -OutFile $f`,
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f`,
        "",
      ].join("\r\n");
      return new Response(bootstrap, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (req.method === "GET" && url.pathname === `/${token}/setup.ps1`) {
      // The address the VM used to reach us is the one it can report back to.
      const script = template
        .replace("__AKAN_NATIVE_PUBLIC_KEY__", publicKey)
        .replace("__AKAN_NATIVE_REPORT_URL__", `http://${url.host}/${token}/report`)
        .replace("__AKAN_NATIVE_BUN_VERSION__", Bun.version);
      console.info(`${new Date().toLocaleTimeString()} script sent to ${from}`);
      return new Response(script, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (req.method === "POST" && url.pathname === `/${token}/report`) {
      const report = (await req.json()) as { status: string; detail?: string; ips?: string[] };
      writeFileSync(
        join(VM_DIR, "windows.json"),
        `${JSON.stringify({ ...report, from, at: new Date().toISOString() }, null, 2)}\n`,
      );
      console.info(`${new Date().toLocaleTimeString()} report from ${from}: ${JSON.stringify(report)}`);
      return new Response("ok\n");
    }
    return new Response("not found\n", { status: 404 });
  },
});

console.info(`In the VM, in an administrator PowerShell, run one of (UTM / Parallels):`);
for (const host of HOSTS) console.info(`  irm http://${host}:${PORT}/${token} | iex`);
