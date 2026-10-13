import { describe, expect, test } from "bun:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../testHelpers";
import { NativeApi } from "./nativeApi";

const makeTempRoot = tempDirs("akan-native-api-");
const repoApp = path.resolve(import.meta.dir, "../../../../apps/minimal");

const installVendoredApi = async (version: string) => {
  const root = await realpath(await makeTempRoot());
  await mkdir(path.join(root, "node_modules/akanjs"), { recursive: true });
  await writeFile(
    path.join(root, "node_modules/akanjs/package.json"),
    JSON.stringify({ name: "akanjs", exports: { "./package.json": "./package.json" } }),
  );
  const entry = NativeApi.entryOf(root);
  await mkdir(path.dirname(entry), { recursive: true });
  await writeFile(entry, `export const API_VERSION = ${JSON.stringify(version)};\n`);
  return root;
};

describe("NativeApi", () => {
  test("inside this repo, loads the workspace package and checks its major", async () => {
    expect(NativeApi.entryOf(repoApp)).toBe(path.resolve(import.meta.dir, "../../native/packages/cli/src/api.ts"));
    const api = await NativeApi.load(repoApp);
    expect(api.API_VERSION.split(".")[0]).toBe(String(NativeApi.supportedMajor));
  });

  test("elsewhere, looks for the copy akanjs vendors, and says so when it is missing", async () => {
    const root = await realpath(await makeTempRoot());
    await mkdir(path.join(root, "node_modules/akanjs"), { recursive: true });
    await writeFile(
      path.join(root, "node_modules/akanjs/package.json"),
      JSON.stringify({ name: "akanjs", exports: { "./package.json": "./package.json" } }),
    );

    expect(NativeApi.entryOf(root)).toBe(
      path.join(root, "node_modules/akanjs/vendor/@akanjs/native/packages/cli/src/api.ts"),
    );
    await expect(NativeApi.load(root)).rejects.toThrow("The installed akanjs has no native build");
  });

  test("refuses an API older than the one the build calls into, and another major, before anything builds", async () => {
    await expect(NativeApi.load(await installVendoredApi("0.10.0"))).rejects.toThrow(
      "install matching versions of akanjs and @akanjs/cli",
    );
    await expect(NativeApi.load(await installVendoredApi("1.0.0"))).rejects.toThrow(
      "install matching versions of akanjs and @akanjs/cli",
    );
    expect((await NativeApi.load(await installVendoredApi(NativeApi.minimumVersion))).API_VERSION).toBe(
      NativeApi.minimumVersion,
    );
    expect((await NativeApi.load(await installVendoredApi("0.12.0"))).API_VERSION).toBe("0.12.0");
  });
});
