import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "../commandDecorators";
import { tempDirs } from "../testHelpers";
import { CloudApi } from "./cloudApi";
import { UpdatePackUpload } from "./updatePackUpload";

interface Put {
  uploadId: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

class FakeCloudHost {
  readonly server: ReturnType<typeof Bun.serve>;
  readonly requests: Record<string, unknown>[] = [];
  readonly puts: Put[] = [];
  readonly commits: string[] = [];
  readonly registrations: Record<string, string>[] = [];
  putStatuses: (number | Response)[] = [];
  stallPuts: boolean = false;
  commitAnswers: (number | [number, string] | Response)[] = [];
  release: Record<string, unknown> = { id: "release-1", status: "published", problems: [] };
  requestRefusal: Response | null = null;

  constructor() {
    this.server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (request) => this.#route(request) });
  }

  get host() {
    return `http://127.0.0.1:${this.server.port}`;
  }

  reset() {
    this.requests.length = 0;
    this.puts.length = 0;
    this.commits.length = 0;
    this.registrations.length = 0;
    this.putStatuses = [];
    this.stallPuts = false;
    this.commitAnswers = [];
    this.requestRefusal = null;
  }

  async #route(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/requestUpdateUpload/project-1") {
      if (this.requestRefusal) return this.requestRefusal;
      this.requests.push({ ...(await request.json()), authorization: request.headers.get("authorization") });
      const uploadId = `upload-${this.requests.length}`;
      return Response.json({
        uploadId,
        uploadUrl: `${this.host}/storage/${uploadId}?X-Amz-Signature=secret-signature`,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        contentType: "application/gzip",
      });
    }
    if (url.pathname.startsWith("/storage/") && request.method === "PUT") {
      this.puts.push({
        uploadId: url.pathname.slice("/storage/".length),
        headers: Object.fromEntries(request.headers),
        body: new Uint8Array(await request.arrayBuffer()),
      });
      if (this.stallPuts) return await new Promise<Response>(() => undefined);
      const answer = this.putStatuses.shift() ?? 200;
      return answer instanceof Response ? answer : new Response(null, { status: answer });
    }
    if (url.pathname === "/api/commitUpdateUpload/project-1") {
      const { uploadId } = (await request.json()) as { uploadId: string };
      this.commits.push(uploadId);
      const answer = this.#answer();
      if (answer) return answer;
      return Response.json({ ...this.release, uploadId });
    }
    if (url.pathname === "/api/registerAppBinary/project-1") {
      const form = await request.formData();
      this.registrations.push(
        Object.fromEntries(
          [...form.entries()].map(([key, value]) => [key, typeof value === "string" ? value : "<file>"]),
        ),
      );
      return this.#answer() ?? Response.json({ id: "binary-1" });
    }
    return new Response("not found", { status: 404 });
  }

  #answer() {
    const answer = this.commitAnswers.shift();
    if (!answer) return null;
    if (answer instanceof Response) return answer;
    const [status, key] = typeof answer === "number" ? [answer, "release.error.uploadCommitInProgress"] : answer;
    return Response.json({ error: key }, { status });
  }
}

const makeDir = tempDirs("akan-update-upload-");
const cloudHost = new FakeCloudHost();
const api = new CloudApi({} as Workspace, {
  host: cloudHost.host,
  auth: { accessToken: { jwt: "jwt-1", refreshToken: null, expiresAt: null } },
});
const fields = { appName: "lu", target: "default", platform: "android" as const, channel: "develop", notes: null };
const quick = { putRetryMs: 1, commitRetryMs: 1, cutOffWindowMs: 1_000, commitLimitMs: 1_000 };

const archiveOf = async (bytes: string) => {
  const archive = path.join(await makeDir(), "pack.tgz");
  await writeFile(archive, bytes);
  return archive;
};

beforeEach(() => cloudHost.reset());
afterAll(() => cloudHost.server.stop(true));

describe("UpdatePackUpload", () => {
  test("announces the archive's size and digest, PUTs it with nothing but its content type, then commits", async () => {
    const archive = await archiveOf("pack bytes");

    const release = await new UpdatePackUpload(api, "project-1", quick).send(archive, fields);

    expect(release).toEqual({ id: "release-1", status: "published", problems: [], uploadId: "upload-1" });
    expect(cloudHost.requests).toEqual([
      {
        ...fields,
        size: 10,
        sha256: createHash("sha256").update("pack bytes").digest("hex"),
        authorization: "Bearer jwt-1",
      },
    ]);
    const [put] = cloudHost.puts;
    expect(new TextDecoder().decode(put?.body)).toBe("pack bytes");
    expect(put?.headers["content-type"]).toBe("application/gzip");
    expect(put?.headers["content-length"]).toBe("10");
    expect(put?.headers.authorization).toBeUndefined();
    expect(Object.keys(put?.headers ?? {}).filter((name) => name.startsWith("x-amz-"))).toEqual([]);
    expect(cloudHost.commits).toEqual(["upload-1"]);
  });

  test("takes one fresh ticket when storage answers 403, and gives up on the second without naming the URL", async () => {
    const archive = await archiveOf("pack");
    cloudHost.putStatuses = [403];

    await new UpdatePackUpload(api, "project-1", quick).send(archive, fields);
    expect(cloudHost.puts.map(({ uploadId }) => uploadId)).toEqual(["upload-1", "upload-2"]);
    expect(cloudHost.commits).toEqual(["upload-2"]);

    cloudHost.reset();
    cloudHost.putStatuses = [403, 403];
    const refusal = await new UpdatePackUpload(api, "project-1", quick).send(archive, fields).catch((e: Error) => e);
    expect(String(refusal)).toContain("HTTP 403");
    expect(String(refusal)).not.toContain("secret-signature");
    expect(cloudHost.commits).toEqual([]);
  });

  test("retries a PUT the way curl --retry does, and stops at a refusal that is not transient", async () => {
    const archive = await archiveOf("pack");
    cloudHost.putStatuses = [503, 502];
    await new UpdatePackUpload(api, "project-1", quick).send(archive, fields);
    expect(cloudHost.puts.map(({ uploadId }) => uploadId)).toEqual(["upload-1", "upload-1", "upload-1"]);

    cloudHost.reset();
    cloudHost.putStatuses = [400];
    await expect(new UpdatePackUpload(api, "project-1", quick).send(archive, fields)).rejects.toThrow("HTTP 400");
    expect(cloudHost.puts).toHaveLength(1);
  });

  test("asks again with the same id while the commit is cut off or still running, but not past a real answer", async () => {
    const archive = await archiveOf("pack");
    cloudHost.commitAnswers = [524, 409, 502];
    await new UpdatePackUpload(api, "project-1", quick).send(archive, fields);
    expect(cloudHost.commits).toEqual(["upload-1", "upload-1", "upload-1", "upload-1"]);

    cloudHost.reset();
    cloudHost.commitAnswers = [404];
    await expect(new UpdatePackUpload(api, "project-1", quick).send(archive, fields)).rejects.toThrow("404");
    expect(cloudHost.commits).toEqual(["upload-1"]);

    cloudHost.reset();
    cloudHost.commitAnswers = Array.from({ length: 100 }, () => 524);
    const cutOff = { putRetryMs: 1, commitRetryMs: 10, cutOffWindowMs: 35, commitLimitMs: 10_000 };
    await expect(new UpdatePackUpload(api, "project-1", cutOff).send(archive, fields)).rejects.toThrow("524");
    expect(cloudHost.commits.length).toBeLessThan(6);
  });

  test("keeps waiting on a live claim past the cut-off window, up to the overall limit", async () => {
    const archive = await archiveOf("pack");
    cloudHost.commitAnswers = [...Array.from({ length: 6 }, () => 409), 524, ...Array.from({ length: 6 }, () => 409)];
    const timing = { putRetryMs: 1, commitRetryMs: 10, cutOffWindowMs: 25, commitLimitMs: 10_000 };
    await new UpdatePackUpload(api, "project-1", timing).send(archive, fields);
    expect(cloudHost.commits).toHaveLength(14);

    cloudHost.reset();
    cloudHost.commitAnswers = Array.from({ length: 100 }, () => 409);
    const limited = { putRetryMs: 1, commitRetryMs: 10, cutOffWindowMs: 10_000, commitLimitMs: 35 };
    await expect(new UpdatePackUpload(api, "project-1", limited).send(archive, fields)).rejects.toThrow("409");
    expect(cloudHost.commits.length).toBeLessThan(6);
  });

  test("gives up a stalled PUT after a time its size sets, and tries it again as a dropped one", async () => {
    const archive = await archiveOf("pack");
    cloudHost.stallPuts = true;

    await expect(
      new UpdatePackUpload(api, "project-1", { ...quick, putTimeoutMs: 50 }).send(archive, fields),
    ).rejects.toThrow("no response");
    expect(cloudHost.puts).toHaveLength(4);
    expect(cloudHost.commits).toEqual([]);
  });

  test("asks again past a gateway's 503, but not past one the server answers with its own refusal", async () => {
    const archive = await archiveOf("pack");
    cloudHost.commitAnswers = [
      new Response("No healthy federation child is ready", { status: 503 }),
      [503, "base.error.serverUnavailable"],
    ];
    await new UpdatePackUpload(api, "project-1", quick).send(archive, fields);
    expect(cloudHost.commits).toEqual(["upload-1", "upload-1", "upload-1"]);

    cloudHost.reset();
    cloudHost.commitAnswers = [[503, "release.error.signingUnavailable"]];
    await expect(new UpdatePackUpload(api, "project-1", quick).send(archive, fields)).rejects.toThrow(
      "release.error.signingUnavailable",
    );
    expect(cloudHost.commits).toEqual(["upload-1"]);
  });

  test("tells a server without staged uploads apart from one whose 404 is a refusal", async () => {
    const archive = await archiveOf("pack");
    cloudHost.requestRefusal = new Response("Not Found", { status: 404 });
    await expect(new UpdatePackUpload(api, "project-1", quick).send(archive, fields)).rejects.toThrow(
      "does not take direct pack uploads yet",
    );

    cloudHost.requestRefusal = Response.json(
      { error: "devProject.error.appNotFound", statusCode: 404 },
      { status: 404 },
    );
    const refusal = await new UpdatePackUpload(api, "project-1", quick).send(archive, fields).catch((e: Error) => e);
    expect(String(refusal)).toContain("devProject.error.appNotFound");
    expect(cloudHost.puts).toEqual([]);
  });

  test("stops at once on a 409 that is not a commit in progress: the upload is already used", async () => {
    const archive = await archiveOf("pack");
    cloudHost.commitAnswers = [[409, "release.error.uploadEmbedded"]];
    await expect(new UpdatePackUpload(api, "project-1", quick).send(archive, fields)).rejects.toThrow("uploadEmbedded");
    expect(cloudHost.commits).toHaveLength(1);
  });

  test("stages a binary's pack and registers it by upload id, asking again while the server is still at it", async () => {
    const archive = await archiveOf("pack");
    cloudHost.commitAnswers = [524, 409];
    const upload = new UpdatePackUpload(api, "project-1", quick);
    const binary = await upload.stage(archive, fields).then((packUploadId) =>
      upload.settle(() =>
        api.registerAppBinary("project-1", {
          appName: "lu",
          target: "default",
          distribution: "playTesting",
          bundle: new Blob(["{}"]),
          packUploadId,
          channel: "develop",
        }),
      ),
    );

    expect(binary).toEqual({ id: "binary-1" });
    expect(cloudHost.commits).toEqual([]);
    expect(cloudHost.registrations).toHaveLength(3);
    expect(cloudHost.registrations[2]).toEqual({
      appName: "lu",
      target: "default",
      distribution: "playTesting",
      channel: "develop",
      bundle: "<file>",
      packUploadId: "upload-1",
    });
  });

  test("waits as long as storage's Retry-After asks before trying a PUT again", async () => {
    const archive = await archiveOf("pack");
    cloudHost.putStatuses = [new Response(null, { status: 429, headers: { "Retry-After": "1" } })];
    const startedAt = performance.now();

    await new UpdatePackUpload(api, "project-1", quick).send(archive, fields);

    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(950);
    expect(cloudHost.puts).toHaveLength(2);
  });

  test("never asks again sooner than the server's Retry-After, nor past the limit it would wait to", async () => {
    const archive = await archiveOf("pack");
    cloudHost.commitAnswers = [new Response("busy", { status: 503, headers: { "Retry-After": "120" } })];

    await expect(new UpdatePackUpload(api, "project-1", quick).send(archive, fields)).rejects.toThrow("503");
    expect(cloudHost.commits).toEqual(["upload-1"]);
  });

  test("refuses an empty archive before asking for a ticket", async () => {
    const archive = await archiveOf("");
    await expect(new UpdatePackUpload(api, "project-1", quick).send(archive, fields)).rejects.toThrow("0 bytes");
    expect(cloudHost.requests).toEqual([]);
  });
});
