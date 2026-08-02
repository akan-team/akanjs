"use client";
import { loadCapacitorApp, loadCapacitorDevice, loadCapacitorUpdater } from "akanjs/client/capacitor";
import { HttpClient, mergeVersion, splitVersion } from "akanjs/common";
import type { ProtoAppInfo, ProtoFile } from "akanjs/constant";
import { useState } from "react";

// export const useCodepush = ({ serverUrl, branch }: { serverUrl: string; branch: "debug" | "develop" | "main" }) => {
export const useCodepush = ({ serverUrl }: { serverUrl: string }) => {
  const [update, setUpdate] = useState(false);
  const [version, setVersion] = useState("");

  const initialize = async () => {
    const { CapacitorUpdater } = await loadCapacitorUpdater();
    await CapacitorUpdater.notifyAppReady();
  };
  const checkNewRelease = async () => {
    const [{ App }, { Device }, { CapacitorUpdater }] = await Promise.all([
      loadCapacitorApp(),
      loadCapacitorDevice(),
      loadCapacitorUpdater(),
    ]);
    //*appInfo 정의
    const info = await Device.getInfo();
    const app = await App.getInfo();
    const pluginVersion = await CapacitorUpdater.getPluginVersion();
    const { deviceId } = await CapacitorUpdater.getDeviceId();
    const { bundle: version, native } = await CapacitorUpdater.current();
    const builtInversion = await CapacitorUpdater.getBuiltinVersion();
    const appId = app.id;
    const platform = info.platform;

    window.alert(
      `getBuildinVersion:${builtInversion.version}\ncurrent.bundle:${version.version}\ncurrennt.native:${native}`,
    );
    /**
     *  "version_name": "builtin",
     *   "version_code": "1",
     *   "app_id": "com.lu.app",
     *   "plugin_version": "5.6.9",
     *   "version_build": "1.0",
     *   "is_prod": true,
     *   "version_os": "17.0.1",
     *   "is_emulator": true,
     *   "custom_id": "",
     *   "device_id": "C77000B1-7D28-4697-ADE0-74452F47C350",
     *   "platform": "ios",
     *   "defaultChannel": ""
     */
    const { major, minor, patch } = splitVersion(version.version === "builtin" ? app.version : version.version);
    const appName = process.env.AKAN_PUBLIC_APP_NAME ?? "";

    const appInfo: ProtoAppInfo = {
      appId,
      appName,
      deviceId: deviceId,
      platform: platform as "ios" | "android",
      branch: process.env.AKAN_PUBLIC_ENV ?? "debug",
      isEmulator: info.isVirtual,
      major: parseInt(major),
      minor: parseInt(minor),
      patch: parseInt(patch),
      buildNum: app.build, //앱내 빌드시 버전 횟수 모르면 고한테 물어보기
      versionOs: info.osVersion,
    };
    //fix lu to akasys
    // ! NEED TO FIX
    const url = serverUrl.replace("lu", "akasys");
    const httpClient = new HttpClient(url);
    const release = await httpClient.post<(ProtoAppInfo & { appBuild: string }) | null>("/release/codepush", {
      data: { ...appInfo },
    });
    if (!release) return;
    const file = await httpClient.get<ProtoFile>(`/file/file/${release.appBuild}`);

    return { release: release, bundleFile: file };
    //* fetch로 서버에게 내 AppInfo 전달.
    // return await fetch.requestRelease();
  };

  const codepush = async () => {
    //* isNeedUpdate로 업데이트 필요한지 확인
    const newRelease = await checkNewRelease();
    if (!newRelease) return;
    const { release, bundleFile } = newRelease;
    const { CapacitorUpdater } = await loadCapacitorUpdater();
    setUpdate(true);
    const bundle = await CapacitorUpdater.download({
      url: bundleFile.url,
      version: mergeVersion(release.major, release.minor, release.patch),
    });
    //* 해제한 파일로 업데이트
    await CapacitorUpdater.set(bundle);
  };
  const getVersion = async () => {
    const { CapacitorUpdater } = await loadCapacitorUpdater();
    return await CapacitorUpdater.getBuiltinVersion();
  };

  const statManager = async () => {
    // 업데이트 통계 서버에 전달
  };

  return { update, version, initialize, checkNewRelease, codepush, statManager };
};
