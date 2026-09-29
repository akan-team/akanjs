import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";
import { tempDirs } from "../testHelpers";
import { NativePluginFolders } from "./nativePluginFolders";

const makeTempRoot = tempDirs("akan-native-plugin-folders-");

const writePlugin = async (root: string, folder: string, id: unknown = folder) => {
  const dir = path.join(root, "native", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "native-plugin.json"), JSON.stringify({ id, apiVersion: 1, methods: [] }));
  return dir;
};

const fakeApp = (root: string, libs: string[]) =>
  ({
    name: "board",
    cwdPath: path.join(root, "apps", "board"),
    workspace: { workspaceRoot: root },
    getScanInfo: () => ({ getLibs: () => libs }),
  }) as unknown as App;

describe("NativePluginFolders", () => {
  test("finds each plugin folder in native/, by name", async () => {
    const root = await makeTempRoot();
    const kiosk = await writePlugin(root, "kiosk");
    const audio = await writePlugin(root, "audio-output");
    await writeFile(path.join(root, "native", "README.md"), "notes");

    expect(await NativePluginFolders.in(root, "apps/board")).toEqual([
      { id: "audio-output", dir: audio, owner: "apps/board" },
      { id: "kiosk", dir: kiosk, owner: "apps/board" },
    ]);
  });

  test("answers nothing for an app with no native folder", async () => {
    expect(await NativePluginFolders.in(await makeTempRoot(), "apps/board")).toEqual([]);
  });

  test("refuses a folder without a manifest, or one named apart from its id", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "native", "helpers"), { recursive: true });
    await expect(NativePluginFolders.in(root, "apps/board")).rejects.toThrow(
      "apps/board/native/helpers has no native-plugin.json",
    );

    const other = await makeTempRoot();
    await writePlugin(other, "kiosk-tools", "kiosk");
    await expect(NativePluginFolders.in(other, "libs/kiosk")).rejects.toThrow(
      'libs/kiosk/native/kiosk-tools/native-plugin.json has id "kiosk"; name the folder after its id.',
    );
  });

  test("the app's own plugin wins an id, and two libs may not both hold one", () => {
    const app = { id: "kiosk", dir: "/w/apps/board/native/kiosk", owner: "apps/board" };
    const libKiosk = { id: "kiosk", dir: "/w/libs/signage/native/kiosk", owner: "libs/signage" };
    const libAudio = { id: "audio", dir: "/w/libs/signage/native/audio", owner: "libs/signage" };

    expect(NativePluginFolders.select([app], [libKiosk, libAudio])).toEqual([app, libAudio]);
    expect(() =>
      NativePluginFolders.select(
        [],
        [libKiosk, { ...libKiosk, dir: "/w/libs/venue/native/kiosk", owner: "libs/venue" }],
      ),
    ).toThrow('libs/signage and libs/venue both hold native plugin "kiosk"; give the app its own native/kiosk');
  });

  test("an app ships its own plugins and those of the libs it depends on, not of other libs", async () => {
    const root = await makeTempRoot();
    const own = await writePlugin(path.join(root, "apps", "board"), "kiosk");
    const used = await writePlugin(path.join(root, "libs", "signage"), "audio");
    await writePlugin(path.join(root, "libs", "unused"), "camera-rig");

    expect(await NativePluginFolders.of(fakeApp(root, ["signage"]))).toEqual([
      { id: "kiosk", dir: own, owner: "apps/board" },
      { id: "audio", dir: used, owner: "libs/signage" },
    ]);
  });
});
