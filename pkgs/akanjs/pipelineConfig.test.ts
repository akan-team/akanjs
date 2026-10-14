import { describe, expect, test } from "bun:test";
import type { AppConfig, AppConfigInput, LibConfig, WorkspaceConfig } from "./index";
import * as akanjs from "./index";
import { defaultAppPipeline } from "./pipelineConfig";

const appConfig: AppConfigInput = {
  externalLibs: ["shiki"],
  pipeline: (ctx) => ({
    after: ["api"],
    stages: [
      { use: "build", allowFailure: true, milestone: "verify", when: { changed: ["apps/web/**"] } },
      { name: "Test", sh: `bun run akan test ${ctx.app}`, timeout: "20m", retry: { attempts: 2, delay: "10s" } },
      { use: "docker", retry: 2 },
      { use: "deploy", when: { branch: "main", trigger: ["push", "redeploy"] } },
      { name: "Smoke", steps: ["curl -fsS https://example.com/api/ping", { sh: "bun smoke", skipExitCodes: [3] }] },
    ],
  }),
};

const workspaceConfig: WorkspaceConfig = {
  subspace: { exclude: ["infra"], subspaces: [{ name: "a", repo: "a.git", apps: ["web"], workspaceId: "id" }] },
  pipeline: (ctx) => ({
    env: { NODE_ENV: "production" },
    timeout: "1h",
    before: [
      {
        name: "Checks",
        parallel: [
          { name: "Lint", sh: "bun run lint" },
          { name: "Test", sh: "bun test" },
        ],
      },
    ],
    after: [{ name: "E2E", matrix: "apps", sh: "bun run e2e $AKAN_CI_APP", when: { app: ["*", "!edge"] } }],
    post: ctx.workspaceApps.includes("console")
      ? { failure: [{ sh: "./notify.sh", secrets: ["DISCORD_WEBHOOK"] }] }
      : {},
  }),
};

const appWhenApp: AppConfig = {
  pipeline: {
    stages: [
      {
        name: "x",
        sh: "x",
        // @ts-expect-error `when.app` belongs to a workspace matrix stage, not to an app's own stage
        when: { app: "web" },
      },
    ],
  },
};

const appMatrix: AppConfig = {
  pipeline: {
    stages: [
      {
        name: "x",
        sh: "x",
        // @ts-expect-error an app's stages are already that one app's
        matrix: "apps",
      },
    ],
  },
};

const workspaceAction: WorkspaceConfig = {
  pipeline: {
    before: [
      {
        // @ts-expect-error built-in actions are declared per app
        use: "build",
      },
    ],
  },
};

const parallelAction: WorkspaceConfig = {
  pipeline: {
    before: [
      {
        name: "p",
        parallel: [
          {
            // @ts-expect-error a parallel branch is a shell stage
            use: "docker",
          },
        ],
      },
    ],
  },
};

const postUnstable: WorkspaceConfig = {
  pipeline: {
    post: {
      // @ts-expect-error the framework has no unstable result; the executor names its own
      unstable: ["./notify.sh"],
    },
  },
};

const libPipeline: LibConfig = {
  // @ts-expect-error a lib has no pipeline
  pipeline: { stages: [] },
};

describe("pipeline config types", () => {
  test("an app without a pipeline runs build, docker and deploy", () => {
    expect(defaultAppPipeline).toEqual({ stages: [{ use: "build" }, { use: "docker" }, { use: "deploy" }] });
    expect(akanjs.defaultAppPipeline).toBe(defaultAppPipeline);
  });

  test("both function forms are plain data producers", () => {
    expect(typeof appConfig.pipeline).toBe("function");
    expect(typeof workspaceConfig.pipeline).toBe("function");
  });

  test("the refused shapes above stay data the type system rejects, not runtime checks", () => {
    expect([appWhenApp, appMatrix, workspaceAction, parallelAction, postUnstable, libPipeline]).toHaveLength(6);
  });
});
