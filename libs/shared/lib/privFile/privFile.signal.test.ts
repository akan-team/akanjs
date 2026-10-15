import { describe, expect, it } from "bun:test";
import { dayjs } from "akanjs/base";
import { AkanServer } from "akanjs/server";

import "../cnst";
import type * as srv from "../srv";
import { PrivFileService } from "./privFile.service";

const joinPath = (...paths: string[]) => paths.join("/").replaceAll(/\/+/g, "/");

const makeTestServer = async () => {
  const tmp = joinPath(process.cwd(), ".tmp", `akan-priv-file-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const previousWorkspaceRoot = process.env.AKAN_WORKSPACE_ROOT;
  const previousCommandType = process.env.AKAN_COMMAND_TYPE;
  process.env.AKAN_WORKSPACE_ROOT = tmp;
  process.env.AKAN_PUBLIC_APP_NAME = "shared";
  process.env.AKAN_PUBLIC_REPO_NAME = "akan";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
  process.env.AKAN_PUBLIC_ENV = "testing";
  process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
  process.env.SERVER_MODE = "all";
  process.env.NODE_ENV = "test";
  process.env.AKAN_COMMAND_TYPE = "script";
  const [{ lib: utilLib }, { lib }] = await Promise.all([import("@libs/util/server"), import("../../server")]);

  const env = {
    repoName: "akan",
    serveDomain: "example.com",
    appName: "shared",
    environment: "testing",
    operationMode: "local",
    tunnelUsername: "root",
    tunnelPassword: "akan",
    database: {
      sqlite: {
        filePath: joinPath(tmp, "shared.db"),
        journalMode: "WAL",
        synchronous: "NORMAL",
        foreignKeys: true,
      },
    },
    solid: {
      filePath: joinPath(tmp, "solid.db"),
      journalMode: "WAL",
      synchronous: "NORMAL",
      cleanupIntervalMs: 60_000,
      queuePollIntervalMs: 60_000,
      queueLeaseMs: 30_000,
    },
  };
  const server = new AkanServer("shared", env as ConstructorParameters<typeof AkanServer>[1], "all", utilLib, lib);
  await server.start({ listen: false, web: false });

  return {
    tmp,
    server,
    async cleanup() {
      await server.stop();
      if (previousWorkspaceRoot === undefined) delete process.env.AKAN_WORKSPACE_ROOT;
      else process.env.AKAN_WORKSPACE_ROOT = previousWorkspaceRoot;
      if (previousCommandType === undefined) delete process.env.AKAN_COMMAND_TYPE;
      else process.env.AKAN_COMMAND_TYPE = previousCommandType;
      Bun.spawnSync(["rm", "-rf", tmp]);
    },
  };
};

describe("PrivFile Service", () => {
  it("stores private files outside public url contract and reads them server-side", async () => {
    const { tmp, server, cleanup } = await makeTestServer();
    try {
      const sourcePath = joinPath(tmp, "secret.json");
      await Bun.write(sourcePath, JSON.stringify({ secret: "value" }));
      const privFileService = server.getService<srv.PrivFileService>("privFile");

      const privFile = await privFileService.addPrivFileFromLocal(
        {
          filename: "secret.json",
          mimetype: "application/json",
          encoding: "7bit",
          localPath: sourcePath,
        },
        "secret",
        "env",
        { alias: "production-env" },
      );

      expect("url" in privFile).toBe(false);
      expect(privFile.alias).toBe("production-env");
      expect(privFile.privatePath).toMatch(/^private\/secret\/env\//);
      expect(await privFileService.readJson<{ secret: string }>(privFile)).toEqual({ secret: "value" });

      const blobStorageApi = server.get((await import("@libs/util/srvkit")).BlobStorageApi);
      const publicProbe = Bun.file(joinPath(blobStorageApi.root, privFile.privatePath ?? ""));
      const privateProbe = Bun.file(joinPath(blobStorageApi.privateRoot, privFile.privatePath ?? ""));
      expect(await publicProbe.exists()).toBe(false);
      expect(await privateProbe.exists()).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

describe("PrivFile Upload Failures", () => {
  const backup = { filename: "dump.db.gz", mimetype: "application/gzip", encoding: "7bit" };

  it("removes the row of an upload that fails instead of leaving it uploading", async () => {
    const { server, cleanup } = await makeTestServer();
    try {
      const privFileService = server.getService<srv.PrivFileService>("privFile");
      const before = await privFileService.privFileModel.countAny();
      const failing = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error("connection reset"));
        },
      });

      await expect(privFileService.addPrivFileFromStream(failing, backup, "dbBackup", "x")).rejects.toThrow();
      expect(await privFileService.privFileModel.countAny()).toBe(before);
    } finally {
      await cleanup();
    }
  });

  it("creates no row when the storage cannot issue an upload URL", async () => {
    const { server, cleanup } = await makeTestServer();
    try {
      const privFileService = server.getService<srv.PrivFileService>("privFile");
      const before = await privFileService.privFileModel.countAny();

      await expect(privFileService.createUploadTarget(backup, "dbBackup", "x")).rejects.toThrow();
      expect(await privFileService.privFileModel.countAny()).toBe(before);
    } finally {
      await cleanup();
    }
  });

  it("sweeps an upload left unfinished for a day and keeps a fresh one", async () => {
    const { server, cleanup } = await makeTestServer();
    try {
      const privFileService = server.getService<srv.PrivFileService>("privFile");
      const stale = await privFileService.privFileModel.createPrivFile({
        alias: "stale",
        mimetype: "application/gzip",
        encoding: "7bit",
        status: "uploading",
        createdAt: dayjs().subtract(2, "day"),
      });
      const fresh = await privFileService.privFileModel.createPrivFile({
        alias: "fresh",
        mimetype: "application/gzip",
        encoding: "7bit",
        status: "uploading",
      });

      expect(await privFileService.removeStaleUploads()).toBe(1);
      expect(await privFileService.privFileModel.loadPrivFile(stale.id)).toBeNull();
      expect((await privFileService.privFileModel.loadPrivFile(fresh.id))?.alias).toBe("fresh");
    } finally {
      await cleanup();
    }
  });

  it("keeps a private path inside its purpose and group whatever the caller passes", () => {
    expect(PrivFileService.privatePathOf("abc", "../../etc/passwd", "../dbBackup", "a/b")).toBe(
      "private/dbBackup/ab/abc",
    );
    expect(PrivFileService.privatePathOf("abc", "backup.tar.gz", "", null)).toBe("private/default/default/abc.gz");
  });
});
