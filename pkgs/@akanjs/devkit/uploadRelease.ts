import { HttpClient, Logger } from "akanjs/common";

import { Spinner } from "./spinner";

const spinning = (message: string) => {
  const spinner = new Spinner(message, { prefix: message, enableSpin: true }).start();
  return spinner;
};
export const uploadRelease = async (
  appName: string,
  {
    workspaceRoot,
    environment,
    buildNum,
    platformVersion,
    os,
    local,
  }: {
    workspaceRoot: string;
    environment: string;
    buildNum: number;
    platformVersion?: string;
    os?: "android" | "ios";
    local?: boolean;
  },
) => {
  const logger = new Logger("uploadRelease");
  const basePath = local ? "http://localhost:8282/backend" : "https://cloud.akanjs.com/backend";
  const httpClient = new HttpClient(basePath);
  const buildPath = `${workspaceRoot}/releases/builds/${appName}-release.tar.gz`;
  const appBuildPath = `${workspaceRoot}/releases/builds/${appName}-appBuild.zip`;
  const sourcePath = `${workspaceRoot}/releases/sources/${appName}-source.tar.gz`;

  const readingFilesSpinner = spinning("Reading files...");
  try {
    const buildFile = Bun.file(buildPath);
    const sourceFile = Bun.file(sourcePath);
    const appBuildFile = Bun.file(appBuildPath);
    const buildStat = { mtime: new Date(buildFile.lastModified), size: buildFile.size };
    const sourceStat = { mtime: new Date(sourceFile.lastModified), size: sourceFile.size };
    const appBuildStat = { mtime: new Date(appBuildFile.lastModified), size: appBuildFile.size };
    readingFilesSpinner.succeed("Reading files... done");

    const preparingFormSpinner = spinning("Preparing form data...");
    const formData = new FormData();
    formData.append("files", buildFile, `${appName}-release.tar.gz`);
    formData.append("files", sourceFile, `${appName}-source.tar.gz`);
    formData.append("files", appBuildFile, `${appName}-appBuild.zip`);
    formData.append(
      "metas",
      JSON.stringify([
        { lastModifiedAt: buildStat.mtime, size: buildStat.size },
        { lastModifiedAt: sourceStat.mtime, size: sourceStat.size },
        { lastModifiedAt: appBuildStat.mtime, size: appBuildStat.size },
      ]),
    );
    formData.append("type", "release");
    preparingFormSpinner.succeed("Preparing form data... done");

    try {
      const uploadingFilesSpinner = spinning("Uploading files to server...");
      const [buildFile, sourceFile, appBuildFile] = await httpClient.post<
        [{ id: string }, { id: string }, { id: string }]
      >("/file/addFiles", formData);
      uploadingFilesSpinner.succeed("Uploading files to server... done");

      const fetchingAppSpinner = spinning(`Fetching dev app information for ${appName}...`);
      const major = platformVersion ? parseInt(platformVersion.split(".")[0]) : 1;
      const minor = platformVersion ? parseInt(platformVersion.split(".")[1]) : 0;
      const patch = platformVersion ? parseInt(platformVersion.split(".")[2]) : 0;

      const devApp = await httpClient.get<{ id: string }>(`/devApp/devAppInName/${appName}`);
      fetchingAppSpinner.succeed(`Fetching dev app information for ${appName}... done`);

      const pushingReleaseSpinner = spinning(`Pushing release to ${environment} environment...`);
      const release = await httpClient.post<{ id: string }>(
        `/release/pushRelease/${devApp.id}/${environment}/${major}/${minor}/${patch}/${sourceFile.id}/${buildFile.id}/${appBuildFile.id}${os ? `/${os}` : ""}`,
      );
      pushingReleaseSpinner.succeed(`Pushing release to ${environment} environment... done`);
      new Spinner(`Successfully pushed release to ${appName}-${environment} server. `, {
        prefix: `Successfully pushed release to ${appName}-${environment} server. `,
        enableSpin: false,
      }).succeed(`Successfully pushed release to ${appName}-${environment} server. `);
      return release;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      logger.error(`Upload release failed: ${errorMessage}`);
      return null;
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    readingFilesSpinner.fail(`Reading files failed: ${errorMessage}`);
    return null;
  }
};
