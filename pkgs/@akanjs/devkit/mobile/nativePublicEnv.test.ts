import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import path from "node:path";
import { WorkspaceExecutor } from "../executors";
import { tempDirs, writeText } from "../test/testHelpers";
import { NativePublicEnv } from "./nativePublicEnv";

const makeTempRoot = tempDirs("akan-native-public-env-");

const recorded = {
  AKAN_PUBLIC_ENV: "main",
  AKAN_PUBLIC_REPO_NAME: "softs2",
  AKAN_PUBLIC_SERVE_DOMAIN: "akamir.com",
};

describe("NativePublicEnv", () => {
  test("keeps the AKAN_PUBLIC_* the app sets, sorted, and leaves out what akan.config.ts derives", () => {
    expect(
      Object.keys(
        NativePublicEnv.of({
          AKAN_PUBLIC_SERVE_DOMAIN: "akamir.com",
          AKAN_PUBLIC_APP_NAME: "lu",
          AKAN_PUBLIC_BASE_PATHS: "",
          AKAN_PUBLIC_RENDER_ENV: "csr",
          AKAN_PUBLIC_ENV: "main",
          JWT_SECRET: "never",
        }),
      ),
    ).toEqual(["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_SERVE_DOMAIN"]);
  });

  test("hashes the sorted map as JSON, whatever order it was written in", () => {
    const reversed = Object.fromEntries(Object.entries(recorded).reverse());
    const expected = createHash("sha256").update(JSON.stringify(recorded)).digest("hex");
    expect(NativePublicEnv.hash(reversed)).toBe(expected);
  });

  test("refuses what Akan Cloud refuses in a recorded env", () => {
    expect(NativePublicEnv.problems(recorded)).toEqual([]);
    expect(
      NativePublicEnv.problems({
        AKAN_PUBLIC_lower: "x",
        AKAN_PUBLIC_MAP_TOKEN: "x",
        AKAN_PUBLIC_PORT: 8282,
        AKAN_PUBLIC_NOTE: "line\nbreak",
        AKAN_PUBLIC_SIGNER: "-----BEGIN EC PRIVATE KEY-----\\nMHc\\n-----END EC PRIVATE KEY-----",
      }),
    ).toEqual([
      "AKAN_PUBLIC_lower is not an AKAN_PUBLIC_[A-Z0-9_] name",
      "AKAN_PUBLIC_MAP_TOKEN names a token, which a page bundle must not carry",
      "AKAN_PUBLIC_PORT is not a string",
      "AKAN_PUBLIC_NOTE holds a control character",
      "AKAN_PUBLIC_SIGNER holds a private key",
    ]);
    const many = Object.fromEntries(Array.from({ length: 257 }, (_, idx) => [`AKAN_PUBLIC_K${idx}`, "v"]));
    expect(NativePublicEnv.problems(many)).toEqual(["257 keys, more than 256"]);
    expect(NativePublicEnv.problems({ AKAN_PUBLIC_BIG: "x".repeat(70_000) })[0]).toContain("bytes, more than 65536");
  });

  test("names the keys two maps disagree on, either side missing included", () => {
    expect(
      NativePublicEnv.diff(recorded, { ...recorded, AKAN_PUBLIC_SERVE_DOMAIN: "try.akanjs.com", AKAN_PUBLIC_X: "1" }),
    ).toEqual(["AKAN_PUBLIC_SERVE_DOMAIN", "AKAN_PUBLIC_X"]);
  });

  test("loads --public-env from a JSON map or from a store build's bundle.json, and refuses the rest", async () => {
    const root = await makeTempRoot();
    const map = path.join(root, "store.env.json");
    await writeText(map, JSON.stringify(recorded));
    expect(await NativePublicEnv.load(map)).toEqual(recorded);

    const bundle = path.join(root, "bundle.json");
    await writeText(bundle, JSON.stringify({ schema: 1, web: { hash: "h", files: 1, publicEnv: recorded } }));
    expect(await NativePublicEnv.load(bundle)).toEqual(recorded);
    expect(await NativePublicEnv.recordedIn(bundle)).toEqual(recorded);

    const older = path.join(root, "older.json");
    await writeText(older, JSON.stringify({ schema: 1, web: { hash: "h", files: 1 } }));
    await expect(NativePublicEnv.load(older)).rejects.toThrow("recorded no public env");
    expect(await NativePublicEnv.recordedIn(older)).toBeNull();
    expect(await NativePublicEnv.recordedIn(path.join(root, "missing.json"))).toBeNull();

    const derived = path.join(root, "derived.json");
    await writeText(derived, JSON.stringify({ ...recorded, AKAN_PUBLIC_APP_NAME: "lu" }));
    await expect(NativePublicEnv.load(derived)).rejects.toThrow("AKAN_PUBLIC_APP_NAME, which akan.config.ts decides");

    const secret = path.join(root, "secret.json");
    await writeText(secret, JSON.stringify({ AKAN_PUBLIC_API_PASSWORD: "x" }));
    await expect(NativePublicEnv.load(secret)).rejects.toThrow("names a password");
    await expect(NativePublicEnv.load(path.join(root, "nope.json"))).rejects.toThrow("does not exist");
  });

  test("says which keys keep a pack out of a store build that recorded its env, and nothing when it recorded none", async () => {
    const root = await makeTempRoot();
    const shipped = path.join(root, "store.json");
    const pack = path.join(root, "pack.json");
    await writeText(shipped, JSON.stringify({ schema: 1, web: { publicEnv: recorded } }));
    await writeText(
      pack,
      JSON.stringify({ schema: 1, web: { publicEnv: { ...recorded, AKAN_PUBLIC_SERVE_DOMAIN: "try.akanjs.com" } } }),
    );
    expect(await NativePublicEnv.problemAgainst(shipped, pack)).toBe(
      `public env AKAN_PUBLIC_SERVE_DOMAIN differs from the store build's (pass --public-env ${shipped} to repeat it)`,
    );
    expect(await NativePublicEnv.problemAgainst(shipped, shipped)).toBeNull();
    expect(await NativePublicEnv.problemAgainst(pack.replace("pack", "none"), pack)).toBeNull();
  });

  describe("pin", () => {
    const saved = { ...process.env };
    afterEach(() => {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
      WorkspaceExecutor.publicEnvPin = null;
    });

    test("leaves exactly the pinned values and the derived ones, and outranks the shell and the root .env", async () => {
      const root = await makeTempRoot();
      const envFile = path.join(root, ".env");
      await writeText(
        envFile,
        "AKAN_PUBLIC_REPO_NAME=from-dotenv\nAKAN_PUBLIC_SERVE_DOMAIN=try.akanjs.com\nAKAN_PUBLIC_LOG_LEVEL=debug\n",
      );
      Object.assign(process.env, { AKAN_PUBLIC_LOG_LEVEL: "debug", AKAN_PUBLIC_APP_NAME: "lu" });
      NativePublicEnv.pin(recorded);
      expect(NativePublicEnv.of(process.env)).toEqual(recorded);
      expect(process.env.AKAN_PUBLIC_APP_NAME).toBe("lu");
      Object.assign(process.env, {
        AKAN_PUBLIC_REPO_NAME: "from-shell",
        AKAN_PUBLIC_SERVE_DOMAIN: "shell.example.com",
      });
      const base = WorkspaceExecutor.getBaseDevEnv(envFile);
      expect(base.repoName).toBe("softs2");
      expect(base.serveDomain).toBe("akamir.com");
    });
  });
});
