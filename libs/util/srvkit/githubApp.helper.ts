import { exec } from "node:child_process";
import { promisify } from "node:util";
import { dayjs } from "akanjs/base";

import type {
  GithubAccessToken,
  GithubAccessTokenDto,
  GithubApiError,
  GithubInfo,
  GithubInfoDto,
  GithubInstallationAccessToken,
  GithubInstallationAccessTokenDto,
  GithubInstallationDto,
  GithubInstallationRepositoriesDto,
  GithubRepository,
  GithubRepositoryDto,
  GithubUserInstallationsDto,
} from "./githubTypes";

export const execAsync = promisify(exec);

export const toGithubAccessToken = (dto: GithubAccessTokenDto): GithubAccessToken => {
  return {
    accessToken: dto.access_token,
    expiresAt: dayjs().add(dto.expires_in, "seconds"),
    refreshToken: dto.refresh_token,
  };
};

export const toGithubInstallationAccessToken = (
  dto: GithubInstallationAccessTokenDto,
): GithubInstallationAccessToken | null => {
  if (!dto.token || !dto.expires_at) return null;
  return {
    accessToken: dto.token,
    expiresAt: dayjs(dto.expires_at),
  };
};

export const isGithubInstallationAccessTokenDto = (
  dto: GithubInstallationAccessTokenDto | GithubApiError,
): dto is GithubInstallationAccessTokenDto => {
  return "token" in dto && "expires_at" in dto;
};

export const isGithubInstallationRepositoriesDto = (
  dto: GithubInstallationRepositoriesDto | GithubApiError,
): dto is { repositories: GithubRepositoryDto[] } => {
  return "repositories" in dto && Array.isArray(dto.repositories);
};

export const isGithubUserInstallationsDto = (
  dto: GithubUserInstallationsDto | GithubApiError,
): dto is { installations: GithubInstallationDto[] } => {
  return "installations" in dto && Array.isArray(dto.installations);
};

export const isGithubInstallationDto = (dto: GithubInstallationDto | GithubApiError): dto is GithubInstallationDto => {
  return "id" in dto;
};

export const toGithubRepository = (dto: GithubRepositoryDto): GithubRepository => {
  return {
    id: dto.id,
    name: dto.name,
    fullName: dto.full_name,
    private: dto.private,
    htmlUrl: dto.html_url,
    description: dto.description,
    createdAt: dto.created_at,
  };
};

export const toGithubInfo = (dto: GithubInfoDto): GithubInfo => {
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

export const githubShellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
