import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConfigLock } from "./cloud/configLock";
import { FileSys } from "./fileSys";

type KnownHosts = Record<string, string>;

export interface HostKeyVerdict {
  trusted: boolean;
  firstUse: boolean;
  fingerprint: string;
}

export class SshHostKeys {
  static defaultPath() {
    return path.join(Bun.env.HOME ?? Bun.env.USERPROFILE ?? "", ".akan", "ssh_known_hosts.json");
  }
  static fingerprintOf(key: Buffer) {
    return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
  }
  static parsePinned(value: string | undefined) {
    return (value ?? "")
      .split(",")
      .map((fingerprint) => fingerprint.trim())
      .filter(Boolean)
      .map((fingerprint) => (fingerprint.startsWith("SHA256:") ? fingerprint : `SHA256:${fingerprint}`));
  }
  readonly filePath: string;
  constructor(filePath: string = SshHostKeys.defaultPath()) {
    this.filePath = filePath;
  }
  //? Pinned fingerprints decide alone; without them the first key a host shows is kept and any other is refused.
  async verify(hostId: string, key: Buffer, pinned: string[] = []): Promise<HostKeyVerdict> {
    const fingerprint = SshHostKeys.fingerprintOf(key);
    if (pinned.length) return { trusted: pinned.includes(fingerprint), firstUse: false, fingerprint };
    return await ConfigLock.run(`${this.filePath}.lock`, async () => {
      const known = await this.#read();
      const stored = known[hostId];
      if (stored) return { trusted: stored === fingerprint, firstUse: false, fingerprint };
      await this.#write({ ...known, [hostId]: fingerprint });
      return { trusted: true, firstUse: true, fingerprint };
    });
  }
  async #read(): Promise<KnownHosts> {
    return (await FileSys.fileExists(this.filePath)) ? await FileSys.readJson<KnownHosts>(this.filePath) : {};
  }
  async #write(known: KnownHosts) {
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(known, null, 2), { mode: 0o600 });
      await FileSys.replace(temp, this.filePath);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }
}
