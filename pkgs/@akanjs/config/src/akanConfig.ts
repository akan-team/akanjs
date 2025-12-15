import fs from "fs";
import { createJiti } from "jiti";
import type { NextConfig } from "next";
import path from "path";

import { withBase } from "./nextConfig";
import {
  type AppConfig,
  type AppConfigResult,
  type AppScanResult,
  type Arch,
  archs,
  type DeepPartial,
  type DockerConfig,
  type LibConfig,
  type LibConfigResult,
  type RunnerProps,
} from "./types";

export const makeAppConfig = (
  config: DeepPartial<AppConfigResult>,
  props: RunnerProps,
  optimizeLibs: string[]
): AppConfigResult => {
  const { name, repoName } = props;
  return {
    backend: {
      docker: makeDockerfile("backend", config.backend?.docker ?? {}, props),
      explicitDependencies: (config.backend?.explicitDependencies as string[] | undefined) ?? ([] as string[]),
    },
    frontend: {
      docker: makeDockerfile("frontend", config.frontend?.docker ?? {}, props),
      nextConfig: withBase(
        name,
        config.frontend?.nextConfig
          ? typeof config.frontend.nextConfig === "function"
            ? (config.frontend as { nextConfig: () => NextConfig }).nextConfig()
            : config.frontend.nextConfig
          : {},
        optimizeLibs,
        config.frontend?.routes
      ),
      routes: config.frontend?.routes,
      explicitDependencies: (config.frontend?.explicitDependencies as string[] | undefined) ?? ([] as string[]),
    },
    mobile: {
      ...config.mobile,
      appName: config.mobile?.appName ?? name,
      appId: config.mobile?.appId ?? `com.${repoName}.app`,
      version: config.mobile?.version ?? "0.0.1",
      buildNum: config.mobile?.buildNum ?? 1,
      plugins: config.mobile?.plugins,
    },
  };
};

export const getAppConfig = async (
  appRoot: string,
  props: RunnerProps,
  tsconfig: { compilerOptions: { paths?: Record<string, string[]> } }
): Promise<AppConfigResult> => {
  const akanConfigPath = path.join(appRoot, "akan.config.ts");
  if (!fs.existsSync(akanConfigPath)) throw new Error(`application akan.config.ts is not found ${appRoot}`);
  const jiti = createJiti(import.meta.url, {
    fsCache: false,
    requireCache: false,
    interopDefault: true,
  });
  const configImp = (await jiti.import<{ default: AppConfig }>(akanConfigPath)).default;
  const config = typeof configImp === "function" ? configImp(props) : configImp;
  const optimizeLibs = Object.entries(tsconfig.compilerOptions.paths ?? {})
    .filter(
      ([key, resolves]) =>
        key.startsWith("@") && resolves.at(0)?.startsWith("libs/") && resolves.at(0)?.endsWith("/index.ts")
    )
    .map(([key]) => key.slice(1));
  return makeAppConfig(config, props, optimizeLibs);
};

export const makeLibConfig = (config: DeepPartial<LibConfigResult>, props: RunnerProps): LibConfigResult => {
  return {
    backend: {
      explicitDependencies: (config.backend?.explicitDependencies as string[] | undefined) ?? ([] as string[]),
    },
    frontend: {
      explicitDependencies: (config.frontend?.explicitDependencies as string[] | undefined) ?? ([] as string[]),
    },
  };
};

export const getLibConfig = async (libRoot: string, props: RunnerProps): Promise<LibConfigResult> => {
  const akanConfigPath = path.join(libRoot, "akan.config.ts");
  if (!fs.existsSync(akanConfigPath)) throw new Error(`library akan.config.ts is not found ${libRoot}`);
  const jiti = createJiti(import.meta.url, {
    cache: false,
  });
  const configImp = (await jiti.import<{ default: LibConfig }>(akanConfigPath)).default;
  const config = typeof configImp === "function" ? configImp(props) : configImp;
  return makeLibConfig(config, props);
};

export const getNextConfig = (configImp: AppConfig, appData: any) => {
  const appInfo = appData as AppScanResult;
  const props: RunnerProps = {
    type: "app",
    name: appInfo.name,
    repoName: appInfo.repoName,
    serveDomain: appInfo.serveDomain,
    env: (process.env.NEXT_PUBLIC_ENV ?? "debug") as "testing" | "local" | "debug" | "develop" | "main",
  };
  const config = typeof configImp === "function" ? configImp(props) : configImp;
  const akanConfig = makeAppConfig(config, props, appInfo.libDeps);
  return akanConfig.frontend.nextConfig;
};

export const getCapacitorConfig = (configImp: AppConfig, appInfo: AppScanResult) => {
  const props: RunnerProps = {
    type: "app",
    name: appInfo.name,
    repoName: appInfo.repoName,
    serveDomain: appInfo.serveDomain,
    env: (process.env.NEXT_PUBLIC_ENV ?? "debug") as "testing" | "local" | "debug" | "develop" | "main",
  };
  const config = typeof configImp === "function" ? configImp(props) : configImp;
  const akanConfig = makeAppConfig(config, props, appInfo.libDeps);
  return akanConfig;
};

const getDockerRunScripts = (runs: (string | { [key in Arch]?: string })[]) => {
  return runs.map((run) => {
    if (typeof run === "string") return `RUN ${run}`;
    else
      return Object.entries(run)
        .map(
          ([arch, script]) => `RUN if [ "$TARGETARCH" = "${arch}" ]; then \
  ${script}; \
fi`
        )
        .join("\n");
  });
};
const getDockerImageScript = (image: string | { [key in Arch]?: string }, defaultImage: string) => {
  if (typeof image === "string") return `FROM ${image}`;
  else return archs.map((arch) => `FROM ${image[arch] ?? defaultImage} AS ${arch}`).join("\n");
};
export const makeDockerfile = (
  type: "backend" | "frontend",
  config: DeepPartial<DockerConfig>,
  props: RunnerProps
): DockerConfig => {
  const { name, repoName, serveDomain, env } = props;
  if (config.content) return { content: config.content, image: {}, preRuns: [], postRuns: [], command: [] };
  const preRunScripts = getDockerRunScripts(config.preRuns ?? []);
  const postRunScripts = getDockerRunScripts(config.postRuns ?? []);

  if (type === "backend") {
    const imageScript = config.image ? getDockerImageScript(config.image, "node:22-slim") : "FROM node:22-slim";
    const command = config.command ?? ["node", "main.js"];
    const content = `${imageScript}
RUN ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime
RUN apt update && apt upgrade -y 
RUN apt install -y git redis build-essential python3 ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils udev ffmpeg
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "amd64" ]; then \
      wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian92-x86_64-100.3.1.deb && \
      apt install -y ./mongodb-database-tools-*.deb && \
      rm -f mongodb-database-tools-*.deb; \
    fi
${preRunScripts.join("\n")}
RUN mkdir -p /workspace
WORKDIR /workspace
COPY ./package.json ./package.json
RUN npx pnpm i --prod
${postRunScripts.join("\n")}
COPY . .
ENV PORT=8080
ENV NODE_OPTIONS=--max_old_space_size=8192
ENV NEXT_PUBLIC_REPO_NAME=${repoName}
ENV NEXT_PUBLIC_SERVE_DOMAIN=${serveDomain}
ENV NEXT_PUBLIC_APP_NAME=${name}
ENV NEXT_PUBLIC_ENV=${env}
ENV NEXT_PUBLIC_OPERATION_MODE=cloud
CMD [${command.map((c) => `"${c}"`).join(",")}]`;
    return {
      content,
      image: imageScript,
      preRuns: config.preRuns ?? [],
      postRuns: config.postRuns ?? [],
      command,
    };
  } else {
    const imageScript = config.image ? getDockerImageScript(config.image, "node:22-alpine") : "FROM node:22-alpine";
    const command = config.command ?? ["npm", "start"];
    const content = `${imageScript}
RUN ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime
ARG TARGETARCH
RUN apk --no-cache add git
${preRunScripts.join("\n")}
RUN mkdir -p /workspace
WORKDIR /workspace
COPY ./package.json ./package.json
RUN npx pnpm i --prod
COPY . .
ENV PORT=4200
ENV NODE_OPTIONS=--max_old_space_size=8192
ENV NEXT_PUBLIC_REPO_NAME=${repoName}
ENV NEXT_PUBLIC_SERVE_DOMAIN=${serveDomain}
ENV NEXT_PUBLIC_APP_NAME=${name}
ENV NEXT_PUBLIC_ENV=${env}
ENV NEXT_PUBLIC_OPERATION_MODE=cloud
${postRunScripts.join("\n")}
CMD [${command.map((c) => `"${c}"`).join(",")}]`;
    return {
      content,
      image: imageScript,
      preRuns: config.preRuns ?? [],
      postRuns: config.postRuns ?? [],
      command,
    };
  }
};

export const increaseBuildNum = async (
  appRoot: string,
  props: RunnerProps,
  tsconfig: { compilerOptions: { paths?: { [key: string]: string[] } } }
) => {
  const appConfig = await getAppConfig(appRoot, props, tsconfig);

  const akanConfigPath = path.join(appRoot, "akan.config.ts");
  const akanConfig = fs.readFileSync(akanConfigPath, "utf8");
  const akanConfigContent = akanConfig.replace(
    `buildNum: ${appConfig.mobile.buildNum}`,
    `buildNum: ${appConfig.mobile.buildNum + 1}`
  );
  //? 개선할 여지가 있는지 확인
  fs.writeFileSync(akanConfigPath, akanConfigContent);
};

export const decreaseBuildNum = async (
  appRoot: string,
  props: RunnerProps,
  tsconfig: { compilerOptions: { paths?: { [key: string]: string[] } } }
) => {
  const appConfig = await getAppConfig(appRoot, props, tsconfig);
  const akanConfigPath = path.join(appRoot, "akan.config.ts");
  const akanConfig = fs.readFileSync(akanConfigPath, "utf8");
  const akanConfigContent = akanConfig.replace(
    `buildNum: ${appConfig.mobile.buildNum}`,
    `buildNum: ${appConfig.mobile.buildNum - 1}`
  );
  fs.writeFileSync(akanConfigPath, akanConfigContent);
};
