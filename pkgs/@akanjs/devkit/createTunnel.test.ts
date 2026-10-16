import { describe, expect, spyOn, test } from "bun:test";
import { Client } from "ssh2";
import { createTunnel } from "./createTunnel";
import { createTempApp, isolateEnv, tempRoots } from "./testHelpers";

describe("createTunnel", () => {
  isolateEnv({ AKAN_PUBLIC_REPO_NAME: "repo", AKAN_PUBLIC_SERVE_DOMAIN: "localhost", AKAN_PUBLIC_ENV: "testing" });
  const track = tempRoots();

  test("describes a refused Redis SSH connection and preserves its cause", async () => {
    const { app } = track(await createTempApp("demo"));
    const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    const port = listener.port;
    listener.stop(true);
    process.env.SSH_TUNNEL_PORT = String(port);

    let originalError: Error | undefined;
    const connect = Client.prototype.connect;
    const observeConnect = spyOn(Client.prototype, "connect").mockImplementation(function (this: Client, options) {
      this.once("error", (error: Error) => {
        originalError = error;
      });
      return connect.call(this, options);
    });
    let failure: unknown;
    try {
      await createTunnel("redis", { app, environment: "testing" });
    } catch (error) {
      failure = error;
    } finally {
      observeConnect.mockRestore();
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("expected tunnel failure");
    expect(failure.message).toContain("redis");
    expect(failure.message).toContain(`demo-testing.localhost:${port}`);
    expect(failure.message).toContain("redis-0.redis-svc.demo-testing.svc.cluster.local:6379");
    expect(failure.message).toContain("ECONNREFUSED");
    expect(failure.cause).toBeInstanceOf(Error);
    expect(failure.cause).toBe(originalError);
    expect(failure.cause).not.toBe(failure);
    if (!(failure.cause instanceof Error)) throw new Error("expected original SSH error");
    const reasons = failure.cause instanceof AggregateError ? failure.cause.errors : [failure.cause];
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      expect(reason).toBeInstanceOf(Error);
      expect(reason.message).toContain("ECONNREFUSED");
      expect(failure.message).toContain(reason.message);
    }
  });

  test("refuses to dial a cluster host built on the local default serve domain", async () => {
    const { app } = track(await createTempApp("demo"));
    delete process.env.AKAN_PUBLIC_SERVE_DOMAIN;
    const connect = spyOn(Client.prototype, "connect");
    try {
      await expect(createTunnel("redis", { app, environment: "debug" })).rejects.toThrow(
        'The redis tunnel for the "debug" environment needs AKAN_PUBLIC_SERVE_DOMAIN (would be "localhost") set',
      );
      expect(connect).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
    }
  });
});
