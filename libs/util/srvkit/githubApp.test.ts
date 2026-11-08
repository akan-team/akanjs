import { afterEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { GithubApp } from "./githubApp";
import { PreviewMode } from "./previewMode";

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

  test("names the account a repository's installation is on by its numeric id", async () => {
    githubStandIn(() => json(200, { id: 42, account: { login: "acme", id: 900, type: "Organization" } }));
    expect(await githubAppOf().getRepositoryInstallation({ owner: "acme", repo: "shop" })).toEqual({
      id: "42",
      accountLogin: "acme",
      accountId: "900",
      accountType: "Organization",
      permissions: {},
      suspended: false,
    });
  });

  test("reports the permissions an installation's owner accepted and whether it is suspended", async () => {
    githubStandIn(() =>
      json(200, {
        id: 42,
        account: { login: "acme", id: 900 },
        permissions: { contents: "write", metadata: "read", pull_requests: "write" },
        suspended_at: "2026-10-01T00:00:00Z",
      }),
    );
    const installation = await githubAppOf().getRepositoryInstallation({ owner: "acme", repo: "shop" });
    expect(installation?.permissions).toEqual({ contents: "write", metadata: "read", pull_requests: "write" });
    expect(installation?.suspended).toBe(true);
  });

  test("lists an installation's repositories with the user's own token, which GitHub narrows to that user's", async () => {
    const calls = githubStandIn(() =>
      json(200, { total_count: 1, repositories: [{ id: 1, name: "shop", full_name: "acme/shop" }] }),
    );
    const repositories = await githubAppOf().listUserInstallationRepositories("42", "tok");
    expect(repositories.map(({ fullName }) => fullName)).toEqual(["acme/shop"]);
    expect(calls.map(({ url }) => url.pathname)).toEqual(["/user/installations/42/repositories"]);
    expect(calls[0]?.authorization).toBe("Bearer tok");
  });

  describe("names in an API path", () => {
    test("refuses an owner, repository or installation outside GitHub's grammar before any request", async () => {
      const calls = githubStandIn(() => json(200, {}));
      const app = githubAppOf();
      const refused = [
        () => app.getRepository({ owner: "acme", repo: "..", accessToken: "tok" }),
        () => app.getRepository({ owner: "..", repo: "app", accessToken: "tok" }),
        () => app.getRepositoryInstallation({ owner: "acme", repo: "shop#" }),
        () => app.getRepositoryInstallation({ owner: "acme", repo: "shop?per_page=1" }),
        () => app.getRepositoryInstallation({ owner: "acme", repo: "%2e%2e" }),
        () => app.getRepositoryInstallation({ owner: "x/../../app/installations/7", repo: "shop" }),
        () => app.listRepositoryAppNames({ owner: "acme", repo: "shop/../../bob/tools", accessToken: "tok" }),
        () => app.listWebhooks({ owner: "-acme", repo: "shop", accessToken: "tok" }),
        () => app.listOrganizationRepositories({ org: "acme/../../user", accessToken: "tok" }),
        () => app.listUserInstallationRepositories("42/../7", "tok"),
        () => app.createInstallationAccessToken("7?"),
      ];
      for (const request of refused) await expect(request()).rejects.toThrow("util.error.githubInvalidName");
      expect(calls).toEqual([]);
    });

    test("passes every name GitHub itself allows", async () => {
      const calls = githubStandIn(() => json(404, { message: "Not Found" }));
      const app = githubAppOf();
      await app.getRepository({ owner: "Acme-Co", repo: "my.repo_v2-x", accessToken: "tok" });
      await app.getRepository({ owner: "octo_ent", repo: ".github", accessToken: "tok" });
      expect(calls.map(({ url }) => url.pathname)).toEqual(["/repos/Acme-Co/my.repo_v2-x", "/repos/octo_ent/.github"]);
    });
  });

  describe("getCollaboratorPermission", () => {
    const target = { owner: "acme", repo: "shop", accessToken: "ghs_meta" };

    test("reads one login's permission on the repository with the token it is handed", async () => {
      const calls = githubStandIn(() =>
        json(200, { permission: "write", role_name: "maintain", user: { login: "carol", id: 303 } }),
      );
      expect(await githubAppOf().getCollaboratorPermission({ ...target, username: "carol" })).toEqual({
        permission: "write",
        userId: "303",
      });
      expect(calls.map(({ method, url }) => `${method} ${url.pathname}`)).toEqual([
        "GET /repos/acme/shop/collaborators/carol/permission",
      ]);
      expect(calls[0]?.authorization).toBe("Bearer ghs_meta");
    });

    test("answers null for a login GitHub does not know, and none with no id for an answer naming nobody", async () => {
      const answers = [json(404, { message: "Not Found" }), json(200, { user: null })];
      githubStandIn(() => answers.shift() ?? json(500, {}));
      const app = githubAppOf();
      expect(await app.getCollaboratorPermission({ ...target, username: "ghost" })).toBe(null);
      expect(await app.getCollaboratorPermission({ ...target, username: "carol" })).toEqual({
        permission: "none",
        userId: "",
      });
    });

    test("refuses a login outside GitHub's grammar before any request", async () => {
      const calls = githubStandIn(() => json(200, {}));
      const app = githubAppOf();
      for (const username of ["", "../../app", "carol/permission", "carol?per_page=1", "carol#x", "-carol"])
        await expect(app.getCollaboratorPermission({ ...target, username })).rejects.toThrow(
          "util.error.githubInvalidName",
        );
      expect(calls).toEqual([]);
    });
  });

  describe("getAppBot", () => {
    test("reads the slug with the App's JWT and the bot's id with an installation token, once", async () => {
      const calls = githubStandIn(({ url }) =>
        url.pathname === "/app" ? json(200, { slug: "akan-cloud" }) : json(200, { login: "akan-cloud[bot]", id: 4242 }),
      );
      const app = githubAppOf();
      expect(await app.getAppBot("ghs_1")).toEqual({ login: "akan-cloud[bot]", id: "4242" });
      expect(await app.getAppBot("ghs_2")).toEqual({ login: "akan-cloud[bot]", id: "4242" });
      expect(calls.map(({ url }) => url.pathname)).toEqual(["/app", "/users/akan-cloud%5Bbot%5D"]);
      expect(calls[0]?.authorization?.split(".")).toHaveLength(3);
      expect(calls[1]?.authorization).toBe("Bearer ghs_1");
    });

    test("keeps no failed lookup and follows no slug outside GitHub's grammar", async () => {
      const answers = [
        json(500, {}),
        json(200, { slug: "../../app/installations/7" }),
        json(200, { slug: "akan" }),
        json(200, { login: "akan[bot]", id: 7 }),
      ];
      const calls = githubStandIn(() => answers.shift() ?? json(500, {}));
      const app = githubAppOf();
      await expect(app.getAppBot("ghs_1")).rejects.toThrow("util.error.githubApiFailed");
      await expect(app.getAppBot("ghs_1")).rejects.toThrow("util.error.githubApiFailed");
      expect(await app.getAppBot("ghs_1")).toEqual({ login: "akan[bot]", id: "7" });
      expect(calls.map(({ url }) => url.pathname)).toEqual(["/app", "/app", "/app", "/users/akan%5Bbot%5D"]);
    });
  });

  describe("getInstallation", () => {
    test("reads the installation's account with the App's own JWT", async () => {
      const calls = githubStandIn(() =>
        json(200, { id: 7, account: { login: "acme", type: "Organization" }, target_type: "Organization" }),
      );
      expect(await githubAppOf().getInstallation("7")).toEqual({
        id: "7",
        accountLogin: "acme",
        accountType: "Organization",
      });
      expect(calls[0]?.url.href).toBe("https://api.github.com/app/installations/7");
      expect(calls[0]?.authorization?.split(".")).toHaveLength(3);
    });

    test("answers null for an installation GitHub does not know, and asks nothing for an id that is not one", async () => {
      const calls = githubStandIn(() => json(404, { message: "Not Found" }));
      const app = githubAppOf();
      expect(await app.getInstallation("7")).toBe(null);
      expect(await app.getInstallation("../../user")).toBe(null);
      expect(await app.getInstallation("")).toBe(null);
      expect(calls.map(({ url }) => url.pathname)).toEqual(["/app/installations/7"]);
    });
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

  describe("mergeBaseFiles", () => {
    const ref = { owner: "o", repo: "r", accessToken: "tok", base: "b".repeat(40), head: "c".repeat(40) };

    test("lists what a head that diverged from a moving base changed since their merge base", async () => {
      const calls = githubStandIn(() =>
        json(200, {
          status: "diverged",
          files: [{ filename: "apps/web/page.tsx" }, { filename: "libs/a/new.ts", previous_filename: "libs/a/old.ts" }],
        }),
      );

      expect(await githubAppOf().mergeBaseFiles(ref)).toEqual(["apps/web/page.tsx", "libs/a/new.ts", "libs/a/old.ts"]);
      expect(calls[0]?.url.pathname).toBe(`/repos/o/r/compare/${"b".repeat(40)}...${"c".repeat(40)}`);
    });

    test("answers no files for a head with nothing past its base, and unknown when the list is not whole", async () => {
      const fullPage = Array.from({ length: 300 }, (_, idx) => ({ filename: `f${idx}.ts` }));
      const answers = [
        json(200, { status: "ahead", files: [{ filename: "a.ts" }] }),
        json(200, { status: "identical", files: [] }),
        json(200, { status: "behind", files: [{ filename: "a.ts" }] }),
        json(200, { status: "diverged", files: fullPage }),
        json(200, { status: "diverged" }),
        json(404, { message: "Not Found" }),
      ];
      githubStandIn(() => answers.shift() ?? json(500, {}));
      const app = githubAppOf();

      expect(await app.mergeBaseFiles(ref)).toEqual(["a.ts"]);
      expect(await app.mergeBaseFiles(ref)).toEqual([]);
      expect(await app.mergeBaseFiles(ref)).toEqual([]);
      expect(await app.mergeBaseFiles(ref)).toBe(null);
      expect(await app.mergeBaseFiles(ref)).toBe(null);
      expect(await app.mergeBaseFiles(ref)).toBe(null);
    });
  });

  describe("createCommitStatus", () => {
    const sha = "a".repeat(40);
    const status = { owner: "acme", repo: "shop", accessToken: "ghs_status", sha, context: "akan/build" };

    test("posts the state, context, description and link for one commit with the token it is handed", async () => {
      const calls = githubStandIn(() => json(201, { id: 1 }));
      await githubAppOf().createCommitStatus({
        ...status,
        state: "pending",
        description: "Building web",
        targetUrl: "https://akasys.example/build/1",
      });
      expect(calls.map(({ method, url }) => `${method} ${url.pathname}`)).toEqual([
        `POST /repos/acme/shop/statuses/${sha}`,
      ]);
      expect(calls[0]?.authorization).toBe("Bearer ghs_status");
      expect(calls[0]?.body).toEqual({
        state: "pending",
        context: "akan/build",
        description: "Building web",
        target_url: "https://akasys.example/build/1",
      });
    });

    test("cuts a description past GitHub's 140 characters and sends no link it was not given", async () => {
      const calls = githubStandIn(() => json(201, { id: 1 }));
      const app = githubAppOf();
      await app.createCommitStatus({ ...status, state: "failure", description: "빌드".repeat(100) });
      await app.createCommitStatus({ ...status, state: "success", description: "가".repeat(140) });
      const [cut, kept] = calls.map(({ body }) => body as { description: string; target_url?: string });
      expect(Array.from(cut?.description ?? "")).toHaveLength(140);
      expect(cut?.description.endsWith("…")).toBe(true);
      expect(kept?.description).toBe("가".repeat(140));
      expect(cut && "target_url" in cut).toBe(false);
    });

    test("refuses anything but a full commit SHA before any request", async () => {
      const calls = githubStandIn(() => json(201, { id: 1 }));
      const app = githubAppOf();
      for (const ref of ["main", "a".repeat(39), `${"a".repeat(40)}/../../hooks`, `${"a".repeat(40)}?x=1`, ""])
        await expect(
          app.createCommitStatus({ ...status, sha: ref, state: "pending", description: "x" }),
        ).rejects.toThrow("util.error.githubInvalidCommitSha");
      expect(calls).toEqual([]);
    });

    test("names the failure", async () => {
      githubStandIn(() => json(403, { message: "Resource not accessible by integration" }));
      await expect(githubAppOf().createCommitStatus({ ...status, state: "error", description: "x" })).rejects.toThrow(
        "util.error.githubCommitStatusCreateFailed",
      );
    });

    test("hands on the wait GitHub asks for, and none for a request it judged wrong", async () => {
      const resetAt = Math.floor(Date.now() / 1000) + 30;
      const answers = [
        new Response("{}", { status: 503, headers: { "retry-after": "7" } }),
        new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetAt) },
        }),
        json(403, { message: "You have exceeded a secondary rate limit" }),
        json(429, {}),
        json(422, { message: "Validation Failed" }),
        json(403, { message: "Resource not accessible by integration" }),
      ];
      githubStandIn(() => answers.shift() ?? json(500, {}));
      const app = githubAppOf();
      const waits: unknown[] = [];
      for (let posted = 0; posted < 6; posted += 1)
        waits.push(
          await app.createCommitStatus({ ...status, state: "error", description: "x" }).then(
            () => "posted",
            (error) => (error as { data?: { retryAfterMs?: unknown } }).data?.retryAfterMs,
          ),
        );
      expect(waits[0]).toBe(7_000);
      expect(waits[1]).toBeGreaterThan(25_000);
      expect(waits[1]).toBeLessThanOrEqual(30_000);
      expect(waits.slice(2)).toEqual([60_000, 60_000, undefined, undefined]);
    });
  });

  describe("installationSettingsUrl", () => {
    test("points an organization's installation at the organization's settings and a user's at their own", () => {
      expect(GithubApp.installationSettingsUrl({ id: "42", accountLogin: "acme", accountType: "Organization" })).toBe(
        "https://github.com/organizations/acme/settings/installations/42",
      );
      expect(GithubApp.installationSettingsUrl({ id: "42", accountLogin: "carol", accountType: "User" })).toBe(
        "https://github.com/settings/installations/42",
      );
    });

    test("answers null for an id, login or account type it cannot place", () => {
      expect(GithubApp.installationSettingsUrl({ id: "4/2", accountLogin: "carol", accountType: "User" })).toBe(null);
      expect(
        GithubApp.installationSettingsUrl({ id: "42", accountLogin: "acme/../x", accountType: "Organization" }),
      ).toBe(null);
      expect(GithubApp.installationSettingsUrl({ id: "42", accountLogin: "acme", accountType: "" })).toBe(null);
    });
  });

  describe("ensureWebhook", () => {
    const webhookUrl = "https://akasys.example/akanci/webhook";
    const target = { owner: "acme", repo: "shop", accessToken: "ghs_admin", webhookUrl, webhookSecret: "fake-secret" };
    const routeOf = ({ method, url }: Call) => `${method} ${url.pathname}`;
    const hooksAnswer = (hooks: unknown[]) => (call: Call) =>
      call.method === "GET" ? json(200, hooks) : call.method === "POST" ? json(201, { id: 9 }) : json(200, {});

    test("registers one hook for pushes and pull requests", async () => {
      const calls = githubStandIn(hooksAnswer([{ id: 3, events: ["push"], config: { url: "https://other.example" } }]));
      expect(await githubAppOf().ensureWebhook(target)).toEqual({ id: 9, created: true });
      expect(calls.map(routeOf)).toEqual(["GET /repos/acme/shop/hooks", "POST /repos/acme/shop/hooks"]);
      expect(calls[1]?.body).toEqual({
        name: "web",
        active: true,
        events: ["push", "pull_request"],
        config: { url: webhookUrl, content_type: "json", secret: "fake-secret" },
      });
    });

    test("adds pull requests to a push hook, keeping its other events, before the config write that sets the secret", async () => {
      const calls = githubStandIn(hooksAnswer([{ id: 5, events: ["push", "issues"], config: { url: webhookUrl } }]));
      expect(await githubAppOf().ensureWebhook(target)).toEqual({ id: 5, created: false });
      expect(calls.map(routeOf)).toEqual([
        "GET /repos/acme/shop/hooks",
        "PATCH /repos/acme/shop/hooks/5",
        "PATCH /repos/acme/shop/hooks/5/config",
      ]);
      expect(calls[1]?.body).toEqual({ add_events: ["pull_request"] });
      expect(calls[2]?.body).toEqual({ url: webhookUrl, content_type: "json", secret: "fake-secret" });
    });

    test("only rewrites the config of a hook already subscribed to both events or to every event", async () => {
      for (const events of [["pull_request", "push"], ["*"]]) {
        const calls = githubStandIn(hooksAnswer([{ id: 5, events, config: { url: webhookUrl } }]));
        await githubAppOf().ensureWebhook(target);
        expect(calls.map(routeOf)).toEqual(["GET /repos/acme/shop/hooks", "PATCH /repos/acme/shop/hooks/5/config"]);
        fetchSpy?.mockRestore();
      }
    });

    test("names a failed subscription and leaves the config untouched", async () => {
      const calls = githubStandIn((call) =>
        call.method === "GET"
          ? json(200, [{ id: 5, events: ["push"], config: { url: webhookUrl } }])
          : json(404, { message: "Not Found" }),
      );
      await expect(githubAppOf().ensureWebhook(target)).rejects.toThrow("util.error.githubWebhookUpdateFailed");
      expect(calls.map(routeOf)).toEqual(["GET /repos/acme/shop/hooks", "PATCH /repos/acme/shop/hooks/5"]);
    });
  });

  describe("branches and pull requests", () => {
    const repoRef = { owner: "acme", repo: "shop", accessToken: "ghs_pr" };
    const sha = "a".repeat(40);
    const routeOf = ({ method, url }: Call) => `${method} ${url.pathname}${url.search}`;
    const pullOf = (extra: object = {}) => ({
      number: 7,
      html_url: "https://github.com/acme/shop/pull/7",
      state: "open",
      draft: false,
      head: { ref: "t/SHOP-7", sha, repo: { full_name: "acme/shop" } },
      base: { ref: "main" },
      ...extra,
    });

    test("reads a branch's head by its full ref, and nothing for one GitHub does not know or names otherwise", async () => {
      const calls = githubStandIn(({ url }) =>
        url.pathname.endsWith("/t/SHOP-7")
          ? json(200, { ref: "refs/heads/t/SHOP-7", object: { sha } })
          : url.pathname.endsWith("/t")
            ? json(200, { ref: "refs/heads/t/other", object: { sha } })
            : json(404, { message: "Not Found" }),
      );
      const app = githubAppOf();
      expect(await app.getBranchHead({ ...repoRef, branch: "t/SHOP-7" })).toBe(sha);
      expect(await app.getBranchHead({ ...repoRef, branch: "t" })).toBe(null);
      expect(await app.getBranchHead({ ...repoRef, branch: "gone" })).toBe(null);
      expect(calls.map(routeOf)).toEqual([
        "GET /repos/acme/shop/git/ref/heads/t/SHOP-7",
        "GET /repos/acme/shop/git/ref/heads/t",
        "GET /repos/acme/shop/git/ref/heads/gone",
      ]);
      expect(calls[0]?.authorization).toBe("Bearer ghs_pr");
    });

    test("creates a branch at a full commit SHA", async () => {
      const calls = githubStandIn(() => json(201, { ref: "refs/heads/t/SHOP-7" }));
      await githubAppOf().createBranch({ ...repoRef, branch: "t/SHOP-7", sha });
      expect(calls.map(routeOf)).toEqual(["POST /repos/acme/shop/git/refs"]);
      expect(calls[0]?.body).toEqual({ ref: "refs/heads/t/SHOP-7", sha });
    });

    test("lists the open pull requests from one branch of the repository's own owner", async () => {
      const calls = githubStandIn(() => json(200, [pullOf()]));
      expect(await githubAppOf().listOpenPullRequests({ ...repoRef, head: "t/SHOP-7" })).toEqual([
        {
          number: 7,
          url: "https://github.com/acme/shop/pull/7",
          state: "open",
          draft: false,
          headRef: "t/SHOP-7",
          headSha: sha,
          headRepo: "acme/shop",
          baseRef: "main",
          mergeable: null,
        },
      ]);
      expect(calls[0]?.url.pathname).toBe("/repos/acme/shop/pulls");
      expect(calls[0]?.url.searchParams.get("state")).toBe("open");
      expect(calls[0]?.url.searchParams.get("head")).toBe("acme:t/SHOP-7");
    });

    test("opens a pull request and sends no body or draft flag it was not given", async () => {
      const calls = githubStandIn(() => json(201, pullOf({ draft: true })));
      const app = githubAppOf();
      expect((await app.createPullRequest({ ...repoRef, head: "t/SHOP-7", base: "main", title: "SHOP-7" })).draft).toBe(
        true,
      );
      await app.createPullRequest({
        ...repoRef,
        head: "t/SHOP-7",
        base: "main",
        title: "x",
        body: "Closes SHOP-7",
        draft: true,
      });
      expect(calls.map(({ body }) => body)).toEqual([
        { title: "SHOP-7", head: "t/SHOP-7", base: "main" },
        { title: "x", head: "t/SHOP-7", base: "main", body: "Closes SHOP-7", draft: true },
      ]);
    });

    test("reads a merged pull request as merged, and nothing for a number GitHub does not know", async () => {
      githubStandIn(({ url }) =>
        url.pathname.endsWith("/pulls/7")
          ? json(200, pullOf({ state: "closed", merged: true, mergeable: false }))
          : json(404, { message: "Not Found" }),
      );
      const app = githubAppOf();
      expect(await app.getPullRequest({ ...repoRef, number: 7 })).toMatchObject({ state: "merged", mergeable: false });
      expect(await app.getPullRequest({ ...repoRef, number: 8 })).toBe(null);
    });

    test("squash-merges at the head the caller read, with the title it was handed", async () => {
      const merged = "b".repeat(40);
      const calls = githubStandIn(() =>
        json(200, { sha: merged, merged: true, message: "Pull Request successfully merged" }),
      );
      expect(
        await githubAppOf().squashMergePullRequest({ ...repoRef, number: 7, sha, title: "SHOP-7 Add checkout (#7)" }),
      ).toEqual({ sha: merged });
      expect(calls.map(routeOf)).toEqual(["PUT /repos/acme/shop/pulls/7/merge"]);
      expect(calls[0]?.body).toEqual({ merge_method: "squash", sha, commit_title: "SHOP-7 Add checkout (#7)" });
    });

    test("reads what GitHub builds its squash message from: the setting, the body and up to 250 commits", async () => {
      let setting: unknown = "PR_BODY";
      const calls = githubStandIn(({ url }) => {
        if (url.pathname.endsWith("/commits")) {
          const page = Number(url.searchParams.get("page"));
          const commitOf = (idx: number) => ({
            sha,
            commit: { message: `Step ${page}.${idx}`, author: { name: "Carol Kim", email: "carol@acme.dev" } },
            author: idx === 0 ? { login: "carol" } : null,
          });
          return json(
            200,
            Array.from({ length: 100 }, (_, idx) => commitOf(idx)),
          );
        }
        if (url.pathname.endsWith("/pulls/7")) return json(200, pullOf({ body: "Closes SHOP-7" }));
        if (url.pathname.endsWith("/pulls/8")) return json(200, pullOf({ number: 8, body: null }));
        return json(200, { id: 1, ...(setting === undefined ? {} : { squash_merge_commit_message: setting }) });
      });
      const app = githubAppOf();
      const commits = await app.listPullRequestCommits({ ...repoRef, number: 7 });
      expect(commits).toHaveLength(250);
      expect(commits.slice(0, 2)).toEqual([
        { message: "Step 1.0", authorName: "Carol Kim", authorEmail: "carol@acme.dev", authorLogin: "carol" },
        { message: "Step 1.1", authorName: "Carol Kim", authorEmail: "carol@acme.dev", authorLogin: null },
      ]);
      expect(commits.at(-1)?.message).toBe("Step 3.49");
      expect(await app.getPullRequestBody({ ...repoRef, number: 7 })).toBe("Closes SHOP-7");
      expect(await app.getPullRequestBody({ ...repoRef, number: 8 })).toBe("");
      const settings: unknown[] = [];
      for (setting of ["PR_BODY", "COMMIT_MESSAGES", "BLANK", "SOMETHING_NEW", undefined])
        settings.push(await app.getSquashMergeCommitMessage(repoRef));
      expect(settings).toEqual(["PR_BODY", "COMMIT_MESSAGES", "BLANK", null, null]);
      expect(calls.map(routeOf).slice(0, 5)).toEqual([
        "GET /repos/acme/shop/pulls/7/commits?per_page=100&page=1",
        "GET /repos/acme/shop/pulls/7/commits?per_page=100&page=2",
        "GET /repos/acme/shop/pulls/7/commits?per_page=100&page=3",
        "GET /repos/acme/shop/pulls/7",
        "GET /repos/acme/shop/pulls/8",
      ]);
      expect(calls.slice(5).map(routeOf)).toEqual(Array(5).fill("GET /repos/acme/shop"));
      expect(calls.every((call) => call.authorization === "Bearer ghs_pr")).toBe(true);
    });

    test("hands on GitHub's refusal of a merge with its status", async () => {
      githubStandIn(() => json(409, { message: "Head branch was modified. Review and try the merge again." }));
      const refusal = await githubAppOf()
        .squashMergePullRequest({ ...repoRef, number: 7, sha, title: "x" })
        .catch((error: unknown) => (error as { data?: { status?: unknown } }).data?.status);
      expect(refusal).toBe(409);
    });

    test("closes a pull request, comments on its conversation and updates its branch at the head it names", async () => {
      const calls = githubStandIn(({ method }) =>
        method === "PATCH"
          ? json(200, pullOf({ state: "closed" }))
          : method === "POST"
            ? json(201, { id: 99, html_url: "https://github.com/acme/shop/pull/7#issuecomment-99" })
            : json(202, { message: "Updating pull request branch." }),
      );
      const app = githubAppOf();
      expect((await app.closePullRequest({ ...repoRef, number: 7 })).state).toBe("closed");
      expect(await app.commentOnPullRequest({ ...repoRef, number: 7, body: "Rejected" })).toEqual({
        id: "99",
        url: "https://github.com/acme/shop/pull/7#issuecomment-99",
      });
      await app.updatePullRequestBranch({ ...repoRef, number: 7, expectedHeadSha: sha });
      expect(calls.map(routeOf)).toEqual([
        "PATCH /repos/acme/shop/pulls/7",
        "POST /repos/acme/shop/issues/7/comments",
        "PUT /repos/acme/shop/pulls/7/update-branch",
      ]);
      expect(calls.map(({ body }) => body)).toEqual([
        { state: "closed" },
        { body: "Rejected" },
        { expected_head_sha: sha },
      ]);
    });

    test("compares two refs by branch name or sha, and answers nothing when GitHub knows neither", async () => {
      const calls = githubStandIn(({ url }) =>
        url.pathname.includes("gone")
          ? json(404, { message: "Not Found" })
          : json(200, { status: "diverged", ahead_by: 2, behind_by: 3, files: [] }),
      );
      const app = githubAppOf();
      expect(await app.compareRefs({ ...repoRef, base: "main", head: "t/SHOP-7" })).toEqual({
        status: "diverged",
        aheadBy: 2,
        behindBy: 3,
      });
      expect(await app.compareRefs({ ...repoRef, base: sha, head: "gone" })).toBe(null);
      expect(calls.map(routeOf)).toEqual([
        "GET /repos/acme/shop/compare/main...t/SHOP-7?per_page=1",
        `GET /repos/acme/shop/compare/${sha}...gone?per_page=1`,
      ]);
    });

    test("refuses a branch, sha or number outside git's grammar before any request", async () => {
      const calls = githubStandIn(() => json(200, {}));
      const app = githubAppOf();
      const badBranches = [
        "",
        "-t",
        ".hidden",
        "t/",
        "/t",
        "t//x",
        "t/../main",
        "a..b",
        "t/x.lock",
        "t.lock/x",
        "main.",
        "t x",
        "t?x=1",
        "t#x",
        "t%2fx",
        "t\\x",
        "t:x",
        "a".repeat(201),
      ];
      for (const branch of badBranches) {
        await expect(app.getBranchHead({ ...repoRef, branch })).rejects.toThrow("util.error.githubInvalidName");
        await expect(app.compareRefs({ ...repoRef, base: "main", head: branch })).rejects.toThrow(
          "util.error.githubInvalidName",
        );
      }
      for (const number of [0, -1, 1.5, Number.NaN]) {
        await expect(app.getPullRequest({ ...repoRef, number })).rejects.toThrow("util.error.githubInvalidName");
        await expect(app.getPullRequestBody({ ...repoRef, number })).rejects.toThrow("util.error.githubInvalidName");
        await expect(app.listPullRequestCommits({ ...repoRef, number })).rejects.toThrow(
          "util.error.githubInvalidName",
        );
      }
      await expect(app.createBranch({ ...repoRef, branch: "t/x", sha: "main" })).rejects.toThrow(
        "util.error.githubInvalidCommitSha",
      );
      await expect(
        app.squashMergePullRequest({ ...repoRef, number: 7, sha: "a".repeat(39), title: "x" }),
      ).rejects.toThrow("util.error.githubInvalidCommitSha");
      expect(calls).toEqual([]);
    });

    test("passes the branch names a ticket flow uses", async () => {
      const calls = githubStandIn(() => json(404, { message: "Not Found" }));
      const app = githubAppOf();
      for (const branch of ["main", "t/SHOP-12", "feature/x.y_z-1", "release/2026.10", "_tmp"])
        expect(await app.getBranchHead({ ...repoRef, branch })).toBe(null);
      expect(calls).toHaveLength(5);
    });
  });
});

describe("GithubApp in a pull request preview", () => {
  const original = process.env[PreviewMode.env];
  const repoRef = { owner: "acme", repo: "shop", accessToken: "ghs_pr" };
  const sha = "a".repeat(40);

  afterEach(() => {
    if (original === undefined) delete process.env[PreviewMode.env];
    else process.env[PreviewMode.env] = original;
  });

  test("writes nothing to GitHub", async () => {
    process.env[PreviewMode.env] = "1";
    const calls = githubStandIn(() => json(201, { id: 1, number: 7 }));
    const app = githubAppOf();
    const writes = [
      () => app.createBranch({ ...repoRef, branch: "t/SHOP-7", sha }),
      () => app.createPullRequest({ ...repoRef, head: "t/SHOP-7", base: "main", title: "SHOP-7" }),
      () => app.commentOnPullRequest({ ...repoRef, number: 7, body: "hi" }),
      () => app.closePullRequest({ ...repoRef, number: 7 }),
      () => app.squashMergePullRequest({ ...repoRef, number: 7, sha, title: "x" }),
      () => app.createCommitStatus({ ...repoRef, sha, state: "success", context: "akan/preview", description: "d" }),
      () => app.registerWebhook({ ...repoRef, webhookUrl: "https://akasys.example/hook", webhookSecret: "s" }),
    ];

    for (const write of writes) await expect(write()).rejects.toThrow("util.error.githubWriteInPreview");
    expect(calls).toEqual([]);
  });

  test("still reads, and still takes the tokens a read needs", async () => {
    process.env[PreviewMode.env] = "1";
    const calls = githubStandIn(({ url }) =>
      url.hostname === "github.com"
        ? json(200, { access_token: "gho_1", token_type: "bearer", scope: "" })
        : url.pathname.endsWith("/access_tokens")
          ? json(201, { token: "ghs_1", expires_at: "2099-01-01T00:00:00Z" })
          : json(200, { ref: "refs/heads/main", object: { sha } }),
    );
    const app = githubAppOf();

    expect((await app.getAccessToken("fresh")).accessToken).toBe("gho_1");
    expect((await app.createInstallationAccessToken("42")).accessToken).toBe("ghs_1");
    expect(await app.getBranchHead({ ...repoRef, branch: "main" })).toBe(sha);
    expect(calls.map(({ method }) => method)).toEqual(["POST", "POST", "GET"]);
  });

  test("writes again once the marker is off", async () => {
    process.env[PreviewMode.env] = "0";
    const calls = githubStandIn(() => json(201, { ref: "refs/heads/t/SHOP-7" }));

    await githubAppOf().createBranch({ ...repoRef, branch: "t/SHOP-7", sha });
    expect(calls).toHaveLength(1);
  });
});
