import { createPrivateKey } from "node:crypto";
import { adapt } from "akanjs/service";
import { importPKCS8, SignJWT } from "jose";
import { Err } from "../lib/dict";
import type { ModulesOptions } from "../lib/option";
import {
  isGithubAccessTokenDto,
  toGithubAccessToken,
  toGithubInfo,
  toGithubInstallationAccessToken,
  toGithubRepository,
} from "./githubApp.helper";
import type {
  GithubAccessToken,
  GithubAccessTokenDto,
  GithubApiError,
  GithubCompareDto,
  GithubContentDto,
  GithubInfo,
  GithubInfoDto,
  GithubInstallation,
  GithubInstallationAccessToken,
  GithubInstallationAccessTokenDto,
  GithubInstallationDto,
  GithubInstallationRepositoriesDto,
  GithubOAuthErrorDto,
  GithubOptions,
  GithubRepoRef,
  GithubRepository,
  GithubRepositoryDto,
  GithubUserInstallationsDto,
  GithubWebhookDto,
} from "./githubTypes";

type UtilErrorKey = ConstructorParameters<typeof Err>[0];

interface GithubRequest {
  token?: string;
  method?: "POST" | "PATCH";
  body?: object;
  failure?: UtilErrorKey;
}

interface GithubPageRequest<Page, Item> {
  token: string;
  failure?: UtilErrorKey;
  itemsOf: (page: Page) => Item[] | undefined;
}

type GithubPermissionLevel = "read" | "write";

export interface GithubInstallationTokenScope {
  repositories?: string[];
  permissions?: { [permission: string]: GithubPermissionLevel };
}

interface GithubInstallationGrantDto extends GithubInstallationAccessTokenDto {
  permissions?: { [permission: string]: string };
  repository_selection?: "all" | "selected";
}

interface GithubWebhookTarget extends GithubRepoRef {
  webhookUrl: string;
  webhookSecret?: string;
}

export class GithubApp extends adapt("githubApp", ({ env }) => ({
  options: env((options: ModulesOptions) => options.githubAppInfo),
})) {
  static readonly #baseUrl = "https://api.github.com";
  static readonly #pageSize = 100;
  static readonly #compareFilesLimit = 300;

  get configured() {
    return !!this.options;
  }
  #requireOptions(): GithubOptions {
    if (!this.options)
      throw new Err("util.error.adaptorNotConfigured", { adaptor: "GithubApp", option: "githubAppInfo" });
    return this.options;
  }

  async #api<T, AllowNotFound extends boolean = false>(
    path: string,
    {
      token,
      method,
      body,
      failure = "util.error.githubApiFailed",
      allowNotFound,
    }: GithubRequest & { allowNotFound?: AllowNotFound } = {},
  ): Promise<AllowNotFound extends true ? T | null : T> {
    const response = await fetch(path.startsWith("https://") ? path : `${GithubApp.#baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (allowNotFound && response.status === 404) return null as AllowNotFound extends true ? T | null : T;
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = GithubApp.#describeFailure(`${method ?? "GET"} ${path}`, response.status, data);
      throw new Err(failure, { status: response.status, reason });
    }
    return data as AllowNotFound extends true ? T | null : T;
  }

  async #paginate<Page, Item>(path: string, { token, failure, itemsOf }: GithubPageRequest<Page, Item>) {
    const items: Item[] = [];
    const separator = path.includes("?") ? "&" : "?";
    for (let page = 1; ; page += 1) {
      const pageUrl = `${path}${separator}per_page=${GithubApp.#pageSize}&page=${page}`;
      const pageItems = itemsOf(await this.#api<Page>(pageUrl, { token, failure }));
      if (!Array.isArray(pageItems))
        throw new Err(failure ?? "util.error.githubApiFailed", { reason: `GET ${pageUrl} returned no list` });
      items.push(...pageItems);
      if (pageItems.length < GithubApp.#pageSize) break;
    }
    return items;
  }

  async getAccessToken(code: string): Promise<GithubAccessToken> {
    const { clientId, clientSecret } = this.#requireOptions();
    const data = await this.#api<GithubAccessTokenDto | GithubOAuthErrorDto | null>(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        body: { client_id: clientId, client_secret: clientSecret, code },
        failure: "util.error.githubAccessTokenExchangeFailed",
      },
    );
    //? A rejected code is still answered with 200, carrying an `error` body instead of a token.
    if (!isGithubAccessTokenDto(data))
      throw new Err("util.error.githubAccessTokenExchangeFailed", {
        reason: data?.error_description ?? data?.error ?? "no access token in the response",
      });
    return toGithubAccessToken(data);
  }

  async getGithubInfo(accessToken: string): Promise<GithubInfo> {
    return toGithubInfo(await this.#api<GithubInfoDto>("/user", { token: accessToken }));
  }

  async createRepository(accessToken: string, repo: string, owner?: string) {
    const repoRef = owner ? { owner, repo, accessToken } : null;
    const existing = repoRef ? await this.getRepository(repoRef) : null;
    if (existing) return existing;
    try {
      return await this.#api<{ id: number }>("/user/repos", {
        token: accessToken,
        method: "POST",
        body: { name: repo, private: true },
        failure: "util.error.githubRepositoryCreateFailed",
      });
    } catch (error) {
      const created = repoRef ? await this.getRepository(repoRef) : null;
      if (created) return created;
      if (error instanceof Err && String(error.data?.reason).includes("Resource not accessible by integration"))
        throw new Err("util.error.githubRepositoryCreateForbidden", error.data);
      throw error;
    }
  }

  async getRepository({ owner, repo, accessToken }: GithubRepoRef) {
    return await this.#api<{ id: number }, true>(`/repos/${owner}/${repo}`, {
      token: accessToken,
      allowNotFound: true,
    });
  }

  async listAllUserRepositories(accessToken: string): Promise<GithubRepository[]> {
    const repositories = await this.#paginate("/user/repos?visibility=all&affiliation=owner&sort=updated", {
      token: accessToken,
      itemsOf: (page: GithubRepositoryDto[]) => page,
    });
    return repositories.map(toGithubRepository);
  }

  async listOrganizationRepositories({
    org,
    accessToken,
  }: {
    org: string;
    accessToken: string;
  }): Promise<GithubRepository[]> {
    const repositories = await this.#paginate(`/orgs/${org}/repos?type=all&sort=updated`, {
      token: accessToken,
      failure: "util.error.githubOrganizationRepositoriesListFailed",
      itemsOf: (page: GithubRepositoryDto[]) => page,
    });
    return repositories.map(toGithubRepository);
  }

  //? Unscoped, GitHub grants every repository and permission of the installation; a token bound for a build pod must
  //? name its repository and permissions.
  async createInstallationAccessToken(
    installationId: string,
    { repositories, permissions }: GithubInstallationTokenScope = {},
  ): Promise<GithubInstallationAccessToken> {
    const scoped = !!repositories || !!permissions;
    const result = await this.#api<GithubInstallationGrantDto>(`/app/installations/${installationId}/access_tokens`, {
      token: await this.#createAppJwt(),
      method: "POST",
      ...(scoped
        ? { body: { ...(repositories ? { repositories } : {}), ...(permissions ? { permissions } : {}) } }
        : {}),
      failure: "util.error.githubInstallationAccessTokenCreateFailed",
    });
    const token = toGithubInstallationAccessToken(result);
    if (!token)
      throw new Err("util.error.githubInstallationAccessTokenCreateFailed", { reason: "no token in the response" });
    const overGrant = GithubApp.#overGrant(result, { repositories, permissions });
    if (overGrant) throw new Err("util.error.githubInstallationAccessTokenCreateFailed", { reason: overGrant });
    return token;
  }

  async listInstallationRepositories(accessToken: string): Promise<GithubRepository[]> {
    const repositories = await this.#paginate("/installation/repositories", {
      token: accessToken,
      failure: "util.error.githubInstallationRepositoriesListFailed",
      itemsOf: (page: GithubInstallationRepositoriesDto) => page.repositories,
    });
    return repositories.map(toGithubRepository);
  }

  async listUserInstallations(accessToken: string): Promise<GithubInstallation[]> {
    const installations = await this.#paginate("/user/installations", {
      token: accessToken,
      failure: "util.error.githubUserInstallationsListFailed",
      itemsOf: (page: GithubUserInstallationsDto) => page.installations,
    });
    return installations.map((installation) => ({
      id: installation.id.toString(),
      accountLogin: installation.account?.login ?? "",
    }));
  }

  async getRepositoryInstallation({
    owner,
    repo,
  }: {
    owner: string;
    repo: string;
  }): Promise<GithubInstallation | null> {
    const installation = await this.#api<GithubInstallationDto, true>(`/repos/${owner}/${repo}/installation`, {
      token: await this.#createAppJwt(),
      allowNotFound: true,
    });
    return installation ? { id: installation.id.toString(), accountLogin: installation.account?.login ?? owner } : null;
  }

  async listRepositoryAppNames({ owner, repo, accessToken, ref }: GithubRepoRef & { ref?: string }) {
    const contents = await this.#api<GithubContentDto[] | GithubContentDto>(
      `/repos/${owner}/${repo}/contents/apps${GithubApp.#refQuery(ref)}`,
      { token: accessToken, failure: "util.error.githubRepositoryAppsListFailed" },
    );
    if (!Array.isArray(contents))
      throw new Err("util.error.githubRepositoryAppsListFailed", { reason: `apps is a ${contents.type}` });
    return contents.filter((item) => item.type === "dir").map((item) => item.name);
  }

  /**
   * `apps/*` folders that actually are Akan applications. `listRepositoryAppNames` accepts any directory,
   * which is fine at build time (the folder set is already known-good) but lets a non-Akan repository be
   * imported as a project that can never build.
   */
  async listRepositoryAkanAppNames({ ref, ...repoRef }: GithubRepoRef & { ref?: string }) {
    const appNames = await this.listRepositoryAppNames({ ...repoRef, ref });
    const checked = await Promise.all(
      appNames.map(async (appName) => ({
        appName,
        isAkanApp: await this.hasRepositoryFile({ ...repoRef, ref, path: `apps/${appName}/akan.config.ts` }),
      })),
    );
    return checked.filter((item) => item.isAkanApp).map((item) => item.appName);
  }

  async hasRepositoryFile({ owner, repo, accessToken, path, ref }: GithubRepoRef & { path: string; ref?: string }) {
    const content = await this.#api<GithubContentDto | GithubContentDto[], true>(
      `/repos/${owner}/${repo}/contents/${path}${GithubApp.#refQuery(ref)}`,
      { token: accessToken, allowNotFound: true },
    );
    return !!content && !Array.isArray(content) && content.type === "file";
  }

  /**
   * Text of one repository file, or null when it is absent, is not a file, or is too large for the contents
   * API to inline (it then answers with no `content`). Never throws for a missing path: callers read optional
   * configuration with this, where absent and unreadable lead to the same fallback.
   */
  async getRepositoryFileText({
    owner,
    repo,
    accessToken,
    path,
    ref,
  }: GithubRepoRef & { path: string; ref?: string }): Promise<string | null> {
    const file = await this.#api<GithubContentDto | GithubContentDto[], true>(
      `/repos/${owner}/${repo}/contents/${path}${GithubApp.#refQuery(ref)}`,
      { token: accessToken, allowNotFound: true },
    );
    if (!file || Array.isArray(file) || file.type !== "file" || !file.content) return null;
    if (file.encoding && file.encoding !== "base64") return null;
    return Buffer.from(file.content, "base64").toString("utf8");
  }

  /**
   * Paths changed from `base` to `head`, renamed files under both names, or null when the answer would not be the
   * whole difference: an unknown commit, a head that is not ahead of base (a force push or a revert to an older
   * commit), or a full page of files, which is all the compare API ever lists and says nothing when it stops there.
   */
  async compareFiles({ owner, repo, accessToken, base, head }: GithubRepoRef & { base: string; head: string }) {
    const comparison = await this.#api<GithubCompareDto, true>(
      `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
      { token: accessToken, allowNotFound: true },
    );
    if (comparison?.status === "identical") return [];
    if (comparison?.status !== "ahead" || !comparison.files) return null;
    if (comparison.files.length >= GithubApp.#compareFilesLimit) return null;
    return [
      ...new Set(
        comparison.files.flatMap((file) => [
          file.filename,
          ...(file.previous_filename ? [file.previous_filename] : []),
        ]),
      ),
    ];
  }

  async registerWebhook({ owner, repo, accessToken, webhookUrl, webhookSecret }: GithubWebhookTarget) {
    return await this.#api<GithubWebhookDto>(`/repos/${owner}/${repo}/hooks`, {
      token: accessToken,
      method: "POST",
      body: {
        name: "web",
        active: true,
        events: ["push"],
        config: { url: webhookUrl, content_type: "json", secret: webhookSecret },
      },
      failure: "util.error.githubWebhookRegisterFailed",
    });
  }

  async listWebhooks({ owner, repo, accessToken }: GithubRepoRef) {
    return await this.#paginate(`/repos/${owner}/${repo}/hooks`, {
      token: accessToken,
      failure: "util.error.githubWebhookListFailed",
      itemsOf: (page: GithubWebhookDto[]) => page,
    });
  }

  async updateWebhookConfig({
    owner,
    repo,
    accessToken,
    hookId,
    webhookUrl,
    webhookSecret,
  }: GithubWebhookTarget & { hookId: number }) {
    await this.#api(`/repos/${owner}/${repo}/hooks/${hookId}/config`, {
      token: accessToken,
      method: "PATCH",
      body: { url: webhookUrl, content_type: "json", secret: webhookSecret },
      failure: "util.error.githubWebhookUpdateFailed",
    });
  }

  /**
   * Register the push webhook only when the repository does not already carry one for this URL.
   * Re-importing a repository used to POST a second identical hook, which made GitHub deliver every push
   * twice — two builds racing on the same scheduler key.
   *
   * An existing hook still gets its config rewritten: GitHub never returns a hook's secret, so the only way to
   * know it matches the one the receiver verifies with is to set it, and a rotated secret has no other way in.
   */
  async ensureWebhook(target: GithubWebhookTarget): Promise<{ id: number; created: boolean }> {
    const existing = (await this.listWebhooks(target)).find((hook) => hook.config?.url === target.webhookUrl);
    if (existing) {
      await this.updateWebhookConfig({ ...target, hookId: existing.id });
      return { id: existing.id, created: false };
    }
    const created = await this.registerWebhook(target);
    return { id: created.id, created: true };
  }

  async hasWebhook({ webhookUrl, ...repoRef }: GithubRepoRef & { webhookUrl: string }) {
    const hooks = await this.listWebhooks(repoRef);
    return hooks.some((hook) => hook.config?.url === webhookUrl);
  }

  async getInstallationToken(owner: string, accessToken: string, { installationId }: { installationId?: string } = {}) {
    const installId = (await this.listUserInstallations(accessToken)).find(
      (item) => item.accountLogin.toLowerCase() === owner.toLowerCase(),
    )?.id;
    if (installId) return await this.createInstallationAccessToken(installId);

    if (installationId) {
      try {
        return await this.createInstallationAccessToken(installationId);
      } catch {
        // The stored installation id can be stale after the user uninstalls the GitHub App.
      }
    }

    return undefined;
  }

  async #createAppJwt() {
    const { id, privateKey } = this.#requireOptions();
    if (!privateKey) throw new Err("util.error.githubPrivateKeyNotConfigured");

    const now = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(GithubApp.#normalizePrivateKey(privateKey), "RS256");
    return await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 9 * 60)
      .setIssuer(id)
      .sign(key);
  }

  static #normalizePrivateKey(rawPrivateKey: string) {
    const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
    if (!privateKey.includes("BEGIN RSA PRIVATE KEY")) return privateKey;

    return createPrivateKey(privateKey).export({
      format: "pem",
      type: "pkcs8",
    }) as string;
  }

  //? A token that came back wider than asked is refused rather than handed on. `metadata: read` rides on every App
  //? token whatever was requested.
  static #overGrant(grant: GithubInstallationGrantDto, { repositories, permissions }: GithubInstallationTokenScope) {
    if (repositories && grant.repository_selection !== "selected")
      return `token covers ${grant.repository_selection ?? "unknown"} repositories, not the ones requested`;
    if (!permissions) return null;
    if (!grant.permissions) return "token permissions are not reported";
    const wider = Object.entries(grant.permissions).filter(([permission, level]) => {
      if (permission === "metadata" && level === "read") return false;
      const requested = permissions[permission];
      return !requested || (requested === "read" && level !== "read");
    });
    return wider.length
      ? `token grants more than requested: ${wider.map(([permission, level]) => `${permission}=${level}`).join(", ")}`
      : null;
  }

  static #refQuery(ref?: string) {
    return ref ? `?ref=${encodeURIComponent(ref)}` : "";
  }

  static #describeFailure(request: string, status: number, body: unknown) {
    const apiError = (body ?? {}) as GithubApiError;
    const errors = apiError.errors
      ?.map((item) => [item.resource, item.field, item.code, item.message].filter(Boolean).join("/"))
      .join(", ");
    return [`${request} -> ${status}`, apiError.message, errors, apiError.documentation_url]
      .filter(Boolean)
      .join(" - ");
  }
}
