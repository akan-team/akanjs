import { Logger } from "@akanjs/common";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";

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
  }
) => {
  const logger = new Logger("uploadRelease");
  const basePath = local ? "http://localhost:8080/backend" : "https://cloud.akanjs.com/backend";
  const buildPath = `${workspaceRoot}/releases/builds/${appName}-release.tar.gz`;
  const appBuildPath = `${workspaceRoot}/releases/builds/${appName}-appBuild.zip`;
  const sourcePath = `${workspaceRoot}/releases/sources/${appName}-source.tar.gz`;

  const readingFilesSpinner = spinning("Reading files...");
  try {
    const build = fs.readFileSync(buildPath);
    const source = fs.readFileSync(sourcePath);
    const appBuild = fs.readFileSync(appBuildPath);
    const buildStat = fs.statSync(buildPath);
    const sourceStat = fs.statSync(sourcePath);
    const appBuildStat = fs.statSync(appBuildPath);
    readingFilesSpinner.succeed("Reading files... done");

    const preparingFormSpinner = spinning("Preparing form data...");
    const formData = new FormData();
    formData.append("files", build, `${appName}-release.tar.gz`);
    formData.append("files", source, `${appName}-source.tar.gz`);
    formData.append("files", appBuild, `${appName}-appBuild.zip`);
    formData.append(
      "metas",
      JSON.stringify([
        { lastModifiedAt: buildStat.mtime, size: buildStat.size },
        { lastModifiedAt: sourceStat.mtime, size: sourceStat.size },
        { lastModifiedAt: appBuildStat.mtime, size: appBuildStat.size },
      ])
    );
    formData.append("type", "release");
    preparingFormSpinner.succeed("Preparing form data... done");

    try {
      const uploadingFilesSpinner = spinning("Uploading files to server...");
      const [buildFile, sourceFile, appBuildFile] = (
        await axios.post<[{ id: string }, { id: string }, { id: string }]>(`${basePath}/file/addFilesRestApi`, formData)
      ).data;
      uploadingFilesSpinner.succeed("Uploading files to server... done");

      const fetchingAppSpinner = spinning(`Fetching dev app information for ${appName}...`);
      const major = platformVersion ? parseInt(platformVersion.split(".")[0]) : 1;
      const minor = platformVersion ? parseInt(platformVersion.split(".")[1]) : 0;
      const patch = platformVersion ? parseInt(platformVersion.split(".")[2]) : 0;

      const devApp = (await axios.get(`${basePath}/devApp/devAppInName/${appName}`)).data as { id: string };
      fetchingAppSpinner.succeed(`Fetching dev app information for ${appName}... done`);

      const pushingReleaseSpinner = spinning(`Pushing release to ${environment} environment...`);
      const release = (
        await axios.post<{ id: string }>(
          `${basePath}/release/pushRelease/${devApp.id}/${environment}/${major}/${minor}/${patch}/${sourceFile.id}/${buildFile.id}/${appBuildFile.id}${os ? `/${os}` : ""}`
        )
      ).data;
      pushingReleaseSpinner.succeed(`Pushing release to ${environment} environment... done`);
      new Spinner(`Successfully pushed release to ${appName}-${environment} server. `, {
        prefix: `Successfully pushed release to ${appName}-${environment} server. `,
        enableSpin: false,
      }).succeed(`Successfully pushed release to ${appName}-${environment} server. `);
      return release;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      return null;
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    readingFilesSpinner.fail(`Reading files failed: ${errorMessage}`);
    return null;
  }
};
