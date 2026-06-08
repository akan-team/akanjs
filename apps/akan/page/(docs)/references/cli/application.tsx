import { usePage } from "@apps/akan/client";
import { type CommandReferenceItem, CommandReferenceSlide, Docs, type ReferenceRow } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

const writeOption: ReferenceRow = {
  name: "--write",
  type: "Boolean",
  defaultValue: "true",
  enumOrFlag: "-",
  desc: "Write code generation before running the command.",
};
const targetOption: ReferenceRow = {
  name: "--target",
  type: "String",
  defaultValue: "-",
  enumOrFlag: "-",
  desc: "Mobile target name or all.",
};
const debugEnvOption: ReferenceRow = {
  name: "--env",
  type: "String",
  defaultValue: "debug",
  enumOrFlag: "local | debug | develop | main",
  desc: "Backend environment.",
};
const localEnvOption: ReferenceRow = {
  name: "--env",
  type: "String",
  defaultValue: "local",
  enumOrFlag: "local | debug | develop | main",
  desc: "Backend environment.",
};
const releaseEnvOption: ReferenceRow = {
  name: "--env",
  type: "String",
  defaultValue: "main",
  enumOrFlag: "debug | develop | main | local",
  desc: "Backend environment.",
};
const regenerateOption: ReferenceRow = {
  name: "--regenerate",
  type: "Boolean",
  defaultValue: "false",
  enumOrFlag: "flag: -g",
  desc: "Delete and regenerate native project.",
};
const allowLocalReleaseOption: ReferenceRow = {
  name: "--allowLocalRelease",
  type: "Boolean",
  defaultValue: "false",
  enumOrFlag: "flag: -l",
  desc: "Allow release with --env local.",
};

export default function Page() {
  const { l } = usePage();

  const commands: CommandReferenceItem[] = [
    {
      name: "create-application",
      signature: "akan create-application <appName> [--start <boolean>]",
      desc: "Create a new app folder and register it in the workspace application set.\nThe app name is normalized to lowercase kebab-case, and `--start` can immediately run the application after generation.",
      args: [
        {
          name: "appName",
          type: "String",
          required: "yes",
          defaultValue: "-",
          desc: "Application name. Normalized to lowercase kebab-case.",
        },
      ],
      options: [
        {
          name: "--start",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "-",
          desc: "Start application after creation.",
        },
      ],
      examples: `akan create-application blog
akan create-application blog --start true`,
    },
    {
      name: "remove-application",
      signature: "akan remove-application <app>",
      desc: "Remove an existing application from the workspace.\nUse this when an app should no longer participate in workspace sync, builds, generated outputs, or deployment workflows.",
      examples: "akan remove-application blog",
    },
    {
      name: "sync",
      signature: "akan sync <system>",
      desc: "Synchronize dependency and configuration surfaces for a selected app or library.\nRun it after structural changes, package changes, or generated configuration changes that need to be reflected in the target system.",
      examples: `akan sync myapp
akan sync util`,
    },
    {
      name: "script",
      signature: "akan script <app> [filename]",
      desc: "Run a custom script inside the selected application environment.\nThe filename is optional, so the command can run the app script flow directly or target a specific script file when provided.",
      args: [
        { name: "filename", type: "String", required: "no", defaultValue: "-", desc: "Script filename. Nullable." },
      ],
      examples: `akan script myapp
akan script myapp seed.ts`,
    },
    {
      name: "console",
      signature: "akan console <app>",
      desc: "Open an interactive server console for the selected application.\nUse it for runtime inspection and small operator commands. Production builds also embed `console.js` next to `main.js` for Docker and Kubernetes exec workflows.",
      notes: [
        {
          name: "container",
          desc: "Run `AKAN_CONSOLE=1 bun console.js` inside built containers or pods.",
        },
        {
          name: "process",
          desc: "Container console mode starts a separate no-listen server process and does not attach to running main.js memory.",
        },
      ],
      examples: `akan console myapp
docker exec -it myapp sh -lc 'AKAN_CONSOLE=1 bun console.js'
kubectl exec -it -n prod pod/myapp-xxxxx -c myapp -- sh -lc 'AKAN_CONSOLE=1 bun console.js'`,
    },
    {
      name: "build",
      signature: "akan build <app> [--write <boolean>] [--fast <boolean>] [--quiet <boolean>]",
      desc: "Build the application for production, including frontend SSR output and backend/runtime artifacts.\n`--write` refreshes generated code first, while `--fast` and `--quiet` tune build speed and terminal output.",
      options: [
        writeOption,
        { name: "--fast", type: "Boolean", defaultValue: "false", enumOrFlag: "-", desc: "Fast build." },
        {
          name: "--quiet",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "-",
          desc: "Hide build progress output.",
        },
      ],
      notes: [{ name: "short", desc: "true" }],
      examples: `akan build myapp
akan build myapp --write true --fast false --quiet false`,
    },
    {
      name: "typecheck",
      signature: "akan typecheck <app> [--write <boolean>] [--clean <boolean>] [--incremental <boolean>]",
      desc: "Run TypeScript type checking for the selected application.\nThe command can regenerate code before checking, clear the typecheck cache with `--clean`, or reuse incremental cache with `--incremental`.",
      options: [
        writeOption,
        {
          name: "--clean",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "-",
          desc: "Clear typecheck cache before running.",
        },
        {
          name: "--incremental",
          type: "Boolean",
          defaultValue: "true",
          enumOrFlag: "-",
          desc: "Reuse TypeScript incremental cache.",
        },
      ],
      notes: [{ name: "short", desc: "true" }],
      examples: `akan typecheck myapp
akan typecheck myapp --clean true --incremental false`,
    },
    {
      name: "test",
      signature: "akan test <target> [--write <boolean>]",
      desc: "Prepare generated surfaces and run tests for the selected app, library, or package target.\nKeep `--write` enabled when tests depend on generated routes, stores, services, or type surfaces being current.",
      options: [writeOption],
      examples: `akan test myapp
akan test util --write false`,
    },
    {
      name: "build-ios",
      signature: "akan build-ios <app> [--target <target>] [--env <env>] [--write <boolean>] [--regenerate <boolean>]",
      desc: "Build the iOS native project for an Akan application through Capacitor.\nUse `--target` to choose a mobile target, `--env` to bind the backend environment, and `--regenerate` when native project files must be recreated.",
      options: [targetOption, debugEnvOption, writeOption, regenerateOption],
      notes: [{ name: "short", desc: "true" }],
      examples: "akan build-ios myapp --target all --env debug",
    },
    {
      name: "build-android",
      signature:
        "akan build-android <app> [--target <target>] [--env <env>] [--write <boolean>] [--regenerate <boolean>]",
      desc: "Build the Android native project for an Akan application through Capacitor.\nUse `--target` for the mobile target, `--env` for the backend environment, and `--regenerate` when native project files need a fresh generation.",
      options: [targetOption, debugEnvOption, writeOption, regenerateOption],
      notes: [{ name: "short", desc: "true" }],
      examples: "akan build-android myapp --target all --env debug",
    },
    {
      name: "start",
      signature: "akan start <app> [--open <boolean>] [--write <boolean>]",
      desc: "Start the local development server for frontend SSR and backend runtime together.\n`--open` launches the browser after startup, and `--write` keeps generated application surfaces current before serving.",
      options: [
        { name: "--open", type: "Boolean", defaultValue: "false", enumOrFlag: "-", desc: "Open web browser." },
        writeOption,
      ],
      notes: [{ name: "short", desc: "true" }],
      examples: `akan start myapp
akan start myapp --open true --write true`,
    },
    {
      name: "start-ios",
      signature:
        "akan start-ios <app> [--target <target>] [--env <env>] [--open <boolean>] [--release <boolean>] [--write <boolean>] [--regenerate <boolean>]",
      desc: "Start the iOS app on a simulator or connected device.\n`--release` switches the mobile operation mode to release, while `--open`, `--env`, and `--target` control simulator launch and target environment.",
      options: [
        targetOption,
        localEnvOption,
        { name: "--open", type: "Boolean", defaultValue: "false", enumOrFlag: "-", desc: "Open iOS simulator." },
        { name: "--release", type: "Boolean", defaultValue: "false", enumOrFlag: "-", desc: "Release mode." },
        writeOption,
        regenerateOption,
      ],
      notes: [
        { name: "short", desc: "true" },
        { name: "operation", desc: "release when --release is true, otherwise local" },
      ],
      examples: "akan start-ios myapp --target all --env local --open true",
    },
    {
      name: "start-android",
      signature:
        "akan start-android <app> [--target <target>] [--env <env>] [--release <boolean>] [--open <boolean>] [--write <boolean>] [--regenerate <boolean>]",
      desc: "Start the Android app on an emulator or connected device.\nThe command mirrors the iOS start flow, with environment selection, release mode, emulator opening, code generation, and native regeneration controls.",
      options: [
        targetOption,
        localEnvOption,
        { name: "--release", type: "Boolean", defaultValue: "false", enumOrFlag: "-", desc: "Release mode." },
        { name: "--open", type: "Boolean", defaultValue: "false", enumOrFlag: "-", desc: "Open android simulator." },
        writeOption,
        regenerateOption,
      ],
      notes: [
        { name: "short", desc: "true" },
        { name: "operation", desc: "release when --release is true, otherwise local" },
      ],
      examples: "akan start-android myapp --target all --env local --open true",
    },
    {
      name: "release-ios",
      signature:
        "akan release-ios <app> [--target <target>] [--env <env>] [--write <boolean>] [--regenerate <boolean>] [--allowLocalRelease <boolean>]",
      desc: "Build and package the iOS app for App Store release workflows.\nThe command defaults to the `main` backend environment and requires explicit `--allowLocalRelease` if a local release environment must be allowed.",
      options: [targetOption, releaseEnvOption, writeOption, regenerateOption, allowLocalReleaseOption],
      examples: "akan release-ios myapp --target all --env main",
    },
    {
      name: "release-android",
      signature:
        "akan release-android <app> [--assembleType <type>] [--target <target>] [--env <env>] [--write <boolean>] [--regenerate <boolean>] [--allowLocalRelease <boolean>]",
      desc: "Build and package the Android app for Play Store release workflows.\n`--assembleType` selects APK or AAB output, while environment, target, regeneration, and local-release options control the release artifact.",
      options: [
        {
          name: "--assembleType",
          type: "String",
          defaultValue: "apk",
          enumOrFlag: "apk | aab",
          desc: "Android artifact type.",
        },
        targetOption,
        releaseEnvOption,
        writeOption,
        regenerateOption,
        allowLocalReleaseOption,
      ],
      examples: `akan release-android myapp --assembleType apk --target all --env main
akan release-android myapp --assembleType aab --target all --env main`,
    },
    {
      name: "release-source",
      signature:
        "akan release-source <app> [--rebuild <boolean>] [--buildNum <number>] [--environment <environment>] [--local <boolean>]",
      desc: "Release application source code for mobile OTA-oriented update workflows.\nUse build number, environment, rebuild, and local flags to describe the source release payload sent through the update process.",
      options: [
        {
          name: "--rebuild",
          type: "Boolean",
          defaultValue: "false",
          enumOrFlag: "-",
          desc: "Rebuild before release source.",
        },
        { name: "--buildNum", type: "Number", defaultValue: "0", enumOrFlag: "-", desc: "Build number." },
        { name: "--environment", type: "String", defaultValue: "debug", enumOrFlag: "-", desc: "Environment." },
        { name: "--local", type: "Boolean", defaultValue: "true", enumOrFlag: "-", desc: "Local mode." },
      ],
      examples: "akan release-source myapp --environment debug --buildNum 12 --local true",
    },
    {
      name: "codepush",
      signature: "akan codepush <app>",
      desc: "Deploy an over-the-air update for the selected mobile application.\nThe command prompts for the target OS (`ios` or `android`) before running the OTA deployment flow.",
      notes: [{ name: "interactive", desc: "Prompts for os: ios or android." }],
      examples: "akan codepush myapp",
    },
    {
      name: "dbup",
      signature: "akan dbup [--mode <mode>]",
      desc: "Start local database services for the selected workspace database topology.\n`--mode` selects single, multiple, or cluster mode so local infrastructure can match the workflow being tested.",
      options: [
        {
          name: "--mode",
          type: "String",
          defaultValue: "multiple",
          enumOrFlag: "single | multiple | cluster",
          desc: "Database mode.",
        },
      ],
      examples: `akan dbup
akan dbup --mode single
akan dbup --mode cluster`,
    },
    {
      name: "dbdown",
      signature: "akan dbdown",
      desc: "Stop local database services started for development or verification.\nUse it after local database-dependent workflows are complete to cleanly shut down the workspace database environment.",
      examples: "akan dbdown",
    },
    {
      name: "configure-app",
      signature: "akan configure-app <app>",
      desc: "Run the interactive application configuration flow for a selected app.\nUse it when app settings need to be inspected or updated through prompts rather than manual config edits.",
      notes: [{ name: "interactive", desc: "Runs application configuration prompts." }],
      examples: "akan configure-app myapp",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="application-cli" title={l.trans({ en: "Application CLI", ko: "Application CLI" })}>
        <Docs.Title>{l.trans({ en: "Application CLI", ko: "Application CLI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Application commands manage app lifecycle work: create or remove apps, sync generated surfaces, start local servers, build production artifacts, run typechecks and tests, package mobile apps, and manage local database helpers.",
              ko: "Application command는 app lifecycle 작업을 관리합니다. app 생성/삭제, generated surface sync, local server 시작, production build, typecheck/test, mobile app packaging, local database helper를 다룹니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Most commands select an app from the workspace context. Options such as `--write`, `--target`, `--env`, and `--regenerate` control code generation and mobile build behavior.",
              ko: "대부분의 명령은 workspace context에서 app을 선택합니다. `--write`, `--target`, `--env`, `--regenerate` 같은 option은 code generation과 mobile build 동작을 제어합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      {commands.map((command) => (
        <CommandReferenceSlide key={command.name} command={command} />
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
