import { capitalize } from "@akanjs/common";
import type { AppExecutor } from "@akanjs/devkit";
import { CapacitorConfig } from "@capacitor/cli";
import { MobileProject } from "@trapezedev/project";
import type { AndroidProject } from "@trapezedev/project/dist/android/project";
import type { IosProject } from "@trapezedev/project/dist/ios/project";
import fs from "fs";

import { FileEditor } from "./fileEditor";

interface RunConfig extends CapacitorConfig {
  operation: "local" | "release";
  version: string;
  buildNum: number;
  appId?: string;
  host?: "local" | "debug" | "develop" | "main";
}

export class CapacitorApp {
  project: MobileProject & { ios: IosProject; android: AndroidProject };
  iosTargetName = "App";
  constructor(private readonly app: AppExecutor) {
    this.project = new MobileProject(this.app.cwdPath, {
      android: { path: "android" },
      ios: { path: "ios/App" },
    }) as MobileProject & { ios: IosProject; android: AndroidProject };
  }
  async init() {
    const project = this.project as MobileProject;
    await this.project.load();
    if (!project.android) {
      await this.app.spawn("npx", ["cap", "add", "android"]);
      await this.project.load();
    }
    if (!project.ios) {
      await this.app.spawn("npx", ["cap", "add", "ios"]);
      await this.project.load();
    }
    return this;
  }
  async save() {
    await this.project.commit();
  }
  async #prepareIos() {
    const isAdded = fs.existsSync(`${this.app.cwdPath}/ios/App/Podfile`);
    if (!isAdded) {
      await this.app.spawn("npx", ["cap", "add", "ios"]);
      await this.app.spawn("npx", ["@capacitor/assets", "generate"]);
    } else this.app.verbose(`iOS already added, skip adding process`);
    this.app.verbose(`syncing iOS`);
    await this.app.spawn("npx", ["cap", "sync", "ios"]);
    this.app.verbose(`sync completed.`);
  }
  async buildIos() {
    await this.#prepareIos();
    this.app.verbose(`build completed iOS.`);
    return;
  }
  async syncIos() {
    await this.app.spawn("npx", ["cap", "sync", "ios"]);
  }
  async openIos() {
    await this.app.spawn("npx", ["cap", "open", "ios"]);
  }
  async runIos({ operation, appId, version = "0.0.1", buildNum = 1, host = "local" }: RunConfig) {
    const defaultAppId = `com.${this.app.name}.app`;
    await this.#prepareIos();
    this.project.ios.setBundleId("App", "Debug", appId ?? defaultAppId);
    this.project.ios.setBundleId("App", "Release", appId ?? defaultAppId);
    await this.project.ios.setVersion("App", "Debug", version);
    await this.project.ios.setVersion("App", "Release", version);
    await this.project.ios.setBuild("App", "Debug", buildNum);
    await this.project.ios.setBuild("App", "Release", buildNum);
    await this.project.commit();
    await this.app.spawn(
      "npx",
      [
        "cross-env",
        `APP_OPERATION_MODE=${operation}`,
        `NEXT_PUBLIC_ENV=${host}`,
        "npx",
        "cap",
        "run",
        "ios",
        "--live-reload",
        operation === "release" ? "" : "--live-reload",
        operation === "release" ? "" : "--port",
        operation === "release" ? "" : "4201",
      ],
      {
        stdio: "inherit",
      }
    );

    // this.project.ios.incrementBuild("App", "Debug");
    // this.project.ios.incrementBuild("App", "Release");
  }

  async #prepareAndroid() {
    const isAdded = fs.existsSync(`${this.app.cwdPath}/android/app/build.gradle`);
    if (!isAdded) {
      await this.app.spawn("npx", ["cap", "add", "android"]);
    } else this.app.verbose(`Android already added, skip adding process`);
    await this.app.spawn("npx", ["@capacitor/assets", "generate"]);
    await this.app.spawn("npx", ["cap", "sync", "android"]);
  }

  #updateAndroidBuildTypes() {
    //keystore 기본 설정 및 debug, release 설정

    const appGradle = new FileEditor(`${this.app.cwdPath}/android/app/build.gradle`);
    const buildTypesBlock = `
      debug {
        applicationIdSuffix ".debug"
        versionNameSuffix "-DEBUG"
        debuggable true
        minifyEnabled false
      }
    `;
    const singinConfigBlock = `
     signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
                storePassword MYAPP_RELEASE_STORE_PASSWORD
                keyAlias MYAPP_RELEASE_KEY_ALIAS
                keyPassword MYAPP_RELEASE_KEY_PASSWORD
            }
        }
    }
        `;
    if (appGradle.find("signingConfigs {") === -1) {
      appGradle.insertBefore("buildTypes {", singinConfigBlock);
    }
    if (appGradle.find(`applicationIdSuffix ".debug"`) === -1) {
      appGradle.insertAfter("buildTypes {", buildTypesBlock);
    }
    appGradle.save();
  }
  async buildAndroid(assembleType: "apk" | "aab") {
    await this.#prepareAndroid();
    this.#updateAndroidBuildTypes();
    //윈도우는 gradlew.bat 사용
    const isWindows = process.platform === "win32";
    const gradleCommand = isWindows ? "gradlew.bat" : "./gradlew";

    await this.app.spawn(gradleCommand, [assembleType === "apk" ? "assembleRelease" : "bundleRelease"], {
      stdio: "inherit",
      cwd: `${this.app.cwdPath}/android`,
    });
  }
  async openAndroid() {
    await this.app.spawn("npx", ["cap", "open", "android"]);
  }
  async syncAndroid() {
    await this.#prepareAndroid();
    this.app.log(`Sync Android Completed.`);
  }
  async runAndroid({ operation, appName, appId, version = "0.0.1", buildNum = 1, host = "local" }: RunConfig) {
    const defaultAppId = `com.${this.app.name}.app`;
    const defaultAppName = this.app.name;
    await this.project.android.setVersionName(version);
    await this.project.android.setPackageName(appId ?? defaultAppId);
    await this.project.android.setVersionCode(buildNum);
    const versionName = await this.project.android.getVersionName();
    const versionCode = await this.project.android.getVersionCode();
    await this.project.android.setAppName(appName ?? defaultAppName);
    await this.project.commit();
    await this.#prepareAndroid();

    this.app.logger.info(`Running Android in ${operation} mode on ${host} host`);
    await this.app.spawn(
      "npx",
      [
        "cross-env",
        `NEXT_PUBLIC_ENV=${host}`,
        `APP_OPERATION_MODE=${operation}`,
        "npx",
        "cap",
        "run",
        "android",
        operation === "release" ? "" : "--live-reload",
        operation === "release" ? "" : "--port",
        operation === "release" ? "" : "4201",
      ],
      {
        stdio: "inherit",
      }
    );
  }

  //? 릴리즈시 buildNum +1 version 파라미터 받아서 업데이트
  async updateAndroidVersion(version: string, buildNum: number) {
    //TODO: 테스트 확인 필요
    await this.project.android.setVersionName(version);
    await this.project.android.setVersionCode(buildNum);
    const versionName = await this.project.android.getVersionName();
    const versionCode = await this.project.android.getVersionCode();
    await this.project.commit();
  }
  async releaseIos() {
    //TODO: 작업 필요
    const isAdded = fs.existsSync(`${this.app.cwdPath}/ios/App/Podfile`);
    if (!isAdded) {
      await this.app.spawn("npx cap add ios");
      await this.app.spawn("npx @capacitor/assets generate");
    } else this.app.log(`iOS already added, skip adding process`);
    await this.app.spawn("cross-env", ["APP_OPERATION_MODE=release", "npx", "cap", "sync", "ios"]);
  }
  async releaseAndroid() {
    //TODO: 작업 필요
    const isAdded = fs.existsSync(`${this.app.cwdPath}/android/app/build.gradle`);
    if (!isAdded) {
      await this.app.spawn("npx cap add android");
      await this.app.spawn("npx @capacitor/assets generate");
    } else this.app.log(`android already added, skip adding process`);
    await this.app.spawn("cross-env", ["APP_OPERATION_MODE=release", "npx", "cap", "sync", "android"]);
  }
  async addCamera() {
    await this.#setPermissionInIos({
      cameraUsageDescription: "$(PRODUCT_NAME) requires access to the camera to take photos.",
      photoAddUsageDescription: "$(PRODUCT_NAME) requires access to the photo library to take photos.",
      photoUsageDescription: "$(PRODUCT_NAME) requires access to the photo library to take photos.",
    });
    this.#setPermissionsInAndroid(["READ_MEDIA_IMAGES", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"]);
  }
  async addContact() {
    await this.#setPermissionInIos({
      contactsUsageDescription: "$(PRODUCT_NAME) requires access to the contacts to add new contacts.",
    });
    this.#setPermissionsInAndroid(["READ_CONTACTS", "WRITE_CONTACTS"]);
  }
  async addLocation() {
    await this.#setPermissionInIos({
      locationAlwaysUsageDescription: "$(PRODUCT_NAME) requires access to the location to get the user's location.",
      locationWhenInUseUsageDescription: "$(PRODUCT_NAME) requires access to the location to get the user's location.",
    });
    this.#setPermissionsInAndroid(["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]);
    this.#setFeaturesInAndroid(["android.hardware.location.gps"]);
  }
  async #setPermissionInIos(permissions: { [key: string]: string }) {
    const updateNs = Object.fromEntries(
      Object.entries(permissions).map(([key, value]) => [`NS${capitalize(key)}`, value])
    );
    await Promise.all([
      this.project.ios.updateInfoPlist(this.iosTargetName, "Debug", updateNs),
      this.project.ios.updateInfoPlist(this.iosTargetName, "Release", updateNs),
    ]);
  }
  #setFeaturesInAndroid(features: string[]) {
    for (const feature of features) {
      if (this.#hasFeatureInAndroid(feature)) {
        this.app.logger.info(`${feature} already exists in android`);
        return this;
      }
      this.app.logger.info(`Adding ${feature} to android`);
      this.project.android
        .getAndroidManifest()
        .injectFragment("manifest", `<uses-feature android:name="${feature}" />`);
    }
    return this;
  }
  #getFeaturesInAndroid() {
    const androidManifest = this.project.android.getAndroidManifest();
    const element = androidManifest.getDocumentElement();
    if (!element) throw new Error("manifest not found");
    const usesFeature = element.getElementsByTagName("uses-feature");
    return Array.from(usesFeature).map((feature) => feature.getAttribute("android:name"));
  }
  #hasFeatureInAndroid(feature: string) {
    return this.#getFeaturesInAndroid().includes(feature);
  }

  #setPermissionsInAndroid(permissions: string[]) {
    for (const permission of permissions) {
      if (this.#hasPermissionInAndroid(permission)) {
        this.app.logger.info(`${permission} already exists in android`);
        return this;
      }
      this.app.logger.info(`Adding ${permission} to android`);
      this.project.android
        .getAndroidManifest()
        .injectFragment("manifest", `<uses-permission android:name="android.permission.${permission}" />`);
    }
    return this;
  }
  #getPermissionsInAndroid() {
    const androidManifest = this.project.android.getAndroidManifest();
    const element = androidManifest.getDocumentElement();
    if (!element) throw new Error("manifest not found");
    const usesPermission = element.getElementsByTagName("uses-permission");
    return Array.from(usesPermission).map((permission) => permission.getAttribute("android:name"));
  }
  #hasPermissionInAndroid(permission: string) {
    return this.#getPermissionsInAndroid().includes(permission);
  }
}
