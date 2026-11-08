import { describe, expect, test } from "bun:test";
import { OAuthClientIdMetadata } from "./OAuthClientIdMetadata";

const clientId = "https://client.example.com/oauth/client.json";
const document = {
  client_id: clientId,
  client_name: "Example MCP Client",
  redirect_uris: ["http://localhost:3000/callback", "https://client.example.com/callback"],
  grant_types: ["authorization_code", "refresh_token"],
  token_endpoint_auth_method: "none",
};

const fetching =
  (body: unknown, init: ResponseInit = {}) =>
  async (input: string | URL | Request, options?: RequestInit) => {
    fetching.last = { url: String(input), options };
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      ...init,
    });
  };
fetching.last = null as { url: string; options?: RequestInit } | null;
const resolvingTo =
  (...addresses: string[]) =>
  async () =>
    addresses.map((address) => ({ address }));
// Every fetch below names a host that does not exist, so the resolver is stubbed to a public address.
const resolve = resolvingTo("93.184.216.34");

describe("OAuthClientIdMetadata", () => {
  test("recognises a client_id that is a document URL", () => {
    expect(OAuthClientIdMetadata.isDocumentUrl(clientId)).toBe(true);
    expect(OAuthClientIdMetadata.isDocumentUrl("https://client.example.com")).toBe(false);
    expect(OAuthClientIdMetadata.isDocumentUrl("http://client.example.com/client.json")).toBe(false);
    expect(OAuthClientIdMetadata.isDocumentUrl("https://user:pw@client.example.com/client.json")).toBe(false);
    expect(OAuthClientIdMetadata.isDocumentUrl("dcr_abc")).toBe(false);
  });

  test("never fetches the server's own network on a client's say-so", () => {
    const fetchable = (url: string) => OAuthClientIdMetadata.isFetchable(new URL(url));
    expect(fetchable("https://client.example.com/c.json")).toBe(true);
    expect(fetchable("https://10.0.0.5/c.json")).toBe(false);
    expect(fetchable("https://[::1]/c.json")).toBe(false);
    expect(fetchable("https://intranet/c.json")).toBe(false);
    expect(fetchable("https://db.internal/c.json")).toBe(false);
    expect(fetchable("https://printer.local/c.json")).toBe(false);
    expect(fetchable("https://client.example.com:8443/c.json")).toBe(false);
  });

  test("reads a valid document, follows no redirects, and honours its cache lifetime within bounds", async () => {
    const fetchImpl = fetching(document, { headers: { "cache-control": "max-age=120" } });
    const result = await OAuthClientIdMetadata.fetch(clientId, { fetchImpl, resolve });
    if (!result) throw new Error("expected a client");
    expect(result.client.clientName).toBe("Example MCP Client");
    expect(result.client.source).toBe("metadataDocument");
    expect(result.client.redirectUris).toEqual(document.redirect_uris);
    expect(result.ttlMs).toBe(120_000);
    expect(fetching.last?.options?.redirect).toBe("error");
    const uncapped = await OAuthClientIdMetadata.fetch(clientId, {
      fetchImpl: fetching(document, { headers: { "cache-control": "max-age=999999" } }),
      resolve,
    });
    expect(uncapped?.ttlMs).toBe(OAuthClientIdMetadata.maxTtlMs);
    const absent = await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: fetching(document), resolve });
    expect(absent?.ttlMs).toBe(OAuthClientIdMetadata.defaultTtlMs);
  });

  test("refuses a document that does not vouch for the id it was fetched under", async () => {
    const mismatch = { ...document, client_id: "https://other.example.com/c.json" };
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: fetching(mismatch), resolve })).toBeNull();
    const confidential = { ...document, token_endpoint_auth_method: "private_key_jwt" };
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: fetching(confidential), resolve })).toBeNull();
    const nameless = { ...document, client_name: "" };
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: fetching(nameless), resolve })).toBeNull();
    const badRedirect = { ...document, redirect_uris: ["http://client.example.com/callback"] };
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: fetching(badRedirect), resolve })).toBeNull();
  });

  test("refuses a public name parked on a private address, and skips the lookup only when told to", async () => {
    const fetchImpl = fetching(document);
    for (const address of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "0.0.0.0"])
      expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl, resolve: resolvingTo(address) })).toBeNull();
    // One private address among public ones is enough: the fetch would pick whichever the stack prefers.
    const mixed = resolvingTo("93.184.216.34", "10.0.0.5");
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl, resolve: mixed })).toBeNull();
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl, resolve: resolvingTo() })).toBeNull();
    const failing = async () => {
      throw new Error("ENOTFOUND");
    };
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl, resolve: failing })).toBeNull();
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl, resolve: false })).not.toBeNull();
    expect(await OAuthClientIdMetadata.resolvesPublicly("x", resolvingTo("2606:4700::6810:84e5"))).toBe(true);
  });

  test("refuses what is not a small JSON document", async () => {
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: fetching("not json"), resolve })).toBeNull();
    expect(
      await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: fetching(document, { status: 404 }), resolve }),
    ).toBeNull();
    const huge = fetching(document, { headers: { "content-length": String(OAuthClientIdMetadata.maxBytes + 1) } });
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: huge, resolve })).toBeNull();
    const throwing = async () => {
      throw new Error("network");
    };
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: throwing, resolve })).toBeNull();
  });

  test("stops reading a body that states no length once it passes the cap", async () => {
    let pulled = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        pulled += 1;
        controller.enqueue(new Uint8Array(16 * 1024).fill(0x20));
      },
      cancel: () => {
        cancelled = true;
      },
    });
    const chunked = async () => new Response(endless, { headers: { "content-type": "application/json" } });
    expect(await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: chunked, resolve })).toBeNull();
    expect(cancelled).toBe(true);
    expect(pulled * 16 * 1024).toBeLessThanOrEqual(OAuthClientIdMetadata.maxBytes + 2 * 16 * 1024);
  });

  test("grants a document only the grants the token endpoint serves", async () => {
    const asking = { ...document, grant_types: ["refresh_token", "client_credentials", "urn:custom", "refresh_token"] };
    const result = await OAuthClientIdMetadata.fetch(clientId, { fetchImpl: fetching(asking), resolve });
    expect(result?.client.grantTypes).toEqual(["refresh_token"]);
    const silent = { ...document, grant_types: undefined };
    expect(OAuthClientIdMetadata.validate(clientId, silent)?.grantTypes).toEqual(["authorization_code"]);
    expect(OAuthClientIdMetadata.validate(clientId, document)?.grantTypes).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
  });
});
