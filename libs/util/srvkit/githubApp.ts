import { createPrivateKey } from "node:crypto";
import { Logger } from "akanjs/common";
import { importPKCS8, SignJWT } from "jose";
import { Err } from "../lib/dict";
import {
  execAsync,
  githubShellQuote,
  isGithubInstallationAccessTokenDto,
  isGithubInstallationDto,
  isGithubInstallationRepositoriesDto,
  isGithubUserInstallationsDto,
  toGithubAccessToken,
  toGithubInfo,
  toGithubInstallationAccessToken,
  toGithubRepository,
} from "./githubApp.helper";
import type {
  GithubAccessToken,
  GithubAccessTokenDto,
  GithubApiError,
  GithubContentDto,
  GithubInfo,
  GithubInfoDto,
  GithubInstallation,
  GithubInstallationAccessToken,
  GithubInstallationAccessTokenDto,
  GithubInstallationDto,
  GithubInstallationRepositoriesDto,
  GithubOptions,
  GithubRepository,
  GithubRepositoryDto,
  GithubUserInstallationsDto,
  GithubWebhookDto,
} from "./githubTypes";

export class GithubApp {
  readonly #logger = new Logger("GithubApp");
  readonly #baseUrl = "https://api.github.com";
  readonly #headers = { Accept: "application/json" };
  readonly #options: GithubOptions;
  constructor(options: GithubOptions) {
    this.#options = options;
  }

  async #api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.#baseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: { ...this.#headers, ...init?.headers },
      signal: AbortSignal.timeout(20_000),
    });
    return (await response.json()) as T;
  }

  async getAccessToken(code: string): Promise<GithubAccessToken> {
    const data = await this.#api<GithubAccessTokenDto>("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: this.#options.clientId, client_secret: this.#options.clientSecret, code }),
    });
    return toGithubAccessToken(data);
  }

  async getGithubInfo(accessToken: string): Promise<GithubInfo> {
    const data = await this.#api<GithubInfoDto>(`/user`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return toGithubInfo(data);
  }

  async listPullRequestFiles({
    owner,
    repo,
    pullNumber,
    accessToken,
  }: {
    owner: string;
    repo: string;
    pullNumber: number;
    accessToken: string;
  }) {
    return await this.#api<string[]>(`/repos/${owner}/${repo}/pulls/${pullNumber}/files`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async createRepository(accessToken: string, repo: string, owner?: string) {
    if (owner) {
      const existing = await this.getRepository({ owner, repo, accessToken });
      if (existing?.id) return existing;
    }

    const result = await this.#api<{ id?: number } & GithubApiError>(`/user/repos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: repo, private: true }),
    });
    if (result.id) return result as { id: number };
    if (owner) {
      const existing = await this.getRepository({ owner, repo, accessToken });
      if (existing?.id) return existing;
    }

    throw new Err("util.error.githubRepositoryCreateFailed", { reason: this.#formatCreateRepositoryError(result) });
  }

  async getRepository({ owner, repo, accessToken }: { owner: string; repo: string; accessToken: string }) {
    const result = await this.#api<{ id?: number } & GithubApiError>(`/repos/${owner}/${repo}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return result.id ? (result as { id: number }) : null;
  }

  async listAllUserRepositories(accessToken: string): Promise<GithubRepository[]> {
    const repositories: GithubRepositoryDto[] = [];
    for (let page = 1; ; page += 1) {
      const pageItems = await this.#api<GithubRepositoryDto[]>(
        `/user/repos?visibility=all&affiliation=owner&sort=updated&per_page=100&page=${page}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      repositories.push(...pageItems);
      if (pageItems.length < 100) break;
    }
    return repositories.map(toGithubRepository);
  }

  async listOrganizationRepositories({
    org,
    accessToken,
  }: {
    org: string;
    accessToken: string;
  }): Promise<GithubRepository[]> {
    const repositories: GithubRepositoryDto[] = [];
    for (let page = 1; ; page += 1) {
      const pageItems = await this.#api<GithubRepositoryDto[] | GithubApiError>(
        `/orgs/${org}/repos?type=all&sort=updated&per_page=100&page=${page}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!Array.isArray(pageItems)) {
        throw new Err("util.error.githubOrganizationRepositoriesListFailed", {
          reason: this.#formatApiError(pageItems),
        });
      }

      repositories.push(...pageItems);
      if (pageItems.length < 100) break;
    }
    return repositories.map(toGithubRepository);
  }

  async createInstallationAccessToken(installationId: string): Promise<GithubInstallationAccessToken> {
    const appJwt = await this.#createAppJwt();
    const result = await this.#api<GithubInstallationAccessTokenDto | GithubApiError>(
      `/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${appJwt}`, "Content-Type": "application/json" },
      },
    );
    if (isGithubInstallationAccessTokenDto(result)) {
      const token = toGithubInstallationAccessToken(result);
      if (token) return token;
    }

    throw new Err("util.error.githubInstallationAccessTokenCreateFailed", { reason: this.#formatApiError(result) });
  }

  async listInstallationRepositories(accessToken: string): Promise<GithubRepository[]> {
    const repositories: GithubRepositoryDto[] = [];
    for (let page = 1; ; page += 1) {
      const pageItems = await this.#api<GithubInstallationRepositoriesDto | GithubApiError>(
        `/installation/repositories?per_page=100&page=${page}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!isGithubInstallationRepositoriesDto(pageItems)) {
        throw new Err("util.error.githubInstallationRepositoriesListFailed", {
          reason: this.#formatApiError(pageItems),
        });
      }

      repositories.push(...pageItems.repositories);
      if (pageItems.repositories.length < 100) break;
    }
    return repositories.map(toGithubRepository);
  }

  async listUserInstallations(accessToken: string): Promise<GithubInstallation[]> {
    const installations: GithubInstallationDto[] = [];
    for (let page = 1; ; page += 1) {
      const pageItems = await this.#api<GithubUserInstallationsDto | GithubApiError>(
        `/user/installations?per_page=100&page=${page}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!isGithubUserInstallationsDto(pageItems)) {
        throw new Err("util.error.githubUserInstallationsListFailed", { reason: this.#formatApiError(pageItems) });
      }

      installations.push(...pageItems.installations);
      if (pageItems.installations.length < 100) break;
    }
    const result = installations.map((installation) => ({
      id: installation.id.toString(),
      accountLogin: installation.account?.login ?? "",
    }));
    return result;
  }

  async getRepositoryInstallation({
    owner,
    repo,
  }: {
    owner: string;
    repo: string;
  }): Promise<GithubInstallation | null> {
    const appJwt = await this.#createAppJwt();
    const result = await this.#api<GithubInstallationDto | GithubApiError>(`/repos/${owner}/${repo}/installation`, {
      headers: { Authorization: `Bearer ${appJwt}` },
    });
    if (!isGithubInstallationDto(result)) return null;
    return { id: result.id.toString(), accountLogin: result.account?.login ?? owner };
  }

  async listRepositoryAppNames({
    owner,
    repo,
    accessToken,
    ref,
  }: {
    owner: string;
    repo: string;
    accessToken: string;
    ref?: string;
  }) {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const contents = await this.#api<GithubContentDto[] | GithubApiError>(
      `/repos/${owner}/${repo}/contents/apps${query}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!Array.isArray(contents)) {
      const reason = this.#formatApiError(contents);
      this.#logger.error(
        `[GithubApp] listRepositoryAppNames failed owner=${owner} repo=${repo} ref=${ref ?? "(default)"} reason=${reason} body=${JSON.stringify(contents)}`,
      );
      throw new Err("util.error.githubRepositoryAppsListFailed", { reason });
    }
    return contents.filter((item) => item.type === "dir").map((item) => item.name);
  }

  /**
   * `apps/*` folders that actually are Akan applications. `listRepositoryAppNames` accepts any directory,
   * which is fine at build time (the folder set is already known-good) but lets a non-Akan repository be
   * imported as a project that can never build.
   */
  async listRepositoryAkanAppNames({
    owner,
    repo,
    accessToken,
    ref,
  }: {
    owner: string;
    repo: string;
    accessToken: string;
    ref?: string;
  }) {
    const appNames = await this.listRepositoryAppNames({ owner, repo, accessToken, ref });
    const checked = await Promise.all(
      appNames.map(async (appName) => ({
        appName,
        isAkanApp: await this.hasRepositoryFile({
          owner,
          repo,
          accessToken,
          ref,
          path: `apps/${appName}/akan.config.ts`,
        }),
      })),
    );
    return checked.filter((item) => item.isAkanApp).map((item) => item.appName);
  }

  async hasRepositoryFile({
    owner,
    repo,
    accessToken,
    path,
    ref,
  }: {
    owner: string;
    repo: string;
    accessToken: string;
    path: string;
    ref?: string;
  }) {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const content = await this.#api<GithubContentDto | GithubApiError>(
      `/repos/${owner}/${repo}/contents/${path}${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return (content as GithubContentDto).type === "file";
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
  }: {
    owner: string;
    repo: string;
    accessToken: string;
    path: string;
    ref?: string;
  }): Promise<string | null> {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const content = await this.#api<GithubContentDto | GithubApiError>(
      `/repos/${owner}/${repo}/contents/${path}${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const file = content as GithubContentDto;
    if (file.type !== "file" || !file.content) return null;
    if (file.encoding && file.encoding !== "base64") return null;
    return Buffer.from(file.content, "base64").toString("utf8");
  }

  async registerWebhook({
    owner,
    repo,
    accessToken,
    webhookUrl,
    webhookSecret,
  }: {
    owner: string;
    repo: string;
    accessToken: string;
    webhookUrl: string;
    webhookSecret?: string;
  }) {
    const hook = await this.#api<GithubWebhookDto | GithubApiError>(`/repos/${owner}/${repo}/hooks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push"],
        config: { url: webhookUrl, content_type: "json", secret: webhookSecret },
      }),
    });
    // #api resolves the error body instead of throwing, so an unvalidated return reported a failed
    // registration as a success.
    if (typeof (hook as GithubWebhookDto).id !== "number")
      throw new Err("util.error.githubWebhookRegisterFailed", { reason: this.#formatApiError(hook) });
    return hook as GithubWebhookDto;
  }

  async listWebhooks({ owner, repo, accessToken }: { owner: string; repo: string; accessToken: string }) {
    const hooks = await this.#api<GithubWebhookDto[] | GithubApiError>(`/repos/${owner}/${repo}/hooks`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!Array.isArray(hooks))
      throw new Err("util.error.githubWebhookListFailed", { reason: this.#formatApiError(hooks) });
    return hooks;
  }

  /**
   * Register the push webhook only when the repository does not already carry one for this URL.
   * Re-importing a repository used to POST a second identical hook, which made GitHub deliver every push
   * twice — two builds racing on the same scheduler key.
   */
  async ensureWebhook({
    owner,
    repo,
    accessToken,
    webhookUrl,
    webhookSecret,
  }: {
    owner: string;
    repo: string;
    accessToken: string;
    webhookUrl: string;
    webhookSecret?: string;
  }): Promise<{ id: number; created: boolean }> {
    const existing = (await this.listWebhooks({ owner, repo, accessToken })).find(
      (hook) => hook.config?.url === webhookUrl,
    );
    if (existing) return { id: existing.id, created: false };
    const created = await this.registerWebhook({ owner, repo, accessToken, webhookUrl, webhookSecret });
    return { id: created.id, created: true };
  }

  async hasWebhook({
    owner,
    repo,
    accessToken,
    webhookUrl,
  }: {
    owner: string;
    repo: string;
    accessToken: string;
    webhookUrl: string;
  }) {
    const hooks = await this.listWebhooks({ owner, repo, accessToken });
    return hooks.some((hook) => hook.config?.url === webhookUrl);
  }

  async publishWorkspace({
    id,
    login,
    accessToken,
    repo,
    projectPath,
    branch = "main",
    message,
  }: {
    id: string;
    login: string;
    accessToken: string;
    repo: string;
    projectPath: string;
    branch?: string;
    message?: string;
  }) {
    const authorEmail = `${id}+${login}@users.noreply.github.com`;
    const commitMessage = message ?? `Deploy by ${login}`;
    const projectPathArg = githubShellQuote(projectPath);
    const remoteUrlArg = `"https://x-access-token:${accessToken}@github.com/${login}/${repo}.git"`;

    await this.#execGit(`git -C ${projectPathArg} add .`);

    const hasChanges = await this.#hasStagedChanges(projectPathArg);
    if (hasChanges) {
      await this.#execGit(
        `git -C ${projectPathArg} -c user.name=${githubShellQuote(login)} -c user.email=${githubShellQuote(
          authorEmail,
        )} commit -m ${githubShellQuote(commitMessage)}`,
      );
    }

    await this.#execGit(`git -C ${projectPathArg} push ${remoteUrlArg} HEAD:${githubShellQuote(branch)}`, {
      GITHUB_TOKEN: accessToken,
    });
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

  async #hasStagedChanges(projectPathArg: string) {
    try {
      await this.#execGit(`git -C ${projectPathArg} diff --cached --quiet`);
      return false;
    } catch {
      return true;
    }
  }

  async #execGit(command: string, env: Record<string, string> = {}) {
    return await execAsync(command, {
      env: { ...process.env, ...env },
      maxBuffer: 1024 * 1024 * 10,
    });
  }

  async #createAppJwt() {
    if (!this.#options.privateKey) throw new Err("util.error.githubPrivateKeyNotConfigured");

    const now = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(this.#normalizePrivateKey(), "RS256");
    return await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 9 * 60)
      .setIssuer(this.#options.id)
      .sign(key);
  }

  #normalizePrivateKey() {
    const privateKey = this.#options.privateKey?.replace(/\\n/g, "\n") ?? "";
    if (!privateKey.includes("BEGIN RSA PRIVATE KEY")) return privateKey;

    return createPrivateKey(privateKey).export({
      format: "pem",
      type: "pkcs8",
    }) as string;
  }

  #formatApiError(error: unknown) {
    const apiError = error as GithubApiError;
    const errors =
      apiError.errors
        ?.map((item) => [item.resource, item.field, item.code, item.message].filter(Boolean).join("/"))
        .join(", ") ?? "";
    return (
      [apiError.message, errors, apiError.documentation_url].filter(Boolean).join(" - ") || "Unknown GitHub API error"
    );
  }

  #formatCreateRepositoryError(error: unknown) {
    const message = this.#formatApiError(error);
    const apiError = error as GithubApiError;
    if (apiError.message === "Resource not accessible by integration") {
      return `${message}. GitHub repository creation requires Repository Administration write permission. Update the GitHub App permissions and reconnect GitHub, or use a token that can create private repositories.`;
    }
    return message;
  }
}
