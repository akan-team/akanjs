import { describe, expect, test } from "bun:test";
import path from "node:path";
import { SubspaceConfig } from "@akanjs/devkit/subspaceConfig";
import { isolateEnv, makeCliTempWorkspace, tempRoots, writeText } from "@akanjs/devkit/testHelpers";
import { SubspaceRunner } from "./subspace.runner";

const config = new SubspaceConfig({
  subspaces: [
    { name: "acme", repo: "git@github.com:acme/app.git", apps: ["acme"] },
    { name: "globex", repo: "git@github.com:globex/app.git", apps: ["globex", "globex-admin"] },
  ],
});

interface PromptCall {
  kind: "checkbox" | "select";
  message: string;
  choices: { name: string; value: string; description?: string }[];
  required?: boolean;
}

const fakePrompts = (answer: string | string[]) => {
  const calls: PromptCall[] = [];
  const prompts = {
    checkbox: (async (options: Omit<PromptCall, "kind">) => {
      calls.push({ kind: "checkbox", ...options });
      return answer;
    }) as never,
    confirm: (async () => true) as never,
    select: (async (options: Omit<PromptCall, "kind">) => {
      calls.push({ kind: "select", ...options });
      return answer;
    }) as never,
  };
  return { prompts, calls };
};

isolateEnv();
const track = tempRoots();

const makeEnvUploadWorkspace = async () => {
  const { root, workspace } = track(await makeCliTempWorkspace());
  process.env.AKAN_PUBLIC_REPO_NAME = "repo";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
  process.env.AKAN_PUBLIC_ENV = "local";
  process.env.AKAN_WORKSPACE_ID = "workspace-project";
  await writeText(
    path.join(root, "akan.config.ts"),
    `export default {
  subspace: {
    subspaces: [
      { name: "acme", repo: "git@github.com:acme/app.git", apps: ["acme"] },
      { name: "globex", repo: "git@github.com:globex/app.git", apps: ["globex"], workspaceId: "workspace-project" },
    ],
  },
};
`,
  );
  return workspace;
};

describe("SubspaceRunner.chooseNames", () => {
  test("asks for several subspaces for status and push", async () => {
    const { prompts, calls } = fakePrompts(["acme", "globex"]);

    const names = await SubspaceRunner.chooseNames(config, "push", { interactive: true, prompts });

    expect(names).toEqual(["acme", "globex"]);
    expect(calls).toEqual([
      {
        kind: "checkbox",
        message: "Select subspaces to push",
        required: true,
        choices: [
          { name: "acme", value: "acme", description: "git@github.com:acme/app.git · acme" },
          { name: "globex", value: "globex", description: "git@github.com:globex/app.git · globex, globex-admin" },
        ],
      },
    ]);
  });

  test("asks for exactly one subspace for plan, diff and pull", async () => {
    const { prompts, calls } = fakePrompts("globex");

    expect(await SubspaceRunner.chooseNames(config, "pull", { interactive: true, prompts })).toEqual(["globex"]);
    expect(await SubspaceRunner.chooseNames(config, "diff", { interactive: true, prompts })).toEqual(["globex"]);
    expect(await SubspaceRunner.chooseNames(config, "plan", { interactive: true, prompts })).toEqual(["globex"]);
    expect(calls.map((call) => [call.kind, call.message])).toEqual([
      ["select", "Select a subspace to pull"],
      ["select", "Select a subspace to diff"],
      ["select", "Select a subspace to plan"],
    ]);
  });

  test("refuses to guess without a terminal and names the -all form only where one exists", async () => {
    await expect(SubspaceRunner.chooseNames(config, "push", { interactive: false })).rejects.toThrow(
      "run `akan subspace push-all`",
    );
    await expect(SubspaceRunner.chooseNames(config, "status", { interactive: false })).rejects.toThrow(
      "run `akan subspace status-all`",
    );
    await expect(SubspaceRunner.chooseNames(config, "pull", { interactive: false })).rejects.toThrow(
      "reviewed one repo at a time",
    );
  });

  test("takes one subspace for upload-env, which replaces one cloud workspace's archive", async () => {
    const { prompts, calls } = fakePrompts("acme");

    expect(await SubspaceRunner.chooseNames(config, "upload-env", { interactive: true, prompts })).toEqual(["acme"]);
    expect(calls.map((call) => call.kind)).toEqual(["select"]);
    await expect(SubspaceRunner.chooseNames(config, "upload-env", { interactive: false })).rejects.toThrow(
      "one repo at a time",
    );
  });

  test("refuses an empty declaration before prompting", async () => {
    const { prompts, calls } = fakePrompts([]);
    const empty = new SubspaceConfig({ subspaces: [] });

    await expect(SubspaceRunner.chooseNames(empty, "push", { interactive: true, prompts })).rejects.toThrow(
      "declares no subspaces",
    );
    expect(calls).toEqual([]);
  });
});

describe("SubspaceRunner.uploadEnv", () => {
  test("refuses a subspace that declares no cloud workspace of its own", async () => {
    const workspace = await makeEnvUploadWorkspace();

    await expect(
      new SubspaceRunner().uploadEnv(workspace as never, "acme", { host: "https://cloud", force: true }),
    ).rejects.toThrow("declares no workspaceId");
  });

  test("refuses this workspace's own id, which a slice upload would empty of every other app", async () => {
    const workspace = await makeEnvUploadWorkspace();

    await expect(
      new SubspaceRunner().uploadEnv(workspace as never, "globex", { host: "https://cloud", force: true }),
    ).rejects.toThrow("this workspace's own id");
  });
});

describe("SubspaceRunner.confirmEnvUpload", () => {
  const upload = { name: "globex", workspaceId: "globex-project", apps: ["globex"] };

  test("refuses to replace a customer's archive unasked when there is no terminal to ask in", async () => {
    await expect(SubspaceRunner.confirmEnvUpload(upload, { interactive: false })).rejects.toThrow("Pass --force");
    expect(await SubspaceRunner.confirmEnvUpload({ ...upload, force: true }, { interactive: false })).toBe(true);
  });

  test("names the subspace and its cloud workspace in the question, and defaults to no", async () => {
    const asked: { message: string; default?: boolean }[] = [];
    const prompts = {
      checkbox: (async () => []) as never,
      confirm: (async (options: { message: string; default?: boolean }) => {
        asked.push(options);
        return false;
      }) as never,
      select: (async () => "") as never,
    };

    expect(await SubspaceRunner.confirmEnvUpload(upload, { interactive: true, prompts })).toBe(false);
    expect(asked).toEqual([
      {
        message:
          'Replace the env archive of subspace "globex" (cloud workspace globex-project) with this workspace\'s env for globex and the libraries they pull in?',
        default: false,
      },
    ]);
  });
});
