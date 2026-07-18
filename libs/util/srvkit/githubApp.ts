import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { PushEvent } from "@octokit/webhooks-types";
import { type Dayjs, dayjs } from "akanjs/base";

export type GithubPushEvent = PushEvent;
const execAsync = promisify(exec);

// id: field(String).optional(),
// login: field(String), // 유저네임 (예: "octocat")
// node_id: field(String),
// type: field(String),
// name: field(String),
// site_admin: field(Boolean),
// accessToken: field.secret(String).optional(),
// expiresAt: field(Date).optional(),
// refreshToken: field.secret(String).optional(),
// installationId: field(String).optional(),
// company: field(String).optional(),
// blog: field(String).optional(),
// location: field(String).optional(),
// email: field(String).optional(),

type GithubAccessTokenDto = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
};
export type GithubAccessToken = {
  accessToken: string;
  expiresAt: Dayjs;
  refreshToken: string;
};
const toGithubAccessToken = (dto: GithubAccessTokenDto): GithubAccessToken => {
  return {
    accessToken: dto.access_token,
    expiresAt: dayjs().add(dto.expires_in, "seconds"),
    refreshToken: dto.refresh_token,
  };
};

type GithubInfoDto = {
  id: number;
  login: string;
  node_id: string;
  type: string;
  name: string;
  site_admin: boolean;
  installation_id: string;
  company: string;
  blog: string;
  location: string;
  email: string;
};

export type GithubInfo = {
  id: string;
  login: string;
  nodeId: string;
  type: string;
  name: string;
  siteAdmin: boolean;
  installationId: string;
  company: string;
  blog: string;
  location: string;
  email: string;
};

const toGithubInfo = (dto: GithubInfoDto): GithubInfo => {
  return {
    id: dto.id.toString(),
    login: dto.login,
    nodeId: dto.node_id,
    type: dto.type,
    name: dto.name,
    siteAdmin: dto.site_admin,
    installationId: dto.installation_id,
    company: dto.company,
    blog: dto.blog,
    location: dto.location,
    email: dto.email,
  };
};

type GithubApiError = {
  message?: string;
  errors?: { resource?: string; field?: string; code?: string; message?: string }[];
  documentation_url?: string;
};

const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

export class GithubApp {
  readonly #baseUrl = "https://api.github.com";
  readonly #headers = { Accept: "application/json" };

  #tokenMap = new Map<string, GithubInfo>();
  #tokenRefreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // init() {
  //   this.#tokenMap.clear();
  //   this.#tokenRefreshTimer = null;
  //   this.#tokenRefreshTimer = setInterval(
  //     () => {
  //       this.#tokenMap.forEach(async (githubInfo) => {
  //         const freshGithubInfo = await this.getFreshAccessToken(githubInfo);
  //         this.#tokenMap.set(githubInfo.id, freshGithubInfo);
  //       });
  //     },
  //     1000 * 60 * 60,
  //   );
  // }
  // destroy() {
  //   if (this.#tokenRefreshTimer) clearInterval(this.#tokenRefreshTimer);
  //   this.#tokenMap.clear();
  //   this.#tokenRefreshTimer = null;
  // }

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
      body: JSON.stringify({ client_id: this.clientId, client_secret: this.clientSecret, code }),
    });
    return toGithubAccessToken(data);
  }
  // async getFreshAccessToken(githubInfo: GithubInfo): Promise<GithubInfo> {
  //   if (githubInfo.expiresAt.isAfter(dayjs())) return githubInfo;
  //   const { accessToken, expiresAt, refreshToken } = await this.refreshAccessToken(githubInfo.refreshToken);
  //   return { ...githubInfo, accessToken, expiresAt, refreshToken };
  // }
  // async refreshAccessToken(refreshToken: string): Promise<GithubAccessToken> {
  //   const data = await this.#api<GithubAccessTokenDto>("https://github.com/login/oauth/access_token", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json", Accept: "application/json" },
  //     body: JSON.stringify({
  //       client_id: this.clientId,
  //       client_secret: this.clientSecret,
  //       grant_type: "refresh_token",
  //       refresh_token: refreshToken,
  //     }),
  //   });
  //   return toGithubAccessToken(data);
  // }
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
    const result = await this.#api<{ id?: number } & GithubApiError>(`/user/repos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: repo }),
    });
    if (result.id) return result as { id: number };
    if (owner) {
      const existing = await this.getRepository({ owner, repo, accessToken });
      if (existing?.id) return existing;
    }

    throw new Error(`Failed to create repository: ${this.#formatApiError(result)}`);
  }

  async getRepository({ owner, repo, accessToken }: { owner: string; repo: string; accessToken: string }) {
    const result = await this.#api<{ id?: number } & GithubApiError>(`/repos/${owner}/${repo}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return result.id ? (result as { id: number }) : null;
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
    return await this.#api<{ id: number }>(`/repos/${owner}/${repo}/hooks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push"],
        config: { url: webhookUrl, content_type: "json", secret: webhookSecret },
      }),
    });
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
    const projectPathArg = shellQuote(projectPath);
    const remoteUrlArg = `"https://x-access-token:${accessToken}@github.com/${login}/${repo}.git"`;

    await this.#execGit(`git -C ${projectPathArg} add .`);

    const hasChanges = await this.#hasStagedChanges(projectPathArg);
    if (hasChanges) {
      await this.#execGit(
        `git -C ${projectPathArg} -c user.name=${shellQuote(login)} -c user.email=${shellQuote(
          authorEmail,
        )} commit -m ${shellQuote(commitMessage)}`,
      );
    }

    await this.#execGit(`git -C ${projectPathArg} push ${remoteUrlArg} HEAD:${shellQuote(branch)}`, {
      GITHUB_TOKEN: accessToken,
    });
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

  #formatApiError(error: GithubApiError) {
    const errors =
      error.errors
        ?.map((item) => [item.resource, item.field, item.code, item.message].filter(Boolean).join("/"))
        .join(", ") ?? "";
    return [error.message, errors, error.documentation_url].filter(Boolean).join(" - ") || "Unknown GitHub API error";
  }
}
