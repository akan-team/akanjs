import { afterEach, describe, expect, test } from "bun:test";
import { generateKeyPairSync, verify } from "node:crypto";
import { createServer, type Http2Server, type IncomingHttpHeaders, type ServerHttp2Stream } from "node:http2";

import { ApnsClient } from "./apnsClient";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const credentials = {
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  bundleId: "com.example.app",
};
const message = { title: "New reply", body: "Mina answered", url: "/en/chat/1", tag: "chat-1", badge: 3 };

interface Received {
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

const servers: Http2Server[] = [];

//? An APNs stand-in over cleartext HTTP/2: `answer` picks each response from the device token in the path.
const apnsStandIn = async (answer: (token: string) => { status: number; reason?: string }) => {
  const received: Received[] = [];
  const server = createServer();
  server.on("stream", (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) => {
    let text = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      text += chunk;
    });
    stream.on("end", () => {
      received.push({ headers, body: JSON.parse(text) as Record<string, unknown> });
      const { status, reason } = answer(String(headers[":path"]).split("/").at(-1) ?? "");
      stream.respond({ ":status": status });
      stream.end(reason ? JSON.stringify({ reason }) : "");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  servers.push(server);
  return { url: `http://localhost:${(server.address() as { port: number }).port}`, received };
};

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe("ApnsClient", () => {
  test("signs an ES256 provider token Apple can verify with the key's public half, and reuses it", () => {
    const client = new ApnsClient(credentials);
    const token = client.providerToken(1_000_000);
    const [header = "", claims = "", signature = ""] = token.split(".");

    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1000 });
    const signed = Buffer.from(`${header}.${claims}`);
    const raw = Buffer.from(signature, "base64url");
    expect(verify("sha256", signed, { key: publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(true);
    expect(client.providerToken(1_000_000 + 49 * 60 * 1000)).toBe(token);
    expect(client.providerToken(1_000_000 + 51 * 60 * 1000)).not.toBe(token);
  });

  test("puts the deep link beside aps, where the app reads a push's data", () => {
    expect(ApnsClient.payloadOf(message)).toEqual({
      aps: {
        alert: { title: "New reply", body: "Mina answered" },
        sound: "default",
        "mutable-content": 1,
        badge: 3,
        "thread-id": "chat-1",
      },
      url: "/en/chat/1",
    });
  });

  test("sends an alert with the topic, the bearer token and the collapse id", async () => {
    const production = await apnsStandIn(() => ({ status: 200 }));
    const client = new ApnsClient(credentials, { hosts: { production: production.url, sandbox: production.url } });

    expect(await client.send("a1b2", message)).toEqual({ ok: true });
    const [{ headers, body }] = production.received as [Received];
    expect(headers[":path"]).toBe("/3/device/a1b2");
    expect(headers["apns-topic"]).toBe("com.example.app");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers["apns-collapse-id"]).toBe("chat-1");
    expect(headers.authorization).toBe(`bearer ${client.providerToken()}`);
    expect(body.url).toBe("/en/chat/1");
    client.close();
  });

  test("tries the sandbox for a token production calls bad, which is what a development build registers", async () => {
    const production = await apnsStandIn(() => ({ status: 400, reason: "BadDeviceToken" }));
    const sandbox = await apnsStandIn(() => ({ status: 200 }));
    const client = new ApnsClient(credentials, { hosts: { production: production.url, sandbox: sandbox.url } });

    expect(await client.send("dev-token", message)).toEqual({ ok: true });
    expect([production.received.length, sandbox.received.length]).toEqual([1, 1]);
    client.close();
  });

  test("stays on the environment it is told to, and reports a token that is gone", async () => {
    const production = await apnsStandIn(() => ({ status: 410, reason: "Unregistered" }));
    const sandbox = await apnsStandIn(() => ({ status: 200 }));
    const client = new ApnsClient(
      { ...credentials, environment: "production" },
      { hosts: { production: production.url, sandbox: sandbox.url } },
    );

    const result = await client.send("uninstalled", message);
    expect(result).toEqual({ ok: false, status: 410, reason: "Unregistered" });
    expect(sandbox.received).toHaveLength(0);
    expect(ApnsClient.isGone({ status: 410, reason: "Unregistered" })).toBe(true);
    expect(ApnsClient.isGone({ status: 400, reason: "BadDeviceToken" })).toBe(true);
    expect(ApnsClient.isGone({ status: 403, reason: "InvalidProviderToken" })).toBe(false);
    client.close();
  });
});
