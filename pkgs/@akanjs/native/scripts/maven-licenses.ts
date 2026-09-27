// Pins each locked Maven artifact's POM (URL, SHA-256, size) in native/android/maven.lock.json and
// records the licenses it declares, so builds can write the app's license notices without the
// network and without anyone guessing a license (user decision 2026-09-27). A POM without licenses
// takes them from its parent POM, which is pinned in `parents`.
//
//   bun scripts/maven-licenses.ts           fill in the lock
//   bun scripts/maven-licenses.ts --check   download again and compare (exit 1 on a difference)

import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

const LOCK = join(resolve(import.meta.dir, ".."), "native/android/maven.lock.json");
const check = process.argv.includes("--check");

interface License {
  name: string;
  url?: string;
}
interface Pom {
  url: string;
  sha256: string;
  size: number;
}

async function fetchPom(url: string): Promise<{ pom: Pom; text: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    pom: { url, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length },
    text: new TextDecoder().decode(bytes),
  };
}

const tag = (xml: string, name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1]?.trim();

function licensesOf(text: string): License[] {
  return [...text.matchAll(/<license>([\s\S]*?)<\/license>/g)].map((m) => {
    const url = tag(m[1]!, "url");
    return url ? { name: tag(m[1]!, "name") ?? url, url } : { name: tag(m[1]!, "name") ?? "unnamed" };
  });
}

const lock = await Bun.file(LOCK).json();
const parents: Record<string, Pom & { licenses: License[] }> = {};
const problems: string[] = [];
for (const [coord, artifact] of Object.entries(lock.artifacts as Record<string, Record<string, unknown>>).sort()) {
  const url = String(artifact.url).replace(/\.(aar|jar)$/, ".pom");
  const { pom, text } = await fetchPom(url);
  let licenses = licensesOf(text);
  let licensesFrom: string | undefined;
  const parent = tag(text, "parent");
  if (!licenses.length && parent) {
    const [group = "", name = "", version = ""] = ["groupId", "artifactId", "version"].map((t) => tag(parent, t) ?? "");
    licensesFrom = `${group}:${name}:${version}`;
    const base = url.slice(0, url.indexOf(coord.split(":")[0]!.replaceAll(".", "/")));
    const parentUrl = `${base}${group.replaceAll(".", "/")}/${name}/${version}/${name}-${version}.pom`;
    const fetched = await fetchPom(parentUrl);
    const inherited = licensesOf(fetched.text);
    parents[licensesFrom] = { ...fetched.pom, licenses: inherited };
    licenses = inherited;
  }
  if (!licenses.length) problems.push(`${coord}: its POM declares no license`);
  const entry = { pom, licenses, ...(licensesFrom ? { licensesFrom } : {}) };
  if (check) {
    const had = JSON.stringify({
      pom: artifact.pom,
      licenses: artifact.licenses,
      ...(artifact.licensesFrom ? { licensesFrom: artifact.licensesFrom } : {}),
    });
    if (had !== JSON.stringify(entry)) problems.push(`${coord}: the lock differs from the POM`);
  } else Object.assign(artifact, entry);
}
if (check && JSON.stringify(lock.parents ?? {}) !== JSON.stringify(parents)) problems.push("parents differ");
if (!check) {
  lock.parents = parents;
  await Bun.write(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
}
for (const p of problems) console.error(p);
console.info(
  `${Object.keys(lock.artifacts).length} POMs, ${Object.keys(parents).length} parent POMs${check ? ", checked" : ", written"}`,
);
process.exit(problems.length ? 1 : 0);
