import { describe, expect, test } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnvFile } from "../executors";
import { secretEnvSentinels, writeSecretEnvFixture } from "../test/secretEnvFixture";
import { tempDirs } from "../test/testHelpers";
import { SecretEnvDeclaration } from "./secretEnvDeclaration";
import { SecretEnvFile } from "./secretEnvFile";

const makeTempRoot = tempDirs("akan-devkit-secret-env-file-");

const declare = async () => {
  const root = await makeTempRoot();
  const { envDir } = await writeSecretEnvFixture(root);
  const { variables } = await SecretEnvDeclaration.of(envDir, "main");
  return { root, variables, values: Object.fromEntries(variables.map(({ name, value }) => [name, value])) };
};

describe("SecretEnvFile", () => {
  test("a Kubernetes Secret decodes to the values the env file evaluates to, byte for byte", async () => {
    const { variables, values } = await declare();
    const manifest = Bun.YAML.parse(SecretEnvFile.render("k8s", variables, "app-env")) as {
      apiVersion: string;
      kind: string;
      metadata: { name: string };
      type: string;
      data: { [name: string]: string };
    };
    expect({ ...manifest, data: undefined }).toEqual({
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name: "app-env" },
      type: "Opaque",
      data: undefined,
    });
    const decoded = Object.fromEntries(
      Object.entries(manifest.data).map(([name, value]) => [name, Buffer.from(value, "base64").toString("utf8")]),
    );
    expect(decoded).toEqual(values);
    expect(decoded.PUSH_NOTI__FIREBASE__PRIVATE_KEY).toBe(secretEnvSentinels.pem);
    expect(JSON.parse(decoded.DISCORD__TOKENS ?? "")).toEqual(secretEnvSentinels.bots);
  });

  test("a Secret of no variable is still one a deployment can reference, and a name Kubernetes refuses is refused", () => {
    expect(Bun.YAML.parse(SecretEnvFile.render("k8s", [], "app-env"))).toMatchObject({ kind: "Secret", data: {} });
    expect(() => SecretEnvFile.render("k8s", [], "App_Env")).toThrow(
      "--name App_Env is not a name a Kubernetes Secret can take",
    );
  });

  test("a dotenv file reads back to the same strings, through this package's reader and through Bun's own loader", async () => {
    const { root, variables, values } = await declare();
    const file = path.join(root, "secrets.env");
    await writeFile(file, SecretEnvFile.render("dotenv", variables, "unused"));
    expect(parseEnvFile(file)).toEqual(values);
    const loaded = Bun.spawnSync(
      [
        process.execPath,
        `--env-file=${file}`,
        "-e",
        `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(Object.keys(values))}.map((name) => [name, process.env[name]]))))`,
      ],
      { cwd: root, env: { PATH: process.env.PATH ?? "", HOME: "/home/fixture", USER: "fixture" } },
    );
    expect(JSON.parse(loaded.stdout.toString())).toEqual(values);
  });

  test("refuses a value no dotenv line carries unchanged, naming the variable alone", () => {
    const value = 'sentinel-line-one\n"quoted" \\n';
    const failure = (() => {
      try {
        SecretEnvFile.render("dotenv", [{ name: "FIXTURE__KEY", kind: "multiline", path: "fixture.key", value }], "");
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(failure).toBe(
      "FIXTURE__KEY holds a mix of line breaks, quotes and backslashes no dotenv line carries unchanged. Write it with --format k8s, which keeps every byte.",
    );
  });

  test("writes a file its user alone can read, and replaces an existing one only when told to", async () => {
    const root = await makeTempRoot();
    const file = path.join(root, "out/secrets.yaml");
    await SecretEnvFile.write(file, "first\n", { workspaceRoot: root });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(SecretEnvFile.write(file, "second\n", { workspaceRoot: root })).rejects.toThrow(
      `--out ${file} exists. Pass --force to replace it.`,
    );
    expect(await readFile(file, "utf8")).toBe("first\n");
    await writeFile(file, "loose\n", { mode: 0o644 });
    await SecretEnvFile.write(file, "second\n", { workspaceRoot: root, force: true });
    expect(await readFile(file, "utf8")).toBe("second\n");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  test("refuses a path under dist/, which an image copies, and one git would track", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "dist/apps/demo"), { recursive: true });
    const built = path.join(root, "dist/apps/demo/.env");
    await expect(SecretEnvFile.write(built, "x\n", { workspaceRoot: root })).rejects.toThrow(
      `--out ${built} is under dist/, and an image copies the whole of dist/apps/<app>, so the secrets would ship in it. Write the file outside dist/.`,
    );
    expect(await Bun.file(built).exists()).toBe(false);

    expect(Bun.spawnSync(["git", "init", "-q", root]).exitCode).toBe(0);
    await writeFile(path.join(root, ".gitignore"), "local/\n");
    const tracked = path.join(root, "secrets.env");
    await expect(SecretEnvFile.write(tracked, "x\n", { workspaceRoot: root })).rejects.toThrow(
      `--out ${tracked} is inside a git repository that does not ignore it, so the secrets could be committed.`,
    );
    expect(await Bun.file(tracked).exists()).toBe(false);
    await SecretEnvFile.write(path.join(root, "local/secrets.env"), "x\n", { workspaceRoot: root });
    expect(await readFile(path.join(root, "local/secrets.env"), "utf8")).toBe("x\n");
  });
});
