import { dayjs } from "akanjs/base";

import type {
  GithubAccessToken,
  GithubAccessTokenDto,
  GithubInfo,
  GithubInfoDto,
  GithubInstallationAccessToken,
  GithubInstallationAccessTokenDto,
  GithubOAuthErrorDto,
  GithubRepository,
  GithubRepositoryDto,
} from "./githubTypes";

//? GitHub's own lifetime for an expiring user token, applied to one that never expires so it is not cached forever.
const unexpiringTokenSeconds = 8 * 60 * 60;

export const isGithubAccessTokenDto = (
  dto: GithubAccessTokenDto | GithubOAuthErrorDto | null,
): dto is GithubAccessTokenDto => {
  return !!dto && "access_token" in dto && typeof dto.access_token === "string" && dto.access_token.length > 0;
};

export const toGithubAccessToken = (dto: GithubAccessTokenDto): GithubAccessToken => {
  const expiresIn = dto.expires_in && dto.expires_in > 0 ? dto.expires_in : unexpiringTokenSeconds;
  return {
    accessToken: dto.access_token,
    expiresAt: dayjs().add(expiresIn, "seconds"),
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
