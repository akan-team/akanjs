// Pinned Maven libraries for the opt-in Android modules (akanjs readiness O8): Firebase Messaging for
// the push plugin, Play Billing for iap. No Gradle and no resolver at build time: the closures are
// resolved once and written to native/android/maven.lock.json (docs/research/android-aar-closure.md);
// a build downloads what its closure lists, checks every file's SHA-256, and unpacks the AARs into a
// cache the Android builder links from (android.ts).
// A plugin asks for a library with android.maven (root coordinates); the lock holds one closure per
// root set an app can have (FCM, Billing, both), so versions never depend on the order of plugins.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { readZip } from "./apk.ts";
import { CliError, dim, log } from "./log.ts";
import { PACKAGE_ROOT } from "./root.ts";

export const MAVEN_LOCK = join(PACKAGE_ROOT, "native", "android", "maven.lock.json");

export interface License {
  name: string;
  url?: string;
}

export interface MavenArtifact {
  coordinate: string;
  url: string;
  sha256: string;
  size: number;
  packaging: "aar" | "jar";
  /** The artifact's POM, pinned for its licenses (scripts/maven-licenses.ts). */
  pom?: { url: string; sha256: string; size: number };
  /** What the POM (or, see licensesFrom, its parent) declares. */
  licenses?: License[];
  licensesFrom?: string;
}

export interface MavenLock {
  format: string;
  closures: { name: string; roots: string[]; artifacts: string[] }[];
  artifacts: Record<string, Omit<MavenArtifact, "coordinate">>;
}

export function loadMavenLock(path = MAVEN_LOCK): MavenLock {
  const lock = JSON.parse(readFileSync(path, "utf8")) as MavenLock;
  if (lock.format !== "akan-native-maven-lock/1") throw new CliError(`${path}: unknown format ${lock.format}`);
  return lock;
}

/** The locked closure whose roots are exactly `roots` (in any order); null for no roots. */
export function closureFor(lock: MavenLock, roots: string[]): { name: string; artifacts: MavenArtifact[] } | null {
  const wanted = [...new Set(roots)].sort();
  if (!wanted.length) return null;
  const closure = lock.closures.find((c) => [...c.roots].sort().join("\n") === wanted.join("\n"));
  if (!closure) {
    throw new CliError(
      `no locked Maven closure for ${wanted.join(" + ")} (native/android/maven.lock.json has ${lock.closures.map((c) => c.roots.join(" + ")).join("; ")})`,
    );
  }
  return {
    name: closure.name,
    artifacts: closure.artifacts.map((coordinate) => {
      const a = lock.artifacts[coordinate];
      if (!a)
        throw new CliError(`maven.lock.json: closure ${closure.name} lists ${coordinate}, which has no artifact entry`);
      return { coordinate, ...a };
    }),
  };
}

export function mavenCache(env: Record<string, string | undefined> = process.env): string {
  return join(env.AKAN_NATIVE_HOME || join(homedir(), ".akan", "native"), "maven");
}

/** The artifact's file in the cache, downloaded and checked first when needed. */
export async function fetchArtifact(
  a: MavenArtifact,
  cache = mavenCache(),
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const [group, name, version] = a.coordinate.split(":");
  const file = join(cache, "files", ...group!.split("."), name!, version!, `${name}-${version}.${a.packaging}`);
  if (existsSync(file)) return file;
  const res = await fetcher(a.url);
  if (!res.ok) throw new CliError(`download failed: HTTP ${res.status} for ${a.url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== a.sha256)
    throw new CliError(
      `checksum mismatch for ${a.url}\n  expected ${a.sha256}\n  got      ${sha}\nNothing was cached.`,
    );
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, file); // two builds downloading at once both end with one complete file
  return file;
}

export interface Library {
  coordinate: string;
  /** The AAR manifest's package (its R class package); none for plain jars. */
  package?: string;
  /** Compile classpath and dex input. */
  classes: string;
  manifest?: string;
  res?: string;
  /** R.txt with at least one entry: the library reads R fields and needs an R class. */
  hasResources: boolean;
  proguard?: string;
  /** jni/<abi>/<lib>.so */
  nativeLibs: { abi: string; name: string; path: string }[];
  /** META-INF/services/* of the classes jar (ServiceLoader: kotlinx-coroutines' main dispatcher). */
  services: { name: string; path: string }[];
  /** The licenses its POM declares (from the lock). */
  licenses: License[];
  /** Notices of code built into it (an AAR's third_party_licenses.json and .txt: Play services, Billing). */
  notices: { name: string; text: string }[];
}

/** Unpacks an AAR (or indexes a jar) into the cache once; returns where its parts are. */
export function unpackLibrary(a: MavenArtifact, file: string, cache = mavenCache()): Library {
  const dir = join(cache, "unpacked", a.sha256.slice(0, 32));
  const done = join(dir, ".done");
  if (!existsSync(done)) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const write = (name: string, data: Uint8Array) => {
      const path = join(dir, name);
      if (!path.startsWith(`${dir}/`)) throw new CliError(`${a.coordinate}: entry ${name} leaves the folder`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, data);
    };
    const entries = readZip(new Uint8Array(readFileSync(file)));
    const bytes = (e: (typeof entries)[number]) => (e.method === 8 ? new Uint8Array(inflateRawSync(e.data)) : e.data);
    if (a.packaging === "aar") {
      for (const e of entries) {
        if (e.name.endsWith("/")) continue;
        if (
          e.name === "classes.jar" ||
          e.name === "AndroidManifest.xml" ||
          e.name === "R.txt" ||
          e.name === "proguard.txt" ||
          /^(res|jni)\//.test(e.name)
        )
          write(e.name, bytes(e));
      }
    }
    const jar = a.packaging === "aar" ? join(dir, "classes.jar") : file;
    if (existsSync(jar)) {
      for (const e of readZip(new Uint8Array(readFileSync(jar)))) {
        if (/^META-INF\/services\/[^/]+$/.test(e.name))
          write(`services/${e.name.slice("META-INF/services/".length)}`, bytes(e));
      }
    }
    writeFileSync(done, "");
  }
  const at = (name: string) => (existsSync(join(dir, name)) ? join(dir, name) : undefined);
  const manifest = at("AndroidManifest.xml");
  const rTxt = at("R.txt");
  const nativeLibs: Library["nativeLibs"] = [];
  const jniDir = join(dir, "jni");
  if (existsSync(jniDir)) {
    for (const abi of readdirNames(jniDir))
      for (const name of readdirNames(join(jniDir, abi)))
        if (name.endsWith(".so")) nativeLibs.push({ abi, name, path: join(jniDir, abi, name) });
  }
  const servicesDir = join(dir, "services");
  return {
    coordinate: a.coordinate,
    package: manifest ? /\bpackage\s*=\s*"([^"]+)"/.exec(readFileSync(manifest, "utf8"))?.[1] : undefined,
    classes: a.packaging === "aar" ? join(dir, "classes.jar") : file,
    manifest,
    res: at("res"),
    hasResources: !!rTxt && readFileSync(rTxt, "utf8").trim().length > 0,
    proguard: at("proguard.txt"),
    nativeLibs,
    services: existsSync(servicesDir)
      ? readdirNames(servicesDir).map((name) => ({ name, path: join(servicesDir, name) }))
      : [],
    licenses: a.licenses ?? [],
    notices: a.packaging === "aar" ? embeddedNotices(new Uint8Array(readFileSync(file))) : [],
  };
}

/**
 * Google's AARs carry notices for code built into them: third_party_licenses.json maps each name to
 * {start, length}, byte offsets into third_party_licenses.txt (the format the oss-licenses plugin reads).
 */
export function embeddedNotices(aar: Uint8Array): { name: string; text: string }[] {
  const entries = readZip(aar);
  const read = (name: string) => {
    const e = entries.find((x) => x.name === name);
    return e ? (e.method === 8 ? new Uint8Array(inflateRawSync(e.data)) : e.data) : null;
  };
  const index = read("third_party_licenses.json");
  const text = read("third_party_licenses.txt");
  if (!index || !text) return [];
  const map = JSON.parse(new TextDecoder().decode(index)) as Record<string, { start: number; length: number }>;
  const decoder = new TextDecoder();
  return Object.entries(map).map(([name, { start, length }]) => ({
    name,
    text: decoder.decode(text.subarray(start, start + length)).trim(),
  }));
}

/** akan-native-licenses.json: what an Android build with pinned Maven libraries puts into the app (user decision 2026-09-27). */
export interface LicenseNotices {
  about: string;
  /** Every pinned library: its coordinate and the licenses its POM declares. */
  libraries: { name: string; version: string; licenses: License[] }[];
  /** Code built into those libraries, with its notice text; one entry per name. */
  notices: { name: string; text: string }[];
}

export function licenseNotices(libraries: Library[]): LicenseNotices {
  const notices = new Map<string, string>();
  for (const lib of libraries) for (const n of lib.notices) if (!notices.has(n.name)) notices.set(n.name, n.text);
  return {
    about:
      "Third-party software in this app's Android build: the Maven libraries akan-native pins for its plugins (licenses from their POMs) and the code built into them (their own notices). Show it on an open-source licenses screen.",
    libraries: libraries
      .map((lib) => {
        const [group, name, version] = lib.coordinate.split(":");
        return { name: `${group}:${name}`, version: version!, licenses: lib.licenses };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    notices: [...notices].sort(([a], [b]) => a.localeCompare(b)).map(([name, text]) => ({ name, text })),
  };
}

function readdirNames(dir: string): string[] {
  return readdirSync(dir).sort();
}

/** Downloads (once) and unpacks a closure; logs what it fetched. */
export async function prepareLibraries(artifacts: MavenArtifact[], cache = mavenCache()): Promise<Library[]> {
  let fetched = 0;
  const libraries: Library[] = [];
  for (const a of artifacts) {
    const [group, name, version] = a.coordinate.split(":");
    const cached = existsSync(
      join(cache, "files", ...group!.split("."), name!, version!, `${name}-${version}.${a.packaging}`),
    );
    const file = await fetchArtifact(a, cache);
    if (!cached) fetched++;
    libraries.push(unpackLibrary(a, file, cache));
  }
  if (fetched) log.info(dim(`maven: downloaded ${fetched} of ${artifacts.length} pinned libraries (SHA-256 checked)`));
  return libraries;
}
