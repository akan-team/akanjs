import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { dayjs } from "akanjs/base";
import { AkanServer } from "akanjs/server";

import * as cnst from "../cnst";
import type * as srv from "../srv";
import { SummaryModel } from "./summary.document";

const tmp = `${Bun.env.TMPDIR ?? "/tmp"}/akan-summary-${crypto.randomUUID()}`;
const previousEnv = { workspaceRoot: process.env.AKAN_WORKSPACE_ROOT, commandType: process.env.AKAN_COMMAND_TYPE };

describe("Summary Service", () => {
  let server: AkanServer;
  let summaryService: srv.SummaryService;
  let userService: srv.UserService;

  beforeAll(async () => {
    Object.assign(process.env, {
      AKAN_WORKSPACE_ROOT: tmp,
      AKAN_PUBLIC_APP_NAME: "shared",
      AKAN_PUBLIC_REPO_NAME: "akan",
      AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
      AKAN_PUBLIC_ENV: "testing",
      AKAN_PUBLIC_OPERATION_MODE: "local",
      SERVER_MODE: "all",
      NODE_ENV: "test",
      AKAN_COMMAND_TYPE: "script",
    });
    const [{ lib: utilLib }, { lib }] = await Promise.all([import("@libs/util/server"), import("../../server")]);
    const sqlite = { journalMode: "WAL", synchronous: "NORMAL" };
    const env = {
      repoName: "akan",
      serveDomain: "example.com",
      appName: "shared",
      environment: "testing",
      operationMode: "local",
      tunnelUsername: "root",
      tunnelPassword: "akan",
      database: { sqlite: { filePath: `${tmp}/shared.db`, ...sqlite, foreignKeys: true } },
      solid: {
        filePath: `${tmp}/solid.db`,
        ...sqlite,
        cleanupIntervalMs: 60_000,
        queuePollIntervalMs: 60_000,
        queueLeaseMs: 30_000,
      },
    };
    server = new AkanServer("shared", env as ConstructorParameters<typeof AkanServer>[1], "all", utilLib, lib);
    await server.start({ listen: false, web: false });
    summaryService = server.getService<srv.SummaryService>("summary");
    userService = server.getService<srv.UserService>("user");
  });

  afterAll(async () => {
    await server.stop();
    if (previousEnv.workspaceRoot === undefined) delete process.env.AKAN_WORKSPACE_ROOT;
    else process.env.AKAN_WORKSPACE_ROOT = previousEnv.workspaceRoot;
    if (previousEnv.commandType === undefined) delete process.env.AKAN_COMMAND_TYPE;
    else process.env.AKAN_COMMAND_TYPE = previousEnv.commandType;
    Bun.spawnSync(["rm", "-rf", tmp]);
  });

  it("builds a missing active summary from the real counts", async () => {
    await userService.userModel.createUser({ status: "active" });

    const summary = await summaryService.getActiveSummary();
    expect(summary.type).toBe("active");
    expect(summary.activeUser).toBeGreaterThan(0);
    expect(summary.activeUser).toBe(await userService.userModel.countByStatuses(["active"]));
  });

  it("decrements with decValue and moves a count from one field to another", async () => {
    await summaryService.getActiveSummary();
    await summaryService.setValue("activeUser", 5);
    await summaryService.setValue("dormantUser", 0);

    expect(await summaryService.decValue("activeUser")).toBe(true);
    expect((await summaryService.getActiveSummary()).activeUser).toBe(4);

    await summaryService.incValue("activeUser", 2);
    await summaryService.moveValue("activeUser", "dormantUser", 3);
    expect(await summaryService.getActiveSummary()).toMatchObject({ activeUser: 3, dormantUser: 3 });
  });

  it("keeps one active row, typed active, even after finding an older one of another type", async () => {
    await summaryService.summaryModel.createSummary({ type: "non-periodic", status: "active" });
    await summaryService.makeSummary();
    await summaryService.makeSummary();

    expect(await summaryService.summaryModel.countByStatuses(["active"])).toBe(1);
    expect((await summaryService.getActiveSummary()).type).toBe("active");
  });

  it("stores one archived row per hour, rewritten by a second periodic run", async () => {
    const [type, at] = cnst.Summary.getPeriodicType();
    await summaryService.makeSummary("periodic");
    await summaryService.makeSummary("periodic");

    const archived = await summaryService.summaryModel.listToPeriod(dayjs(at), dayjs(at), [type]);
    expect(archived.map(({ id }) => id)).toEqual([SummaryModel.archivedIdOf(type, dayjs(at))]);
  });
});
