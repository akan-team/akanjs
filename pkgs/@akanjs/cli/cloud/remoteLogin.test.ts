import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { type AccessToken, CloudHttpError, GlobalConfig, type HostConfig } from "@akanjs/devkit/cloud";
import { Logger, RemoteAuthCode } from "akanjs/common";
import * as QRcode from "qrcode";
import { RemoteLogin } from "./remoteLogin";

const host = "https://cloud.test";
const remoteId = "0f6a1d2e-8c43-4b7a-9e11-5d2c3b4a6f70";
const loginId = await RemoteAuthCode.loginIdOf(remoteId);
const accessToken: AccessToken = { jwt: "jwt-remote", refreshToken: "refresh-remote", expiresAt: null };
const self = { id: "u1", nickname: "akan" };

type Answer<T> = T | Error;

class StubCloud {
  readonly host = host;
  readonly polls: string[] = [];
  selfReads = 0;
  deviceAnswers: Answer<AccessToken | null>[] = [];
  loginIdAnswers: Answer<AccessToken | null>[] = [];
  selfAnswers: Answer<typeof self | null>[] = [];

  async getRemoteAuthToken(id: string) {
    this.polls.push(id);
    const answers = id === remoteId ? this.deviceAnswers : id === loginId ? this.loginIdAnswers : [];
    return StubCloud.#settle(answers.shift() ?? null);
  }

  async getRemoteSelf() {
    this.selfReads++;
    return StubCloud.#settle(this.selfAnswers.shift() ?? null);
  }

  static #settle<T>(answer: Answer<T>) {
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

const refusal = (status: number, body: string, headers?: HeadersInit) =>
  new CloudHttpError(status, "", `/getRemoteAuthToken/${remoteId}`, body, new Headers(headers));

let cloud: StubCloud;
let logs: string[];
let saved: HostConfig[];
let opened: string[];
let waits: number[];
let clock: number;

const login = (options: { selfAttempts?: number } = {}) =>
  new RemoteLogin(cloud, {
    ...options,
    open: async (url) => {
      opened.push(url);
    },
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    now: () => clock,
  });

beforeEach(() => {
  cloud = new StubCloud();
  logs = [];
  saved = [];
  opened = [];
  waits = [];
  clock = 0;
  spyOn(Logger, "rawLog").mockImplementation((msg = "") => {
    logs.push(stripVTControlCharacters(msg));
  });
  spyOn(GlobalConfig, "setHostConfig").mockImplementation(async (config) => {
    saved.push(structuredClone(config ?? { host: "" }));
  });
});

afterEach(() => {
  mock.restore();
});

const unreachable = () => new TypeError("Unable to connect");

describe("RemoteLogin", () => {
  test("prints the code, while the URL and its QR code carry only the login id, from which the code does not follow", async () => {
    cloud.deviceAnswers = [accessToken];
    cloud.selfAnswers = [self];
    const code = await RemoteAuthCode.of(remoteId);
    const signinUrl = `${host}/remoteAuth?remoteId=${loginId}`;

    await login().signIn(remoteId);

    expect(opened).toEqual([signinUrl]);
    expect(logs).toContain(`${signinUrl}\n`);
    expect(logs).toContain(
      stripVTControlCharacters(await QRcode.toString(signinUrl, { type: "terminal", small: true })),
    );
    expect(logs).toContain(`\nYour code:  ${code} `);
    expect(logs.join("\n")).toContain("Never enter a code that did not come from your own terminal");
    expect(logs.join("\n")).not.toContain(remoteId);
    expect(signinUrl).not.toContain(RemoteAuthCode.normalize(code));
    expect(await RemoteAuthCode.matches(remoteId, await RemoteAuthCode.of(loginId))).toBe(false);
  });

  test("signs in on a cloud that answers the poll by the device code, the login id's poll staying pending", async () => {
    cloud.deviceAnswers = [null, null, accessToken];
    cloud.selfAnswers = [self];

    expect(await login().signIn(remoteId)).toEqual(self);
    expect(cloud.polls).toEqual([remoteId, loginId, remoteId, loginId, remoteId, loginId]);
    expect(waits).toEqual([2_000, 2_000]);
    expect(saved).toEqual([
      { host, auth: { accessToken } },
      { host, auth: { accessToken, self } },
    ]);
    expect(logs.join("\n")).not.toContain("retrying");
  });

  test("signs in on a cloud that keeps the session under the URL's id, saving it before the account read fails once", async () => {
    cloud.loginIdAnswers = [null, null, null, accessToken];
    cloud.selfAnswers = [unreachable(), self];

    expect(await login().signIn(remoteId)).toEqual(self);
    expect(cloud.polls).toHaveLength(8);
    expect(cloud.polls.at(-1)).toBe(loginId);
    expect(cloud.selfReads).toBe(2);
    expect(saved).toEqual([
      { host, auth: { accessToken } },
      { host, auth: { accessToken, self } },
    ]);
  });

  test("stops polling by the login id once the cloud refuses it, and keeps polling by the device code", async () => {
    cloud.loginIdAnswers = [refusal(400, JSON.stringify({ error: "cloud.error.notDeviceCode" }))];
    cloud.deviceAnswers = [null, null, accessToken];
    cloud.selfAnswers = [self];

    expect(await login().signIn(remoteId)).toEqual(self);
    expect(cloud.polls).toEqual([remoteId, loginId, remoteId, remoteId]);
    expect(waits).toEqual([2_000, 2_000]);
    expect(logs.join("\n")).not.toContain("retrying");
  });

  test("stays signed in when reading the account fails once after the token is taken, and never polls again", async () => {
    cloud.deviceAnswers = [accessToken];
    cloud.selfAnswers = [unreachable(), self];

    expect(await login().signIn(remoteId)).toEqual(self);
    expect(cloud.polls).toHaveLength(2);
    expect(cloud.selfReads).toBe(2);
    expect(saved).toEqual([
      { host, auth: { accessToken } },
      { host, auth: { accessToken, self } },
    ]);
  });

  test("keeps the saved session when the account never reads, after a bounded number of tries", async () => {
    cloud.deviceAnswers = [accessToken];
    cloud.selfAnswers = Array.from({ length: 10 }, () => refusal(503, "unavailable"));

    expect(await login({ selfAttempts: 3 }).signIn(remoteId)).toBeNull();
    expect(cloud.selfReads).toBe(3);
    expect(cloud.polls).toHaveLength(2);
    expect(saved).toEqual([{ host, auth: { accessToken } }]);
    expect(logs.join("\n")).toContain("Could not read the signed-in account (HTTP 503)");
  });

  test("drops the session and fails when the server answers the account read with nothing", async () => {
    cloud.deviceAnswers = [accessToken];
    cloud.selfAnswers = [null, self];

    await expect(login().signIn(remoteId)).rejects.toThrow("did not take the session it handed out");
    expect(cloud.selfReads).toBe(1);
    expect(saved).toEqual([{ host, auth: { accessToken } }, { host }]);
  });

  test("warns once about a network error or a 5xx, backs off, and keeps polling instead of reading it as pending", async () => {
    cloud.deviceAnswers = [unreachable(), refusal(502, "bad gateway"), null, accessToken];
    cloud.loginIdAnswers = [unreachable(), refusal(502, "bad gateway")];
    cloud.selfAnswers = [self];

    expect(await login().signIn(remoteId)).toEqual(self);
    expect(cloud.polls).toHaveLength(8);
    expect(logs.filter((line) => line.includes("retrying"))).toEqual([
      "Could not check the sign-in (Unable to connect); retrying...",
    ]);
    const [afterNetwork = 0, afterGateway = 0, afterPending] = waits;
    expect(afterNetwork).toBeGreaterThanOrEqual(2_000);
    expect(afterGateway).toBeGreaterThanOrEqual(4_000);
    expect(afterPending).toBe(2_000);
  });

  test("backs off only when neither poll is answered", async () => {
    cloud.deviceAnswers = [unreachable(), null, accessToken];
    cloud.loginIdAnswers = [null, unreachable()];
    cloud.selfAnswers = [self];

    expect(await login().signIn(remoteId)).toEqual(self);
    expect(waits).toEqual([2_000, 2_000]);
    expect(logs.join("\n")).not.toContain("retrying");
  });

  test("waits as long as a 429 asks before polling again", async () => {
    cloud.deviceAnswers = [refusal(429, "{}", { "retry-after": "45" }), accessToken];
    cloud.selfAnswers = [self];

    await login().signIn(remoteId);
    expect(waits).toEqual([45_000]);
  });

  test("stops at a refusal of the device code's poll with the server's reason, without waiting out the deadline", async () => {
    cloud.deviceAnswers = [refusal(410, JSON.stringify({ error: "cloud.error.remoteAuthExpired" }))];

    await expect(login().signIn(remoteId)).rejects.toThrow("refused this sign-in (cloud.error.remoteAuthExpired)");
    expect(cloud.polls).toEqual([remoteId, loginId]);
    expect(waits).toEqual([]);
    expect(saved).toEqual([]);
  });

  test("stops at a host that has no sign-in route", async () => {
    cloud.deviceAnswers = [refusal(404, "<html>Not Found</html>")];
    cloud.loginIdAnswers = [refusal(404, "<html>Not Found</html>")];

    await expect(login().signIn(remoteId)).rejects.toThrow("does not serve Akan CLI sign-ins (HTTP 404)");
    expect(cloud.polls).toHaveLength(2);
  });

  test("gives up after ten minutes of pending answers and saves nothing", async () => {
    await expect(login().signIn(remoteId)).rejects.toThrow("timed out after 10 minutes");
    expect(cloud.polls).toHaveLength(600);
    expect(clock).toBe(10 * 60_000);
    expect(saved).toEqual([]);
  });
});
