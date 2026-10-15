import { afterEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import { FileManager } from "./fileManager";
import { UntrustedFetch } from "./untrustedFetch";

interface Sent {
  url: string;
  headers: Headers;
  redirect?: RequestRedirect;
  serverName?: string;
}

const restores: (() => void)[] = [];

afterEach(() => {
  for (const restore of restores.splice(0)) restore();
});

//? Fake DNS: unknown names do not resolve, which also keeps the tests off the network.
const dnsOf = (records: { [hostname: string]: string[] }) => {
  const spy = spyOn(Bun.dns, "lookup").mockImplementation((async (hostname: string) => {
    const addresses = records[hostname];
    if (!addresses) throw new Error(`ENOTFOUND ${hostname}`);
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4, ttl: 60 }));
  }) as typeof Bun.dns.lookup);
  restores.push(() => spy.mockRestore());
};

const serverOf = (answer: (sent: Sent, init: RequestInit) => Response | Promise<Response>) => {
  const sent: Sent[] = [];
  const spy: Mock<typeof fetch> = spyOn(globalThis, "fetch").mockImplementation((async (
    input: string | URL | Request,
    init: RequestInit & { tls?: { serverName?: string } } = {},
  ) => {
    const each = {
      url: String(input),
      headers: new Headers(init.headers),
      redirect: init.redirect,
      serverName: init.tls?.serverName,
    };
    sent.push(each);
    return await answer(each, init);
  }) as typeof fetch);
  restores.push(() => spy.mockRestore());
  return sent;
};

const redirectTo = (location: string) => new Response(null, { status: 302, headers: { location } });

const textOf = async (url: string, options?: Parameters<typeof UntrustedFetch.fetch>[1]) =>
  await new Response((await UntrustedFetch.fetch(url, options)).body).text();

describe("UntrustedFetch.isPublicAddress", () => {
  test.each([
    "8.8.8.8",
    "93.184.216.34",
    "172.15.255.255",
    "172.32.0.0",
    "100.63.255.255",
    "100.128.0.0",
    "198.20.0.0",
    "223.255.255.255",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
  ])("allows the public address %s", (address) => {
    expect(UntrustedFetch.isPublicAddress(address)).toBe(true);
  });

  test.each([
    "0.0.0.0",
    "127.0.0.1",
    "127.255.255.255",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.100.100.200",
    "192.0.0.192",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "fe80::1%eth0",
    "fec0::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "64:ff9b::a9fe:a9fe",
    "2001:db8::1",
    "2001::1",
    "2002:7f00:1::1",
  ])("refuses the non-public address %s", (address) => {
    expect(UntrustedFetch.isPublicAddress(address)).toBe(false);
  });

  test.each(["", "localhost", "1.2.3", "1.2.3.4.5", "256.1.1.1", "01.2.3.4", "1::2::3", "12345::1", "gggg::1"])(
    "refuses %p, which is not an address it can classify",
    (address) => {
      expect(UntrustedFetch.isPublicAddress(address)).toBe(false);
    },
  );
});

describe("UntrustedFetch.parseUrl", () => {
  test.each(["file:///etc/hosts", "data:text/plain,hi", "ftp://example.com/a", "gopher://example.com", "no url"])(
    "refuses %s",
    (url) => {
      expect(() => UntrustedFetch.parseUrl(url)).toThrow("util.error.untrustedUrlRejected");
    },
  );

  test("accepts http and https", () => {
    expect(UntrustedFetch.parseUrl("https://example.com/a?b=1").href).toBe("https://example.com/a?b=1");
    expect(UntrustedFetch.parseUrl("http://example.com").protocol).toBe("http:");
  });
});

describe("UntrustedFetch.fetch", () => {
  test("refuses a host that resolves to a private address before sending anything", async () => {
    dnsOf({ "internal.example": ["10.0.0.5"] });
    const sent = serverOf(() => new Response("secret"));
    await expect(UntrustedFetch.fetch("https://internal.example/x")).rejects.toThrow("util.error.untrustedUrlRejected");
    expect(sent).toEqual([]);
  });

  test("refuses a host when any one of its records is private", async () => {
    dnsOf({ "split.example": ["93.184.216.34", "127.0.0.1"] });
    serverOf(() => new Response("secret"));
    await expect(UntrustedFetch.fetch("https://split.example/x")).rejects.toThrow("util.error.untrustedUrlRejected");
  });

  test("refuses an address literal for a metadata endpoint", async () => {
    const sent = serverOf(() => new Response("secret"));
    await expect(UntrustedFetch.fetch("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      "util.error.untrustedUrlRejected",
    );
    await expect(UntrustedFetch.fetch("http://[::ffff:127.0.0.1]:8080/")).rejects.toThrow(
      "util.error.untrustedUrlRejected",
    );
    expect(sent).toEqual([]);
  });

  test("connects to the checked address and keeps the host name for Host and TLS", async () => {
    dnsOf({ "files.example": ["2606:4700::1", "93.184.216.34"] });
    const sent = serverOf(() => new Response("ok"));
    expect(await textOf("https://files.example:8443/a.png?v=2")).toBe("ok");
    expect(sent[0]?.url).toBe("https://93.184.216.34:8443/a.png?v=2");
    expect(sent[0]?.headers.get("host")).toBe("files.example:8443");
    expect(sent[0]?.serverName).toBe("files.example");
  });

  test("checks every redirect hop and refuses one that points into the private network", async () => {
    dnsOf({ "files.example": ["93.184.216.34"], "internal.example": ["192.168.0.10"] });
    const sent = serverOf(({ url }) =>
      url.includes("/first") ? redirectTo("http://internal.example/admin") : new Response("secret"),
    );
    await expect(UntrustedFetch.fetch("https://files.example/first")).rejects.toThrow(
      "util.error.untrustedUrlRejected",
    );
    expect(sent).toHaveLength(1);
  });

  test("refuses a redirect to the metadata endpoint", async () => {
    dnsOf({ "files.example": ["93.184.216.34"] });
    const sent = serverOf(() => redirectTo("http://169.254.169.254/latest/meta-data"));
    await expect(UntrustedFetch.fetch("https://files.example/a")).rejects.toThrow("util.error.untrustedUrlRejected");
    expect(sent).toHaveLength(1);
  });

  test("follows a redirect to another public host and drops credentials when the origin changes", async () => {
    dnsOf({ "api.example": ["93.184.216.34"], "cdn.example": ["93.184.216.35"] });
    const sent = serverOf(({ url }) =>
      url.includes("93.184.216.34") ? redirectTo("https://cdn.example/signed?sig=1") : new Response("video"),
    );
    const text = await textOf("https://api.example/files/1", {
      headers: { authorization: "Bearer t", cookie: "s=1", "x-goog-api-key": "k" },
    });
    expect(text).toBe("video");
    expect(sent.map(({ redirect }) => redirect)).toEqual(["manual", "manual"]);
    expect(sent[0]?.headers.get("authorization")).toBe("Bearer t");
    expect(sent[1]?.url).toBe("https://93.184.216.35/signed?sig=1");
    expect(sent[1]?.headers.get("host")).toBe("cdn.example");
    expect(sent[1]?.headers.get("authorization")).toBe(null);
    expect(sent[1]?.headers.get("cookie")).toBe(null);
    expect(sent[1]?.headers.get("x-goog-api-key")).toBe("k");
  });

  test("stops after the redirect limit", async () => {
    dnsOf({ "loop.example": ["93.184.216.34"] });
    const sent = serverOf(() => redirectTo("https://loop.example/again"));
    await expect(UntrustedFetch.fetch("https://loop.example/start", { maxRedirects: 2 })).rejects.toThrow(
      "util.error.untrustedUrlRejected",
    );
    expect(sent).toHaveLength(3);
  });

  test("refuses a declared body above maxBytes and cuts a streamed one at maxBytes", async () => {
    dnsOf({ "files.example": ["93.184.216.34"] });
    serverOf(({ url }) =>
      url.includes("declared")
        ? new Response("x".repeat(20), { headers: { "content-length": "20" } })
        : new Response(
            new ReadableStream({
              start(controller) {
                for (let idx = 0; idx < 20; idx += 1) controller.enqueue(new Uint8Array(8));
                controller.close();
              },
            }),
          ),
    );
    await expect(UntrustedFetch.fetch("https://files.example/declared", { maxBytes: 10 })).rejects.toThrow(
      "util.error.responseTooLarge",
    );
    await expect(textOf("https://files.example/streamed", { maxBytes: 100 })).rejects.toThrow(
      "util.error.responseTooLarge",
    );
  });

  test("fails on an error status", async () => {
    dnsOf({ "files.example": ["93.184.216.34"] });
    serverOf(() => new Response("missing", { status: 404 }));
    await expect(UntrustedFetch.fetch("https://files.example/gone")).rejects.toThrow("util.error.untrustedFetchFailed");
  });

  test("gives up when the response headers do not arrive in time", async () => {
    dnsOf({ "slow.example": ["93.184.216.34"] });
    serverOf(
      (_sent, { signal }) =>
        new Promise<Response>((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
          setTimeout(() => reject(new Error("the request was never aborted")), 1_000);
        }),
    );
    await expect(UntrustedFetch.fetch("https://slow.example/a", { timeout: 20 })).rejects.toThrow(
      "util.error.untrustedFetchTimedOut",
    );
  });

  test("parses a JSON document", async () => {
    dnsOf({ "meta.example": ["93.184.216.34"] });
    serverOf(() => Response.json({ name: "Token #1", image: "ipfs://cid" }));
    expect(await UntrustedFetch.json<{ name: string; image: string }>("https://meta.example/1.json")).toEqual({
      name: "Token #1",
      image: "ipfs://cid",
    });
  });
});

describe("FileManager.readUrlAsStream", () => {
  test("no longer reads local files or loopback services through a URL", async () => {
    const sent = serverOf(() => new Response("secret"));
    await expect(FileManager.readUrlAsStream("file:///etc/hosts")).rejects.toThrow("util.error.untrustedUrlRejected");
    await expect(FileManager.readUrlAsStream("http://127.0.0.1:8080/")).rejects.toThrow(
      "util.error.untrustedUrlRejected",
    );
    expect(sent).toEqual([]);
  });

  test("refuses a redirect when the caller asked for none", async () => {
    dnsOf({ "files.example": ["93.184.216.34"] });
    serverOf(() => redirectTo("https://files.example/elsewhere"));
    await expect(FileManager.readUrlAsStream("https://files.example/a", { redirect: "error" })).rejects.toThrow(
      "util.error.untrustedUrlRejected",
    );
  });
});
