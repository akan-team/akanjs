import { afterEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { GithubApp } from "./githubApp";

interface Call {
  url: URL;
  method: string;
  authorization: string | null;
  body: unknown;
}

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const githubAppOf = () =>
  Object.assign(new GithubApp(), {
    options: {
      id: "123",
      name: "akan",
      clientId: "client-id",
      clientSecret: "client-secret",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      webhookSecret: "hook-secret",
    },
  });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchSpy: Mock<typeof fetch> | null = null;

//? Stands in for api.github.com: `answer` picks each response from the request, `calls` records what was sent.
const githubStandIn = (answer: (call: Call) => Response) => {
  const calls: Call[] = [];
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const call = {
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return answer(call);
  }) as typeof fetch);
  return calls;
};

const reasonOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return String((error as { data?: { reason?: unknown } }).data?.reason);
  }
  return null;
};

afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = null;
});

describe("GithubApp", () => {
  test("rejects a code exchange GitHub answered with 200 and an error body", async () => {
    githubStandIn(() =>
      json(200, { error: "bad_verification_code", error_description: "The code passed is incorrect or expired." }),
    );
    await expect(githubAppOf().getAccessToken("stale")).rejects.toThrow("util.error.githubAccessTokenExchangeFailed");
  });

  test("gives a token issued without expires_in a valid expiry", async () => {
    githubStandIn(() => json(200, { access_token: "gho_1", token_type: "bearer", scope: "" }));
    const token = await githubAppOf().getAccessToken("fresh");
    expect(token.accessToken).toBe("gho_1");
    expect(token.expiresAt.isValid()).toBe(true);
    expect(token.expiresAt.valueOf()).toBeGreaterThan(Date.now());
  });

  test("throws on an HTTP error instead of parsing the error body as data", async () => {
    githubStandIn(() => json(401, { message: "Bad credentials" }));
    const app = githubAppOf();
    await expect(app.getGithubInfo("revoked")).rejects.toThrow("util.error.githubApiFailed");
    expect(await reasonOf(app.getGithubInfo("revoked"))).toBe("GET /user -> 401 - Bad credentials");
  });

  test("sends the token as a bearer header", async () => {
    const calls = githubStandIn(() => json(200, { id: 7 }));
    await githubAppOf().getRepository({ owner: "o", repo: "r", accessToken: "tok" });
    expect(calls[0]?.authorization).toBe("Bearer tok");
  });

  test("answers null for a repository GitHub does not know, and keeps other failures as errors", async () => {
    githubStandIn(({ url }) =>
      url.pathname === "/repos/o/missing" ? json(404, { message: "Not Found" }) : json(500, {}),
    );
    const app = githubAppOf();
    expect(await app.getRepository({ owner: "o", repo: "missing", accessToken: "tok" })).toBe(null);
    await expect(app.getRepository({ owner: "o", repo: "broken", accessToken: "tok" })).rejects.toThrow(
      "util.error.githubApiFailed",
    );
  });

  test("reads every page of a listing", async () => {
    const calls = githubStandIn(({ url }) => {
      const page = Number(url.searchParams.get("page"));
      const size = page === 1 ? 100 : 2;
      return json(
        200,
        Array.from({ length: size }, (_, idx) => ({ id: page * 1000 + idx, name: `r${idx}`, full_name: `o/r${idx}` })),
      );
    });
    const repositories = await githubAppOf().listAllUserRepositories("tok");
    expect(repositories).toHaveLength(102);
    expect(calls.map(({ url }) => url.searchParams.get("page"))).toEqual(["1", "2"]);
    expect(calls.every(({ url }) => url.searchParams.get("per_page") === "100")).toBe(true);
  });

  test("names the operation that failed", async () => {
    githubStandIn(() => json(403, { message: "Must have admin rights to Repository." }));
    await expect(githubAppOf().listOrganizationRepositories({ org: "o", accessToken: "tok" })).rejects.toThrow(
      "util.error.githubOrganizationRepositoriesListFailed",
    );
  });

  test("explains a repository creation the App has no permission for", async () => {
    githubStandIn(({ method }) =>
      method === "POST"
        ? json(403, { message: "Resource not accessible by integration" })
        : json(404, { message: "Not Found" }),
    );
    await expect(githubAppOf().createRepository("tok", "r", "o")).rejects.toThrow(
      "util.error.githubRepositoryCreateForbidden",
    );
  });

  test("returns a repository a concurrent import created between the lookup and the POST", async () => {
    let lookupNum = 0;
    githubStandIn(({ method }) => {
      if (method === "POST") return json(422, { message: "Repository creation failed." });
      lookupNum += 1;
      return lookupNum === 1 ? json(404, { message: "Not Found" }) : json(200, { id: 9 });
    });
    expect(await githubAppOf().createRepository("tok", "r", "o")).toEqual({ id: 9 });
  });

  test("reports a missing file as absent rather than failing", async () => {
    githubStandIn(() => json(404, { message: "Not Found" }));
    const app = githubAppOf();
    const file = { owner: "o", repo: "r", accessToken: "tok", path: "apps/a/akan.config.ts", ref: "main" };
    expect(await app.hasRepositoryFile(file)).toBe(false);
    expect(await app.getRepositoryFileText(file)).toBe(null);
  });

  test("decodes a repository file", async () => {
    const calls = githubStandIn(() =>
      json(200, { name: "a.ts", type: "file", encoding: "base64", content: Buffer.from("hello").toString("base64") }),
    );
    const text = await githubAppOf().getRepositoryFileText({
      owner: "o",
      repo: "r",
      accessToken: "tok",
      path: "a.ts",
      ref: "feature/x",
    });
    expect(text).toBe("hello");
    expect(calls[0]?.url.searchParams.get("ref")).toBe("feature/x");
  });

  test("signs the installation lookup with the App's own JWT and answers null when it is not installed", async () => {
    const calls = githubStandIn(() => json(404, { message: "Not Found" }));
    expect(await githubAppOf().getRepositoryInstallation({ owner: "o", repo: "r" })).toBe(null);
    expect(calls[0]?.authorization?.split(".")).toHaveLength(3);
  });

  describe("createInstallationAccessToken", () => {
    const issued = { token: "ghs_1", expires_at: "2099-01-01T00:00:00Z" };
    const cloneScope = { repositories: ["shop"], permissions: { contents: "read" as const } };

    test("asks for one repository with read-only contents when scoped", async () => {
      const calls = githubStandIn(() =>
        json(201, {
          ...issued,
          permissions: { contents: "read", metadata: "read" },
          repository_selection: "selected",
        }),
      );
      const token = await githubAppOf().createInstallationAccessToken("42", cloneScope);
      expect(token.accessToken).toBe("ghs_1");
      expect(calls[0]?.method).toBe("POST");
      expect(calls[0]?.url.pathname).toBe("/app/installations/42/access_tokens");
      expect(calls[0]?.authorization?.split(".")).toHaveLength(3);
      expect(calls[0]?.body).toEqual({ repositories: ["shop"], permissions: { contents: "read" } });
    });

    test("sends no body when no scope is asked for", async () => {
      const calls = githubStandIn(() => json(201, issued));
      await githubAppOf().createInstallationAccessToken("42");
      expect(calls[0]?.body).toBeUndefined();
    });

    test("names only the repository for a repository-scoped token with the installation's permissions", async () => {
      const calls = githubStandIn(() => json(201, { ...issued, repository_selection: "selected" }));
      await githubAppOf().createInstallationAccessToken("42", { repositories: ["shop"] });
      expect(calls[0]?.body).toEqual({ repositories: ["shop"] });
    });

    test("refuses a token wider than the scope it asked for", async () => {
      const answers = [
        json(201, {
          ...issued,
          permissions: { contents: "write", metadata: "read" },
          repository_selection: "selected",
        }),
        json(201, { ...issued, permissions: { contents: "read", issues: "read" }, repository_selection: "selected" }),
        json(201, { ...issued, permissions: { contents: "read" }, repository_selection: "all" }),
        json(201, { ...issued, repository_selection: "selected" }),
      ];
      githubStandIn(() => answers.shift() ?? json(500, {}));
      const app = githubAppOf();
      expect(await reasonOf(app.createInstallationAccessToken("42", cloneScope))).toBe(
        "token grants more than requested: contents=write",
      );
      expect(await reasonOf(app.createInstallationAccessToken("42", cloneScope))).toBe(
        "token grants more than requested: issues=read",
      );
      expect(await reasonOf(app.createInstallationAccessToken("42", cloneScope))).toBe(
        "token covers all repositories, not the ones requested",
      );
      expect(await reasonOf(app.createInstallationAccessToken("42", cloneScope))).toBe(
        "token permissions are not reported",
      );
    });

    test("surfaces GitHub refusing a permission the installation was never granted", async () => {
      githubStandIn(() => json(422, { message: "The permissions requested are not granted to this installation." }));
      await expect(githubAppOf().createInstallationAccessToken("42", cloneScope)).rejects.toThrow(
        "util.error.githubInstallationAccessTokenCreateFailed",
      );
    });
  });

  describe("compareFiles", () => {
    const ref = { owner: "o", repo: "r", accessToken: "tok", base: "b".repeat(40), head: "c".repeat(40) };

    test("lists the files a head ahead of its base changed, a rename under both names", async () => {
      const calls = githubStandIn(() =>
        json(200, {
          status: "ahead",
          files: [{ filename: "apps/web/page.tsx" }, { filename: "libs/a/new.ts", previous_filename: "libs/a/old.ts" }],
        }),
      );

      expect(await githubAppOf().compareFiles(ref)).toEqual(["apps/web/page.tsx", "libs/a/new.ts", "libs/a/old.ts"]);
      expect(calls[0]?.url.pathname).toBe(`/repos/o/r/compare/${"b".repeat(40)}...${"c".repeat(40)}`);
      expect(calls[0]?.authorization).toBe("Bearer tok");
    });

    test("answers no files for identical commits and unknown when the list is not the whole difference", async () => {
      const fullPage = Array.from({ length: 300 }, (_, idx) => ({ filename: `f${idx}.ts` }));
      const answers = [
        json(200, { status: "identical", files: [] }),
        json(200, { status: "behind", files: [] }),
        json(200, { status: "diverged", files: [{ filename: "a.ts" }] }),
        json(200, { status: "ahead", files: fullPage }),
        json(404, { message: "Not Found" }),
      ];
      githubStandIn(() => answers.shift() ?? json(500, {}));
      const app = githubAppOf();

      expect(await app.compareFiles(ref)).toEqual([]);
      expect(await app.compareFiles(ref)).toBe(null);
      expect(await app.compareFiles(ref)).toBe(null);
      expect(await app.compareFiles(ref)).toBe(null);
      expect(await app.compareFiles(ref)).toBe(null);
    });
  });
});
