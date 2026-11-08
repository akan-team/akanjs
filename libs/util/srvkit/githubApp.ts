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
  GithubAppBot,
  GithubCollaboratorPermission,
  GithubCommitStatus,
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
  GithubRepositoryInstallation,
  GithubUserInstallationsDto,
  GithubWebhookDto,
} from "./githubTypes";
import { PreviewMode } from "./previewMode";

type UtilErrorKey = ConstructorParameters<typeof Err>[0];

interface GithubRequest {
  token?: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: object;
  failure?: UtilErrorKey;
  isTokenRequest?: boolean;
}

interface GithubPageRequest<Page, Item> {
  token: string;
  failure?: UtilErrorKey;
  itemsOf: (page: Page) => Item[] | undefined;
  limit?: number;
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

interface GithubAccountInstallationDto extends GithubInstallationDto {
  account?: { login?: string; type?: string; id?: number };
  target_type?: string;
  permissions?: { [permission: string]: string };
  suspended_at?: string | null;
}

interface GithubCollaboratorPermissionDto {
  permission?: string;
  user?: { login?: string; id?: number } | null;
}

interface GithubUserDto {
  login?: string;
  id?: number;
}

interface GithubRepositoryAccessDto {
  id: number;
  name?: string;
  owner?: { login?: string };
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; triage?: boolean; pull?: boolean };
}

interface GithubWebhookTarget extends GithubRepoRef {
  webhookUrl: string;
  webhookSecret?: string;
}

interface GithubRefDto {
  ref?: string;
  object?: { sha?: string };
}

interface GithubPullRequestDto {
  number: number;
  html_url?: string;
  state?: string;
  merged?: boolean;
  merged_at?: string | null;
  draft?: boolean;
  mergeable?: boolean | null;
  head?: { ref?: string; sha?: string; repo?: { full_name?: string } | null };
  base?: { ref?: string };
  body?: string | null;
}

interface GithubPullRequestCommitDto {
  commit?: { message?: string; author?: { name?: string; email?: string } | null };
  author?: { login?: string } | null;
}

interface GithubRepositoryMergeDto {
  squash_merge_commit_message?: string;
}

interface GithubMergeDto {
  sha?: string;
  merged?: boolean;
}

interface GithubIssueCommentDto {
  id: number;
  html_url?: string;
}

interface GithubCompareCountDto extends GithubCompareDto {
  ahead_by?: number;
  behind_by?: number;
}

export interface GithubPullRequestSummary {
  number: number;
  url: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  headRef: string;
  headSha: string;
  headRepo: string | null; // `owner/repo` of the head branch, null once that repository is gone
  baseRef: string;
  mergeable: boolean | null; // null until GitHub has computed it, and always in a listing
}

export interface GithubRefComparison {
  status: "ahead" | "behind" | "diverged" | "identical";
  aheadBy: number;
  behindBy: number;
}

export interface GithubPullRequestCommit {
  message: string;
  authorName: string;
  authorEmail: string;
  authorLogin: string | null; // the GitHub account the author email belongs to, null when GitHub knows none
}

export type GithubSquashMessage = "PR_BODY" | "COMMIT_MESSAGES" | "BLANK";

export interface GithubBranchRule {
  type: string;
  ruleset_source_type?: string; // "Repository" | "Organization" | "Enterprise"
  ruleset_source?: string; // `owner/repo` for a repository ruleset, the org login for an org one
  ruleset_id?: number;
  parameters?: {
    required_approving_review_count?: number;
    required_status_checks?: { context?: string; integration_id?: number | null }[];
  };
}

export interface GithubRulesetBypassActor {
  actor_id?: number | null;
  actor_type?: string; // "Integration" | "OrganizationAdmin" | "RepositoryRole" | "Team" | "DeployKey"
  bypass_mode?: string;
}

export interface GithubRuleset {
  id: number;
  source_type?: string;
  source?: string;
  enforcement?: string; // "active" | "evaluate" | "disabled"
  bypass_actors?: GithubRulesetBypassActor[]; // only shown to a caller who may edit the ruleset
  current_user_can_bypass?: string; // "always" | "pull_requests_only" | "never" | "exempt", repository endpoint only
}

export interface GithubBranchProtection {
  required_status_checks?: { contexts?: string[]; checks?: { context?: string; app_id?: number | null }[] } | null;
  enforce_admins?: { enabled?: boolean } | null;
  required_pull_request_reviews?: {
    required_approving_review_count?: number;
    bypass_pull_request_allowances?: { apps?: { id?: number; slug?: string }[] } | null;
  } | null;
  allow_force_pushes?: { enabled?: boolean } | null;
  allow_deletions?: { enabled?: boolean } | null;
}

export class GithubApp extends adapt("githubApp", ({ env }) => ({
  options: env((options: ModulesOptions) => options.githubAppInfo),
})) {
  static readonly #baseUrl = "https://api.github.com";
  static readonly #pageSize = 100;
  static readonly #compareFilesLimit = 300;
  static readonly #pullCommitsLimit = 250;
  static readonly #webhookEvents = ["push", "pull_request"];
  static readonly #statusDescriptionLimit = 140;
  #appBot: Promise<GithubAppBot> | null = null;

  get configured() {
    return !!this.options;
  }
  get appId() {
    return this.#requireOptions().id;
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
      isTokenRequest = false,
    }: GithubRequest & { allowNotFound?: AllowNotFound } = {},
  ): Promise<AllowNotFound extends true ? T | null : T> {
    //? Refused, not skipped like a send: a preview's code is unreviewed, and every write's caller reads GitHub's answer.
    if (method && !isTokenRequest && PreviewMode.isOn())
      throw new Err("util.error.githubWriteInPreview", { request: `${method} ${path}` });
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
      const retryAfterMs = GithubApp.#retryAfterMsOf(response, data);
      throw new Err(failure, {
        status: response.status,
        reason,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
    }
    return data as AllowNotFound extends true ? T | null : T;
  }

  //? GitHub's rate-limit contract: `retry-after` in seconds first, then the reset epoch once no request remains, then
  //? at least a minute for a secondary limit that names neither.
  static #retryAfterMsOf({ status, headers }: Response, data: unknown): number | undefined {
    const retryAfter = Number(headers.get("retry-after") ?? Number.NaN);
    if (Number.isFinite(retryAfter)) return Math.max(0, retryAfter * 1000);
    if (status !== 403 && status !== 429) return undefined;
    const reset = Number(headers.get("x-ratelimit-reset") ?? Number.NaN);
    if (headers.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset))
      return Math.max(0, reset * 1000 - Date.now());
    const message = (data as { message?: unknown } | null)?.message;
    return status === 429 || (typeof message === "string" && /rate limit/i.test(message)) ? 60_000 : undefined;
  }

  async #paginate<Page, Item>(path: string, { token, failure, itemsOf, limit }: GithubPageRequest<Page, Item>) {
    const items: Item[] = [];
    const separator = path.includes("?") ? "&" : "?";
    for (let page = 1; ; page += 1) {
      const pageUrl = `${path}${separator}per_page=${GithubApp.#pageSize}&page=${page}`;
      const pageItems = itemsOf(await this.#api<Page>(pageUrl, { token, failure }));
      if (!Array.isArray(pageItems))
        throw new Err(failure ?? "util.error.githubApiFailed", { reason: `GET ${pageUrl} returned no list` });
      items.push(...pageItems);
      if (pageItems.length < GithubApp.#pageSize || (limit !== undefined && items.length >= limit)) break;
    }
    return limit === undefined ? items : items.slice(0, limit);
  }

  async getAccessToken(code: string): Promise<GithubAccessToken> {
    const { clientId, clientSecret } = this.#requireOptions();
    const data = await this.#api<GithubAccessTokenDto | GithubOAuthErrorDto | null>(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        body: { client_id: clientId, client_secret: clientSecret, code },
        failure: "util.error.githubAccessTokenExchangeFailed",
        isTokenRequest: true,
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
    return await this.#api<GithubRepositoryAccessDto, true>(GithubApp.#repoPath(owner, repo), {
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
    const repositories = await this.#paginate(`${GithubApp.#orgPath(org)}/repos?type=all&sort=updated`, {
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
    const installationPath = GithubApp.#installationPath("app", installationId);
    const result = await this.#api<GithubInstallationGrantDto>(`${installationPath}/access_tokens`, {
      token: await this.#createAppJwt(),
      method: "POST",
      ...(scoped
        ? { body: { ...(repositories ? { repositories } : {}), ...(permissions ? { permissions } : {}) } }
        : {}),
      failure: "util.error.githubInstallationAccessTokenCreateFailed",
      isTokenRequest: true,
    });
    const token = toGithubInstallationAccessToken(result);
    if (!token)
      throw new Err("util.error.githubInstallationAccessTokenCreateFailed", { reason: "no token in the response" });
    const overGrant = GithubApp.#overGrant(result, { repositories, permissions });
    if (overGrant) throw new Err("util.error.githubInstallationAccessTokenCreateFailed", { reason: overGrant });
    return token;
  }

  //? An installation token outlives the window it was made for by up to an hour unless it is handed back.
  async revokeInstallationToken(accessToken: string) {
    await this.#api("/installation/token", {
      token: accessToken,
      method: "DELETE",
      failure: "util.error.githubInstallationAccessTokenRevokeFailed",
      isTokenRequest: true,
    });
  }

  //? A user token lists only the installation's repositories that user can reach, where an installation token lists all.
  async listUserInstallationRepositories(installationId: string, accessToken: string): Promise<GithubRepository[]> {
    const repositories = await this.#paginate(`${GithubApp.#installationPath("user", installationId)}/repositories`, {
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
  }): Promise<GithubRepositoryInstallation | null> {
    const installation = await this.#api<GithubAccountInstallationDto, true>(
      `${GithubApp.#repoPath(owner, repo)}/installation`,
      { token: await this.#createAppJwt(), allowNotFound: true },
    );
    if (!installation) return null;
    return {
      id: installation.id.toString(),
      accountLogin: installation.account?.login ?? owner,
      accountId: installation.account?.id?.toString() ?? "",
      accountType: installation.account?.type ?? installation.target_type ?? "",
      permissions: installation.permissions ?? {},
      suspended: !!installation.suspended_at,
    };
  }

  //? Where GitHub shows the installation's owner the permissions the App asks for and has not been granted yet.
  static installationSettingsUrl({
    id,
    accountLogin,
    accountType,
  }: Pick<GithubRepositoryInstallation, "id" | "accountLogin" | "accountType">): string | null {
    if (!GithubApp.#installationId.test(id)) return null;
    if (accountType === "User") return `https://github.com/settings/installations/${id}`;
    if (accountType === "Organization" && GithubApp.#accountName.test(accountLogin))
      return `https://github.com/organizations/${accountLogin}/settings/installations/${id}`;
    return null;
  }

  //? Answered for any login GitHub knows, collaborator or not, and 404 for one it does not.
  async getCollaboratorPermission({
    owner,
    repo,
    username,
    accessToken,
  }: GithubRepoRef & { username: string }): Promise<GithubCollaboratorPermission | null> {
    if (!GithubApp.#accountName.test(username)) throw new Err("util.error.githubInvalidName", { name: username });
    const answer = await this.#api<GithubCollaboratorPermissionDto, true>(
      `${GithubApp.#repoPath(owner, repo)}/collaborators/${username}/permission`,
      { token: accessToken, allowNotFound: true },
    );
    if (!answer) return null;
    return { permission: answer.permission ?? "none", userId: answer.user?.id?.toString() ?? "" };
  }

  //? The bot account GitHub attributes the App's own commits to. `/users/{slug}[bot]` refuses the App's JWT, so the
  //? id is read with an installation token.
  async getAppBot(accessToken: string): Promise<GithubAppBot> {
    this.#appBot ??= this.#readAppBot(accessToken).catch((error: unknown) => {
      this.#appBot = null;
      throw error;
    });
    return await this.#appBot;
  }

  async #readAppBot(accessToken: string): Promise<GithubAppBot> {
    const { slug } = await this.#api<{ slug?: string }>("/app", { token: await this.#createAppJwt() });
    if (!slug || !GithubApp.#accountName.test(slug))
      throw new Err("util.error.githubApiFailed", { reason: "GET /app returned no usable slug" });
    const login = `${slug}[bot]`;
    const user = await this.#api<GithubUserDto>(`/users/${encodeURIComponent(login)}`, { token: accessToken });
    if (!user.id) throw new Err("util.error.githubApiFailed", { reason: `GET /users/${login} returned no id` });
    return { login: user.login ?? login, id: user.id.toString() };
  }

  async getInstallation(installationId: string) {
    //? Stored ids once came straight from a query string; anything but digits would steer the App's JWT elsewhere.
    if (!GithubApp.#installationId.test(installationId)) return null;
    const installation = await this.#api<GithubAccountInstallationDto, true>(
      GithubApp.#installationPath("app", installationId),
      { token: await this.#createAppJwt(), allowNotFound: true },
    );
    if (!installation) return null;
    return {
      id: installation.id.toString(),
      accountLogin: installation.account?.login ?? "",
      accountType: installation.account?.type ?? installation.target_type ?? "",
    };
  }

  async listRepositoryAppNames({ owner, repo, accessToken, ref }: GithubRepoRef & { ref?: string }) {
    const contents = await this.#api<GithubContentDto[] | GithubContentDto>(
      `${GithubApp.#repoPath(owner, repo)}/contents/apps${GithubApp.#refQuery(ref)}`,
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
      `${GithubApp.#repoPath(owner, repo)}/contents/${path}${GithubApp.#refQuery(ref)}`,
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
      `${GithubApp.#repoPath(owner, repo)}/contents/${path}${GithubApp.#refQuery(ref)}`,
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
  async compareFiles(range: GithubRepoRef & { base: string; head: string }) {
    const comparison = await this.#compare(range);
    if (comparison?.status === "identical") return [];
    if (comparison?.status !== "ahead") return null;
    return GithubApp.#changedPaths(comparison);
  }

  //? A three-dot compare lists what head changed since its merge base with base, so a pull request head that has
  //? `diverged` from a base that moved on still yields its own diff.
  async mergeBaseFiles(range: GithubRepoRef & { base: string; head: string }) {
    const comparison = await this.#compare(range);
    if (comparison?.status === "identical" || comparison?.status === "behind") return [];
    if (comparison?.status !== "ahead" && comparison?.status !== "diverged") return null;
    return GithubApp.#changedPaths(comparison);
  }

  async #compare({ owner, repo, accessToken, base, head }: GithubRepoRef & { base: string; head: string }) {
    return await this.#api<GithubCompareDto, true>(
      `${GithubApp.#repoPath(owner, repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
      { token: accessToken, allowNotFound: true },
    );
  }

  static #changedPaths({ files }: GithubCompareDto) {
    if (!files || files.length >= GithubApp.#compareFilesLimit) return null;
    return [
      ...new Set(files.flatMap((file) => [file.filename, ...(file.previous_filename ? [file.previous_filename] : [])])),
    ];
  }

  //? Null when either ref is unknown to GitHub, by branch name or by sha.
  async compareRefs({
    owner,
    repo,
    accessToken,
    base,
    head,
  }: GithubRepoRef & { base: string; head: string }): Promise<GithubRefComparison | null> {
    const comparison = await this.#api<GithubCompareCountDto, true>(
      `${GithubApp.#repoPath(owner, repo)}/compare/${GithubApp.#refName(base)}...${GithubApp.#refName(head)}?per_page=1`,
      { token: accessToken, allowNotFound: true },
    );
    if (!comparison?.status) return null;
    return { status: comparison.status, aheadBy: comparison.ahead_by ?? 0, behindBy: comparison.behind_by ?? 0 };
  }

  async getBranchHead({ owner, repo, accessToken, branch }: GithubRepoRef & { branch: string }) {
    const ref = await this.#api<GithubRefDto, true>(
      `${GithubApp.#repoPath(owner, repo)}/git/ref/heads/${GithubApp.#branchName(branch)}`,
      { token: accessToken, allowNotFound: true },
    );
    return ref?.ref === `refs/heads/${branch}` && ref.object?.sha ? ref.object.sha : null;
  }

  async createBranch({ owner, repo, accessToken, branch, sha }: GithubRepoRef & { branch: string; sha: string }) {
    await this.#api(`${GithubApp.#repoPath(owner, repo)}/git/refs`, {
      token: accessToken,
      method: "POST",
      body: { ref: `refs/heads/${GithubApp.#branchName(branch)}`, sha: GithubApp.#sha(sha) },
    });
  }

  //? Every rule an active repository or organization ruleset puts on the branch, each naming the ruleset it came from.
  async getBranchRules({ owner, repo, accessToken, branch }: GithubRepoRef & { branch: string }) {
    return await this.#paginate(`${GithubApp.#repoPath(owner, repo)}/rules/branches/${GithubApp.#branchName(branch)}`, {
      token: accessToken,
      itemsOf: (page: GithubBranchRule[]) => page,
    });
  }

  async getRepoRuleset({ owner, repo, accessToken, rulesetId }: GithubRepoRef & { rulesetId: number }) {
    return await this.#api<GithubRuleset>(
      `${GithubApp.#repoPath(owner, repo)}/rulesets/${GithubApp.#rulesetId(rulesetId)}?includes_parents=true`,
      { token: accessToken },
    );
  }

  async getOrgRuleset({ org, accessToken, rulesetId }: { org: string; accessToken: string; rulesetId: number }) {
    return await this.#api<GithubRuleset>(`${GithubApp.#orgPath(org)}/rulesets/${GithubApp.#rulesetId(rulesetId)}`, {
      token: accessToken,
    });
  }

  //? Null is GitHub's 404 for a branch with no classic protection; a token without `administration: read` gets 403.
  async getBranchProtection({ owner, repo, accessToken, branch }: GithubRepoRef & { branch: string }) {
    return await this.#api<GithubBranchProtection, true>(
      `${GithubApp.#repoPath(owner, repo)}/branches/${GithubApp.#branchName(branch)}/protection`,
      { token: accessToken, allowNotFound: true },
    );
  }

  //? GitHub filters by `owner:branch`, so a fork's branch of the same name is never listed.
  async listOpenPullRequests({ owner, repo, accessToken, head }: GithubRepoRef & { head: string }) {
    const query = new URLSearchParams({ state: "open", head: `${owner}:${GithubApp.#branchName(head)}` });
    const pulls = await this.#paginate(`${GithubApp.#repoPath(owner, repo)}/pulls?${query.toString()}`, {
      token: accessToken,
      itemsOf: (page: GithubPullRequestDto[]) => page,
    });
    return pulls.map((pull) => GithubApp.#pullRequestOf(pull));
  }

  async createPullRequest({
    owner,
    repo,
    accessToken,
    head,
    base,
    title,
    body,
    draft,
  }: GithubRepoRef & { head: string; base: string; title: string; body?: string; draft?: boolean }) {
    const pull = await this.#api<GithubPullRequestDto>(`${GithubApp.#repoPath(owner, repo)}/pulls`, {
      token: accessToken,
      method: "POST",
      body: {
        title,
        head: GithubApp.#branchName(head),
        base: GithubApp.#branchName(base),
        ...(body ? { body } : {}),
        ...(draft ? { draft: true } : {}),
      },
    });
    return GithubApp.#pullRequestOf(pull);
  }

  async getPullRequest({ owner, repo, accessToken, number }: GithubRepoRef & { number: number }) {
    const pull = await this.#api<GithubPullRequestDto, true>(GithubApp.#pullPath(owner, repo, number), {
      token: accessToken,
      allowNotFound: true,
    });
    return pull ? GithubApp.#pullRequestOf(pull) : null;
  }

  async getPullRequestBody({ owner, repo, accessToken, number }: GithubRepoRef & { number: number }) {
    const pull = await this.#api<GithubPullRequestDto>(GithubApp.#pullPath(owner, repo, number), {
      token: accessToken,
    });
    return pull.body ?? "";
  }

  //? GitHub lists at most 250 commits of a pull request.
  async listPullRequestCommits({
    owner,
    repo,
    accessToken,
    number,
  }: GithubRepoRef & { number: number }): Promise<GithubPullRequestCommit[]> {
    const commits = await this.#paginate(`${GithubApp.#pullPath(owner, repo, number)}/commits`, {
      token: accessToken,
      itemsOf: (page: GithubPullRequestCommitDto[]) => page,
      limit: GithubApp.#pullCommitsLimit,
    });
    return commits.map(({ commit, author }) => ({
      message: commit?.message ?? "",
      authorName: commit?.author?.name ?? "",
      authorEmail: commit?.author?.email ?? "",
      authorLogin: author?.login ?? null,
    }));
  }

  async getSquashMergeCommitMessage({ owner, repo, accessToken }: GithubRepoRef): Promise<GithubSquashMessage | null> {
    const { squash_merge_commit_message: setting } = await this.#api<GithubRepositoryMergeDto>(
      GithubApp.#repoPath(owner, repo),
      { token: accessToken },
    );
    return setting === "PR_BODY" || setting === "COMMIT_MESSAGES" || setting === "BLANK" ? setting : null;
  }

  //? `sha` has GitHub refuse with 409 a head that moved after the caller read it, so what merges is what was checked.
  async squashMergePullRequest({
    owner,
    repo,
    accessToken,
    number,
    sha,
    title,
    message,
  }: GithubRepoRef & { number: number; sha: string; title: string; message?: string }) {
    const merge = await this.#api<GithubMergeDto>(`${GithubApp.#pullPath(owner, repo, number)}/merge`, {
      token: accessToken,
      method: "PUT",
      body: {
        merge_method: "squash",
        sha: GithubApp.#sha(sha),
        commit_title: title,
        ...(message ? { commit_message: message } : {}),
      },
    });
    if (!merge.merged || !merge.sha)
      throw new Err("util.error.githubApiFailed", { reason: `PUT pulls/${number}/merge returned no merge commit` });
    return { sha: merge.sha };
  }

  async closePullRequest({ owner, repo, accessToken, number }: GithubRepoRef & { number: number }) {
    const pull = await this.#api<GithubPullRequestDto>(GithubApp.#pullPath(owner, repo, number), {
      token: accessToken,
      method: "PATCH",
      body: { state: "closed" },
    });
    return GithubApp.#pullRequestOf(pull);
  }

  //? A pull request's conversation is its issue's, which `pull_requests: write` may comment on.
  async commentOnPullRequest({
    owner,
    repo,
    accessToken,
    number,
    body,
  }: GithubRepoRef & { number: number; body: string }) {
    const comment = await this.#api<GithubIssueCommentDto>(
      `${GithubApp.#repoPath(owner, repo)}/issues/${GithubApp.#pullNumber(number)}/comments`,
      { token: accessToken, method: "POST", body: { body } },
    );
    return { id: comment.id.toString(), url: comment.html_url ?? "" };
  }

  //? GitHub merges the base into the head branch, and refuses with 422 a head that moved from `expectedHeadSha`.
  async updatePullRequestBranch({
    owner,
    repo,
    accessToken,
    number,
    expectedHeadSha,
  }: GithubRepoRef & { number: number; expectedHeadSha: string }) {
    await this.#api(`${GithubApp.#pullPath(owner, repo, number)}/update-branch`, {
      token: accessToken,
      method: "PUT",
      body: { expected_head_sha: GithubApp.#sha(expectedHeadSha) },
    });
  }

  static #pullRequestOf(pull: GithubPullRequestDto): GithubPullRequestSummary {
    return {
      number: pull.number,
      url: pull.html_url ?? "",
      state: pull.merged || pull.merged_at ? "merged" : pull.state === "closed" ? "closed" : "open",
      draft: !!pull.draft,
      headRef: pull.head?.ref ?? "",
      headSha: pull.head?.sha ?? "",
      headRepo: pull.head?.repo?.full_name ?? null,
      baseRef: pull.base?.ref ?? "",
      mergeable: pull.mergeable ?? null,
    };
  }

  async createCommitStatus({
    owner,
    repo,
    accessToken,
    sha,
    state,
    context,
    description,
    targetUrl,
  }: GithubRepoRef & GithubCommitStatus) {
    if (!GithubApp.#commitSha.test(sha)) throw new Err("util.error.githubInvalidCommitSha", { sha });
    await this.#api(`${GithubApp.#repoPath(owner, repo)}/statuses/${sha}`, {
      token: accessToken,
      method: "POST",
      body: {
        state,
        context,
        description: GithubApp.#statusDescription(description),
        ...(targetUrl ? { target_url: targetUrl } : {}),
      },
      failure: "util.error.githubCommitStatusCreateFailed",
    });
  }

  //? GitHub refuses a status whose description runs past 140 characters with a 422.
  static #statusDescription(description: string) {
    const chars = Array.from(description);
    const limit = GithubApp.#statusDescriptionLimit;
    return chars.length > limit ? `${chars.slice(0, limit - 1).join("")}…` : description;
  }

  async registerWebhook({ owner, repo, accessToken, webhookUrl, webhookSecret }: GithubWebhookTarget) {
    return await this.#api<GithubWebhookDto>(`${GithubApp.#repoPath(owner, repo)}/hooks`, {
      token: accessToken,
      method: "POST",
      body: {
        name: "web",
        active: true,
        events: GithubApp.#webhookEvents,
        config: { url: webhookUrl, content_type: "json", secret: webhookSecret },
      },
      failure: "util.error.githubWebhookRegisterFailed",
    });
  }

  async listWebhooks({ owner, repo, accessToken }: GithubRepoRef) {
    return await this.#paginate(`${GithubApp.#repoPath(owner, repo)}/hooks`, {
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
    await this.#api(`${GithubApp.#repoPath(owner, repo)}/hooks/${hookId}/config`, {
      token: accessToken,
      method: "PATCH",
      body: { url: webhookUrl, content_type: "json", secret: webhookSecret },
      failure: "util.error.githubWebhookUpdateFailed",
    });
  }

  /**
   * Register the webhook only when the repository does not already carry one for this URL.
   * Re-importing a repository used to POST a second identical hook, which made GitHub deliver every push
   * twice — two builds racing on the same scheduler key.
   *
   * An existing hook still gets its config rewritten: GitHub never returns a hook's secret, so the only way to
   * know it matches the one the receiver verifies with is to set it, and a rotated secret has no other way in.
   */
  async ensureWebhook(target: GithubWebhookTarget): Promise<{ id: number; created: boolean }> {
    const existing = (await this.listWebhooks(target)).find((hook) => hook.config?.url === target.webhookUrl);
    if (existing) {
      //? GitHub documents that a hook PATCH which does not repeat the secret removes it, so the config write goes last.
      await this.#subscribeWebhook(target, existing);
      await this.updateWebhookConfig({ ...target, hookId: existing.id });
      return { id: existing.id, created: false };
    }
    const created = await this.registerWebhook(target);
    return { id: created.id, created: true };
  }

  //? `add_events` keeps every event someone else subscribed the hook to; `events` would replace the list.
  async #subscribeWebhook({ owner, repo, accessToken }: GithubRepoRef, hook: GithubWebhookDto) {
    const subscribed = hook.events ?? [];
    if (subscribed.includes("*")) return;
    const missing = GithubApp.#webhookEvents.filter((event) => !subscribed.includes(event));
    if (!missing.length) return;
    await this.#api(`${GithubApp.#repoPath(owner, repo)}/hooks/${hook.id}`, {
      token: accessToken,
      method: "PATCH",
      body: { add_events: missing },
      failure: "util.error.githubWebhookUpdateFailed",
    });
  }

  async hasWebhook({ webhookUrl, ...repoRef }: GithubRepoRef & { webhookUrl: string }) {
    const hooks = await this.listWebhooks(repoRef);
    return hooks.some((hook) => hook.config?.url === webhookUrl);
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

  //? `#api` concatenates, and URL parsing resolves `..` and `%2e` and cuts at `?` or `#`: an unchecked name aims a
  //? request, the App's own JWT included, at any endpoint on api.github.com.
  static readonly #accountName = /^[A-Za-z0-9][A-Za-z0-9_-]{0,38}$/;
  static readonly #repoName = /^[A-Za-z0-9._-]{1,100}$/;
  static readonly #installationId = /^\d+$/;
  static readonly #commitSha = /^[0-9a-f]{40}$/i;
  //? Git's ref rules, narrowed to names a path carries unencoded: each segment starts with a letter, digit or `_`, and
  //? no `..`, `.lock` segment or trailing dot.
  static readonly #branchPattern = /^[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/;

  static #orgPath(org: string) {
    if (!GithubApp.#accountName.test(org)) throw new Err("util.error.githubInvalidName", { name: org });
    return `/orgs/${org}`;
  }

  static #repoPath(owner: string, repo: string) {
    if (!GithubApp.#accountName.test(owner) || !GithubApp.#repoName.test(repo) || repo === "." || repo === "..")
      throw new Err("util.error.githubInvalidName", { name: `${owner}/${repo}` });
    return `/repos/${owner}/${repo}`;
  }

  static #branchName(branch: string) {
    const valid =
      branch.length <= 200 &&
      GithubApp.#branchPattern.test(branch) &&
      !branch.includes("..") &&
      !/\.lock(?:\/|$)|\.$/.test(branch);
    if (!valid) throw new Err("util.error.githubInvalidName", { name: branch });
    return branch;
  }

  static #sha(sha: string) {
    if (!GithubApp.#commitSha.test(sha)) throw new Err("util.error.githubInvalidCommitSha", { sha });
    return sha;
  }

  static #refName(ref: string) {
    return GithubApp.#commitSha.test(ref) ? ref : GithubApp.#branchName(ref);
  }

  static #rulesetId(rulesetId: number) {
    if (!Number.isSafeInteger(rulesetId) || rulesetId < 1)
      throw new Err("util.error.githubInvalidName", { name: String(rulesetId) });
    return rulesetId;
  }

  static #pullNumber(number: number) {
    if (!Number.isSafeInteger(number) || number < 1)
      throw new Err("util.error.githubInvalidName", { name: String(number) });
    return number;
  }

  static #pullPath(owner: string, repo: string, number: number) {
    return `${GithubApp.#repoPath(owner, repo)}/pulls/${GithubApp.#pullNumber(number)}`;
  }

  static #installationPath(kind: "app" | "user", installationId: string) {
    if (!GithubApp.#installationId.test(installationId))
      throw new Err("util.error.githubInvalidName", { name: installationId });
    return `/${kind}/installations/${installationId}`;
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
