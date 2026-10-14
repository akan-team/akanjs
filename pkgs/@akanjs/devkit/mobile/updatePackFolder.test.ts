import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText } from "../testHelpers";
import { UpdatePackFolder } from "./updatePackFolder";

const makeTempRoot = tempDirs("akan-update-pack-");

describe("a pack read back from its folder", () => {
  test("takes the folder as the pack's place, and refuses what is not a takeable pack", async () => {
    const root = await makeTempRoot();
    const pack = {
      schema: 1,
      app: "lu",
      target: "default",
      platform: "android",
      env: "main",
      channel: "main",
      appId: "com.lu",
      appVersion: "1.0.0",
      nativeApi: "0123456789abcdef",
      webHash: "f".repeat(64),
      files: 1,
      size: 13,
      out: "/elsewhere/updates/android",
    };
    const moved = path.join(root, "moved");
    await writeText(path.join(moved, "pack.json"), JSON.stringify(pack));
    expect(await UpdatePackFolder.read(moved)).toEqual({ ...pack, out: moved } as never);

    await expect(UpdatePackFolder.read(path.join(root, "empty"))).rejects.toThrow("holds no pack.json");
    const later = path.join(root, "later");
    await writeText(path.join(later, "pack.json"), JSON.stringify({ ...pack, schema: 2 }));
    await expect(UpdatePackFolder.read(later)).rejects.toThrow("schema 2");
    const refused = path.join(root, "refused");
    const compat = { against: "store/bundle.json", compatible: false, problems: ["deepLinks differ"] };
    await writeText(path.join(refused, "pack.json"), JSON.stringify({ ...pack, compat }));
    expect((await UpdatePackFolder.read(refused)).compat).toEqual(compat);
  });

  test("is written without the folder it was packed to, which holds this machine's paths", async () => {
    const out = path.join(await makeTempRoot(), "updates", "android");
    const pack = { schema: 1, app: "lu", target: "default", platform: "android", files: 1, out } as const;

    await UpdatePackFolder.write(pack as never);

    const written = await Bun.file(path.join(out, "pack.json")).text();
    expect(written).not.toContain(out);
    expect(JSON.parse(written)).toEqual({ schema: 1, app: "lu", target: "default", platform: "android", files: 1 });
    expect((await UpdatePackFolder.read(out)).out).toBe(out);
  });
});

describe("a pack's verdict on the store build it was compared with", () => {
  test("is none without a comparison or for one it runs in, and exit 2 with what differs otherwise", () => {
    const out = "/work/updates/android";
    expect(UpdatePackFolder.storeBuildVerdict({ out })).toBeNull();
    const against = "store/bundle.json";
    expect(UpdatePackFolder.storeBuildVerdict({ out, compat: { against, compatible: true, problems: [] } })).toBeNull();

    const verdict = UpdatePackFolder.storeBuildVerdict(
      { out, compat: { against, compatible: false, problems: ["deepLinks differ", "camera added"] } },
      "Run `akan release-android lu`, then register that build.",
    );
    expect(verdict?.exitCode).toBe(2);
    expect(verdict?.message).toBe(
      `The pack in ${out} needs a new store build; it differs from the one ${against} came from:\n- deepLinks differ\n- camera added\nRun \`akan release-android lu\`, then register that build.`,
    );
  });
});

describe("a pack's archive", () => {
  test("holds the files its template lists and the records there, never another pack's files", async () => {
    const out = path.join(await makeTempRoot(), "updates", "android");
    const listed = "a".repeat(64);
    await writeText(path.join(out, "manifest.template.json"), JSON.stringify({ files: [{ sha256: listed }] }));
    await writeText(path.join(out, "bundle.json"), "{}");
    await writeText(path.join(out, "pack.json"), "{}");
    await writeText(path.join(out, "files", listed), "listed");
    await writeText(path.join(out, "files", "b".repeat(64)), "an earlier pack's");

    const entries = await UpdatePackFolder.withArchive({ out } as never, async (archive) =>
      Bun.spawnSync(["tar", "-tzf", archive]).stdout.toString().split(/\r?\n/).filter(Boolean).sort(),
    );

    expect(entries).toEqual(["./bundle.json", `./files/${listed}`, "./manifest.template.json", "./pack.json"]);
  });

  test("refuses a template that names a file by anything but its sha256", async () => {
    const out = path.join(await makeTempRoot(), "pack");
    await writeText(path.join(out, "manifest.template.json"), JSON.stringify({ files: [{ sha256: "../pack.json" }] }));
    await expect(UpdatePackFolder.withArchive({ out } as never, async () => null)).rejects.toThrow(
      "lists a file whose sha256 is not 64 hex digits",
    );
    await expect(
      UpdatePackFolder.withArchive({ out: path.join(out, "none") } as never, async () => null),
    ).rejects.toThrow("holds no manifest.template.json");
  });
});
