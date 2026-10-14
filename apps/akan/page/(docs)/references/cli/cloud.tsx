import { usePage } from "@apps/akan/client";
import {
  type CommandReferenceItem,
  CommandReferenceSlide,
  Divider,
  Docs,
  DocsToc,
  type IntroItem,
  type MatrixGroup,
  type ReferenceRow,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const termRows: IntroItem[] = [
    {
      name: <span className="font-sans">Akan Cloud</span>,
      desc: l.trans({
        en: "The service at `https://cloud.akanjs.com` that holds your account, env values and tunnels.",
        ko: "`https://cloud.akanjs.com`에서 계정, env 값, 터널을 관리하는 서비스입니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "env values", ko: "env 값" })}</span>,
      desc: l.trans({
        en: "Each app's and library's `env/env.client.<env>.ts` and `env/env.server.<env>.ts`, kept out of git.",
        ko: "앱과 라이브러리마다 있는 `env/env.client.<env>.ts`, `env/env.server.<env>.ts` 파일로, git에 올리지 않습니다.",
      }),
    },
    {
      name: "AKAN_WORKSPACE_ID",
      desc: l.trans({
        en: "The cloud workspace id in the root `.env`, which decides where env values are kept.",
        ko: "루트 `.env`에 적는 클라우드 워크스페이스 id로, env 값을 보관할 곳을 정합니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "SCP server", ko: "SCP 서버" })}</span>,
      desc: l.trans({
        en: "A server of your own, reached over SSH, that keeps env values when there is no cloud workspace.",
        ko: "클라우드 워크스페이스가 없을 때 env 값을 보관하는 자체 서버로, SSH로 접속합니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "pipeline secret", ko: "파이프라인 시크릿" })}</span>,
      desc: l.trans({
        en: "A named value build steps read as an environment variable; it is written, never read back.",
        ko: "빌드 step이 환경변수로 읽는 이름 붙은 값입니다. 쓰기만 하고 다시 읽을 수는 없습니다.",
      }),
    },
  ];

  const connectionGroups: MatrixGroup[] = [
    {
      label: l.trans({ en: "Account", ko: "계정" }),
      rows: [
        {
          name: "login",
          desc: l.trans({
            en: "Signs in through the browser and saves the session.",
            ko: "브라우저로 로그인하고 세션을 저장합니다.",
          }),
          marks: { cloud: true },
        },
        {
          name: "logout",
          desc: l.trans({
            en: "Deletes the saved session without contacting the cloud.",
            ko: "클라우드에 연락하지 않고 저장된 세션만 지웁니다.",
          }),
          marks: { local: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Framework", ko: "프레임워크" }),
      rows: [
        {
          name: "update",
          desc: l.trans({
            en: "Installs from npm, or from a local registry with `--registry local`.",
            ko: "npm에서 설치하고, `--registry local`이면 로컬 레지스트리에서 설치합니다.",
          }),
          marks: { npm: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Env values", ko: "env 값" }),
      rows: [
        {
          name: "download-env",
          desc: l.trans({
            en: "Pulls env values from Akan Cloud or an SCP server, whichever the workspace uses.",
            ko: "워크스페이스가 쓰는 쪽(Akan Cloud 또는 SCP 서버)에서 env 값을 내려받습니다.",
          }),
          marks: { cloud: true, scp: true },
        },
        {
          name: "upload-env",
          desc: l.trans({
            en: "Pushes the local env values to that same place for the next `download-env`.",
            ko: "로컬 env 값을 같은 곳에 올려, 다음 `download-env`가 받게 합니다.",
          }),
          marks: { cloud: true, scp: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Pipeline secrets", ko: "파이프라인 시크릿" }),
      rows: [
        {
          name: "upload-secret",
          desc: l.trans({
            en: "Saves a named secret that pipeline steps can read.",
            ko: "파이프라인 step이 읽을 이름 붙은 시크릿을 저장합니다.",
          }),
          marks: { cloud: true },
        },
        {
          name: "list-secrets",
          desc: l.trans({
            en: "Lists the secrets' names and scopes, never their values.",
            ko: "시크릿의 이름과 범위를 보여 주고, 값은 보여 주지 않습니다.",
          }),
          marks: { cloud: true },
        },
        {
          name: "remove-secret",
          desc: l.trans({ en: "Removes a secret from the project.", ko: "프로젝트에서 시크릿을 지웁니다." }),
          marks: { cloud: true },
        },
      ],
    },
  ];

  const sharedRules = [
    l.trans({
      en: (
        <>
          <strong>Run them from the workspace root.</strong> Like most <code>akan</code> commands, they need the folder
          that holds <code>package.json</code>, <code>tsconfig.json</code> and <code>.env</code>.
        </>
      ),
      ko: (
        <>
          <strong>워크스페이스 루트에서 실행합니다.</strong> 대부분의 <code>akan</code> 명령처럼{" "}
          <code>package.json</code>, <code>tsconfig.json</code>, <code>.env</code>가 있는 폴더에서 실행해야 합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>--host</code> points at another cloud.
          </strong>{" "}
          Every command that talks to Akan Cloud takes it, so a self-hosted cloud works with the same commands.{" "}
          <code>{"cloud: { host }"}</code> in the root <code>akan.config.ts</code> makes one the default.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>--host</code>로 다른 클라우드를 가리킵니다.
          </strong>{" "}
          Akan Cloud와 통신하는 명령은 모두 이 옵션을 받으므로, 직접 운영하는 클라우드도 같은 명령으로 씁니다. 루트{" "}
          <code>akan.config.ts</code>의 <code>{"cloud: { host }"}</code>가 기본값을 정합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>One sign-in per host, per machine.</strong> The session lives in <code>~/.akan/config.json</code>, so
          every workspace on this machine shares it. <code>--host</code> and <code>cloud.host</code> are both read as
          the URL's origin and path without a trailing slash, so a trailing slash, an uppercase host or a default port
          still names the same session.
        </>
      ),
      ko: (
        <>
          <strong>로그인은 컴퓨터마다, 호스트마다 하나입니다.</strong> 세션은 <code>~/.akan/config.json</code>에
          저장되므로 이 컴퓨터의 모든 워크스페이스가 함께 씁니다. <code>--host</code>와 <code>cloud.host</code>는 모두
          끝의 슬래시를 뗀 URL의 origin과 경로로 읽으므로, 끝의 슬래시나 대문자 호스트, 기본 포트가 붙어도 같은
          세션입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Without a terminal, a missing argument is an error.</strong> When stdin is piped or closed, as in CI,
          a missing argument or option is not asked for: the command fails at once with an error that says which is
          missing. A question a command asks while it runs — which script to run, a confirmation, which env server to
          copy to — fails the same way, naming the option that answers it.
        </>
      ),
      ko: (
        <>
          <strong>터미널이 없으면 빠진 인자는 오류입니다.</strong> CI처럼 stdin이 파이프로 이어졌거나 닫혀 있으면 빠진
          인자나 옵션을 묻지 않고, 무엇이 빠졌는지 알리는 오류로 바로 멈춥니다. 실행 중에 묻는 질문(실행할 스크립트,
          확인, 복사할 env 서버 등)도 같은 방식으로, 답이 되는 옵션을 알려 주며 멈춥니다.
        </>
      ),
    }),
  ];

  const storeRows = [
    {
      store: "Akan Cloud",
      when: l.trans({ en: "`AKAN_WORKSPACE_ID` is set", ko: "`AKAN_WORKSPACE_ID`가 있을 때" }),
      where: l.trans({
        en: "The cloud workspace with that id, after signing in if needed.",
        ko: "그 id의 클라우드 워크스페이스이며, 필요하면 먼저 로그인합니다.",
      }),
    },
    {
      store: l.trans({ en: "SCP server", ko: "SCP 서버" }),
      when: l.trans({ en: "`AKAN_WORKSPACE_ID` is empty", ko: "`AKAN_WORKSPACE_ID`가 비어 있을 때" }),
      where: l.trans({
        en: "`~/secrets/<repo>/env.tar` on a server you pick from a list.",
        ko: "목록에서 고른 서버의 `~/secrets/<repo>/env.tar`입니다.",
      }),
    },
  ];

  const hostOption: ReferenceRow = {
    name: "--host",
    type: "String",
    defaultValue: l.trans({ en: "cloud.host, else Akan Cloud", ko: "cloud.host, 없으면 Akan Cloud" }),
    enumOrFlag: "-",
    desc: l.trans({
      en: "The cloud to use. Left out, `cloud.host` of the root `akan.config.ts`, else `https://cloud.akanjs.com` (`http://localhost:8283` in the framework repo, `USE_AKANJS_PKGS=true`).",
      ko: "사용할 클라우드입니다. 생략하면 루트 `akan.config.ts`의 `cloud.host`, 없으면 `https://cloud.akanjs.com`입니다(프레임워크 저장소(`USE_AKANJS_PKGS=true`)에서는 `http://localhost:8283`).",
    }),
  };
  const envHostOption: ReferenceRow = {
    ...hostOption,
    desc: l.trans({
      en: "The cloud to use when `AKAN_WORKSPACE_ID` is set, chosen as for `login`; ignored for an SCP server.",
      ko: "`AKAN_WORKSPACE_ID`가 있을 때 쓸 클라우드이며 `login`과 같은 방식으로 정합니다. SCP 서버를 쓸 때는 무시합니다.",
    }),
  };
  const subspaceOption: ReferenceRow = {
    name: "--subspace",
    type: "String",
    desc: l.trans({
      en: "A subspace of the root `akan.config.ts`: the project its `workspaceId` names. Left out, the project `AKAN_WORKSPACE_ID` names.",
      ko: "루트 `akan.config.ts`의 subspace입니다. 그 `workspaceId`가 가리키는 프로젝트를 씁니다. 생략하면 `AKAN_WORKSPACE_ID`가 가리키는 프로젝트입니다.",
    }),
  };
  const envStoreNote: ReferenceRow = {
    name: l.trans({ en: "where", ko: "보관 위치" }),
    desc: l.trans({
      en: "Akan Cloud when the root `.env` sets `AKAN_WORKSPACE_ID`, otherwise an SCP server.",
      ko: "루트 `.env`에 `AKAN_WORKSPACE_ID`가 있으면 Akan Cloud, 없으면 SCP 서버입니다.",
    }),
  };

  const commands: CommandReferenceItem[] = [
    {
      name: "login",
      signature: "akan login [--host <host>]",
      desc: l.trans({
        en: "Sign in to Akan Cloud from this machine.\nThe CLI opens a sign-in page in the browser and waits until you finish there.",
        ko: "이 컴퓨터에서 Akan Cloud에 로그인합니다.\nCLI가 브라우저에 로그인 페이지를 열고, 그곳에서 로그인을 마칠 때까지 기다립니다.",
      }),
      options: [hostOption],
      notes: [
        {
          name: l.trans({ en: "browser", ko: "브라우저" }),
          desc: l.trans({
            en: "Prints the sign-in URL and a QR code and opens it; visit the URL yourself if no browser opens.",
            ko: "로그인 URL과 QR 코드를 출력하고 브라우저로 열며, 브라우저가 열리지 않으면 URL에 직접 접속합니다.",
          }),
        },
        {
          name: l.trans({ en: "time limit", ko: "제한 시간" }),
          desc: l.trans({
            en: "Gives up after 10 minutes without a sign-in, so run it again.",
            ko: "10분 안에 로그인하지 않으면 멈추므로, 다시 실행합니다.",
          }),
        },
        {
          name: l.trans({ en: "already signed in", ko: "이미 로그인됨" }),
          desc: l.trans({
            en: "Prints the account's nickname and exits without opening the browser.",
            ko: "계정 닉네임을 출력하고, 브라우저를 열지 않은 채 끝납니다.",
          }),
        },
        {
          name: l.trans({ en: "expiring session", ko: "만료 임박 세션" }),
          desc: l.trans({
            en: "Renewed first, near or past its expiry; only a failed renewal opens the browser.",
            ko: "만료가 가깝거나 지났으면 먼저 갱신하고, 갱신에 실패할 때만 브라우저를 엽니다.",
          }),
        },
        {
          name: l.trans({ en: "saved to", ko: "저장 위치" }),
          desc: l.trans({
            en: "`~/.akan/config.json`, one session per host, readable only by you.",
            ko: "`~/.akan/config.json`에 호스트마다 세션 하나를 저장하며, 본인만 읽을 수 있습니다.",
          }),
        },
        {
          name: l.trans({ en: "used by", ko: "쓰는 명령" }),
          desc: l.trans({
            en: "`akan tunnel` and `akan start --share` need it, while the env commands sign in on their own.",
            ko: "`akan tunnel`과 `akan start --share`에 필요하며, env 명령은 필요하면 스스로 로그인합니다.",
          }),
        },
      ],
      examples: `akan login
akan login --host https://cloud.example.com`,
    },
    {
      name: "logout",
      signature: "akan logout [--host <host>]",
      desc: l.trans({
        en: "Sign out of Akan Cloud on this machine.\nUse it to switch accounts, or to take this machine's cloud access away.",
        ko: "이 컴퓨터의 Akan Cloud 로그인을 해제합니다.\n계정을 바꾸거나, 이 컴퓨터의 클라우드 접근을 없앨 때 씁니다.",
      }),
      options: [hostOption],
      notes: [
        {
          name: l.trans({ en: "clears", ko: "지우는 것" }),
          desc: l.trans({
            en: "Only the session saved for that `--host`, leaving other hosts signed in.",
            ko: "그 `--host`에 저장된 세션만 지우고, 다른 호스트의 세션은 그대로 둡니다.",
          }),
        },
        {
          name: l.trans({ en: "not signed in", ko: "로그인 안 됨" }),
          desc: l.trans({
            en: "Prints that no session was found and changes nothing.",
            ko: "세션이 없다고 알리고 아무것도 바꾸지 않습니다.",
          }),
        },
      ],
      examples: `akan logout
akan logout --host https://cloud.example.com`,
    },
    {
      name: "update",
      signature: "akan update [--tag <tag>] [--registry <npm|local>]",
      desc: l.trans({
        en: "Move the global `akan` CLI and this workspace's Akan.js packages to the newest version of a release tag.\nUse `latest` for normal updates, and `beta`, `rc` or `canary` only when you mean to test that channel.",
        ko: "전역 `akan` CLI와 이 워크스페이스의 Akan.js 패키지를 릴리스 태그의 최신 버전으로 올립니다.\n보통은 `latest`를 쓰고, `beta`, `rc`, `canary`는 그 채널을 일부러 시험할 때만 씁니다.",
      }),
      options: [
        {
          name: "--tag",
          type: "String",
          defaultValue: "latest",
          enumOrFlag: "latest | dev | canary | beta | rc | alpha",
          desc: l.trans({ en: "Release channel to install from.", ko: "설치할 릴리스 채널입니다." }),
        },
        {
          name: "--registry",
          type: "String",
          defaultValue: "npm",
          enumOrFlag: "npm | local",
          desc: l.trans({
            en: "`local` is `AKAN_NPM_REGISTRY`, or `http://127.0.0.1:4873` when it is unset.",
            ko: "`local`은 `AKAN_NPM_REGISTRY`이고, 비어 있으면 `http://127.0.0.1:4873`입니다.",
          }),
        },
      ],
      notes: [
        {
          name: "package.json",
          desc: l.trans({
            en: "In a workspace, pins root `akanjs` and `@akanjs/devkit` to that version and runs `bun install`.",
            ko: "워크스페이스 안이면 루트 `package.json`의 `akanjs`와 `@akanjs/devkit`을 그 버전으로 바꾸고 `bun install`을 실행합니다.",
          }),
        },
        {
          name: l.trans({ en: "global install", ko: "전역 설치" }),
          desc: l.trans({
            en: "Installs `@akanjs/cli@<tag>` globally with `bun add -g`, and prints `akan --version` at the end.",
            ko: "`@akanjs/cli@<tag>`를 `bun add -g`로 전역 설치하고, 끝에 `akan --version`을 출력합니다.",
          }),
        },
        {
          name: "--registry local",
          desc: l.trans({
            en: "Tries a framework build from a local registry before it is published to npm.",
            ko: "npm에 배포하기 전의 프레임워크 빌드를 로컬 레지스트리에서 받아 시험합니다.",
          }),
        },
        {
          name: l.trans({ en: "framework repo", ko: "프레임워크 저장소" }),
          desc: l.trans({
            en: "With `USE_AKANJS_PKGS=true`, `--registry` has no default, so the CLI asks.",
            ko: "`USE_AKANJS_PKGS=true`이면 `--registry`에 기본값이 없어 CLI가 물어봅니다.",
          }),
        },
      ],
      examples: `akan update
akan update --tag latest
akan update --tag beta
akan update --registry local`,
    },
    {
      name: "download-env",
      signature: "akan download-env [--host <host>]",
      desc: l.trans({
        en: "Download the env values of every app and library in this workspace.\nRun it after cloning and whenever someone uploads a change, because env values are never committed.",
        ko: "이 워크스페이스의 모든 앱과 라이브러리의 env 값을 내려받습니다.\nenv 값은 커밋되지 않으므로, clone한 직후와 누군가 변경을 올렸을 때마다 실행합니다.",
      }),
      options: [envHostOption],
      notes: [
        envStoreNote,
        {
          name: l.trans({ en: "files", ko: "파일" }),
          desc: l.trans({
            en: "Unpacked at the workspace root, over the same paths `upload-env` packed.",
            ko: "`upload-env`가 묶은 경로 그대로 워크스페이스 루트에 풀어 덮어씁니다.",
          }),
        },
        {
          name: l.trans({ en: "first SCP run", ko: "첫 SCP 실행" }),
          desc: l.trans({
            en: "Asks for a server name and host, plus an optional username and SSH port.",
            ko: "서버 이름과 호스트, 그리고 비워 둘 수 있는 사용자 이름과 SSH 포트를 묻습니다.",
          }),
        },
        {
          name: l.trans({ en: "server list", ko: "서버 목록" }),
          desc: l.trans({
            en: "Kept in `~/.akan/config.json`, so later runs let you pick, add or remove a server.",
            ko: "`~/.akan/config.json`에 저장되어, 다음부터는 서버를 고르거나 추가하거나 지웁니다.",
          }),
        },
      ],
      examples: `akan download-env
akan download-env --host https://cloud.example.com`,
    },
    {
      name: "upload-env",
      signature: "akan upload-env [--host <host>]",
      desc: l.trans({
        en: "Upload the env values of every app and library to where `download-env` reads from.\nThe stored archive is replaced whole, so download first instead of uploading a stale local copy.",
        ko: "모든 앱과 라이브러리의 env 값을 `download-env`가 읽는 곳으로 올립니다.\n보관된 압축본은 통째로 바뀌므로, 오래된 로컬 사본을 올리지 말고 먼저 내려받습니다.",
      }),
      options: [envHostOption],
      notes: [
        envStoreNote,
        {
          name: l.trans({ en: "env files", ko: "env 파일" }),
          desc: l.trans({
            en: "`env/env.client.<env>.ts` and `env/env.server.<env>.ts`, without the `type` and `example` files.",
            ko: "`env/env.client.<env>.ts`와 `env/env.server.<env>.ts`이며, `type`, `example` 파일은 빠집니다.",
          }),
        },
        {
          name: "secrets",
          desc: l.trans({
            en: "Also every file matched by an app's `secrets` globs in `akan.config.ts`.",
            ko: "앱의 `akan.config.ts`에 적은 `secrets` glob에 맞는 파일도 함께 올립니다.",
          }),
        },
        {
          name: ".gitignore",
          desc: l.trans({
            en: "Each upload writes those `secrets` patterns into a managed block of `.gitignore`.",
            ko: "올릴 때마다 그 `secrets` 패턴을 `.gitignore` 안에서 akan이 관리하는 구역에 적습니다.",
          }),
        },
        {
          name: l.trans({ en: "no files", ko: "파일 없음" }),
          desc: l.trans({
            en: "Stops with an error when there is no env file to upload.",
            ko: "올릴 env 파일이 하나도 없으면 오류로 멈춥니다.",
          }),
        },
      ],
      examples: `akan upload-env
akan upload-env --host https://cloud.example.com`,
    },
    {
      name: "upload-secret",
      signature:
        "akan upload-secret <name> [--branch <debug|develop|main>] [--file <path>] [--subspace <name>] [--host <host>]",
      desc: l.trans({
        en: "Save a named secret for the pipeline steps of the project `AKAN_WORKSPACE_ID` names, or a subspace's with `--subspace`.\nThe value is write-only: no command shows it again, so keep the original where you keep other credentials.",
        ko: "`AKAN_WORKSPACE_ID`가 가리키는 프로젝트, `--subspace`를 주면 그 subspace의 프로젝트에서 파이프라인 step이 쓸 시크릿을 이름을 붙여 저장합니다.\n값은 쓰기 전용이라 어떤 명령으로도 다시 볼 수 없으니, 원본은 다른 자격 증명과 같은 곳에 보관합니다.",
      }),
      args: [
        {
          name: "name",
          type: "String",
          required: "yes",
          desc: l.trans({
            en: "Up to 64 uppercase letters, digits and `_`, starting with a letter, such as `DISCORD_WEBHOOK`. A name outside that is refused without being echoed back, since a mistyped name may be the value itself.",
            ko: "대문자, 숫자, `_`로 된 64자 이하의 이름으로, 글자로 시작합니다. 예: `DISCORD_WEBHOOK`. 이 형식이 아니면 이름을 되풀이하지 않고 거부합니다. 잘못 친 이름이 값 자체일 수 있기 때문입니다.",
          }),
        },
      ],
      options: [
        {
          name: "--branch",
          type: "String",
          defaultValue: l.trans({ en: "every branch", ko: "모든 브랜치" }),
          enumOrFlag: "debug | develop | main",
          desc: l.trans({
            en: "Use this value only in builds of that branch, over the every-branch value.",
            ko: "그 브랜치의 빌드에서만 이 값을 쓰며, 모든 브랜치용 값보다 우선합니다.",
          }),
        },
        {
          name: "--file",
          type: "String",
          desc: l.trans({
            en: "Read the value from this file instead of stdin or a hidden prompt.",
            ko: "stdin이나 숨김 입력 대신 이 파일에서 값을 읽습니다.",
          }),
        },
        subspaceOption,
        hostOption,
      ],
      notes: [
        {
          name: l.trans({ en: "value", ko: "값" }),
          desc: l.trans({
            en: "From `--file`, piped stdin or a hidden prompt; never an argument, which shell history keeps.",
            ko: "`--file`, 파이프로 넘긴 stdin, 숨김 입력 중 하나로 받습니다. 셸 기록에 남는 인자로는 받지 않습니다.",
          }),
        },
        {
          name: l.trans({ en: "stdin", ko: "stdin" }),
          desc: l.trans({
            en: "Reading stdin, it prints one line to stderr saying so, never the value. With stdin piped, a missing `<name>` is an error rather than a prompt, so the pipe is never taken for the name.",
            ko: "stdin에서 읽을 때는 그렇다는 한 줄을 stderr에 쓰고, 값은 쓰지 않습니다. stdin이 파이프로 이어져 있으면 빠진 `<name>`을 묻지 않고 오류로 멈추므로, 파이프로 넘긴 값을 이름으로 받는 일이 없습니다.",
          }),
        },
        {
          name: l.trans({ en: "order", ko: "순서" }),
          desc: l.trans({
            en: "The name and `--branch` are checked before the value is read or sign-in starts.",
            ko: "이름과 `--branch`는 값을 읽거나 로그인하기 전에 검사합니다.",
          }),
        },
        {
          name: l.trans({ en: "size", ko: "크기" }),
          desc: l.trans({
            en: "An empty value or one over 64 KiB is refused; one trailing newline is dropped.",
            ko: "빈 값이나 64 KiB를 넘는 값은 거부하고, 끝의 줄바꿈 하나는 뗍니다.",
          }),
        },
        {
          name: l.trans({ en: "reserved", ko: "예약된 이름" }),
          desc: l.trans({
            en: "`CI`, every `AKAN_CI_*` and shell names such as `PATH` are refused.",
            ko: "`CI`, 모든 `AKAN_CI_*`, `PATH` 같은 셸 이름은 거부합니다.",
          }),
        },
        {
          name: l.trans({ en: "takes effect", ko: "적용 시점" }),
          desc: l.trans({
            en: "Builds that start after the upload use the new value.",
            ko: "올린 뒤에 시작하는 빌드부터 새 값을 씁니다.",
          }),
        },
      ],
      examples: `akan upload-secret DISCORD_WEBHOOK
akan upload-secret DEPLOY_KEY --file ./deploy_key --branch main
printf %s "$NPM_TOKEN" | akan upload-secret NPM_TOKEN`,
    },
    {
      name: "list-secrets",
      signature: "akan list-secrets [--branch <debug|develop|main>] [--subspace <name>] [--host <host>]",
      desc: l.trans({
        en: "List the project's pipeline secrets with their scope and who set each one last.\nValues are never shown.",
        ko: "프로젝트의 파이프라인 시크릿을 범위, 마지막으로 바꾼 사람과 함께 나열합니다.\n값은 보여 주지 않습니다.",
      }),
      options: [
        {
          name: "--branch",
          type: "String",
          enumOrFlag: "debug | develop | main",
          desc: l.trans({
            en: "Show only what builds of that branch use: its own values and the every-branch ones.",
            ko: "그 브랜치의 빌드가 쓰는 것만 보여 줍니다. 그 브랜치 전용 값과 모든 브랜치용 값입니다.",
          }),
        },
        subspaceOption,
        hostOption,
      ],
      notes: [
        {
          name: l.trans({ en: "columns", ko: "열" }),
          desc: l.trans({
            en: "`NAME`, `SCOPE` (`every branch` or a branch), `UPDATED` and `BY`; a cell the project does not know, such as an unknown last writer, shows `-`.",
            ko: "`NAME`, `SCOPE`(`every branch` 또는 브랜치 이름), `UPDATED`, `BY`입니다. 마지막으로 바꾼 사람처럼 프로젝트가 모르는 칸은 `-`로 보여 줍니다.",
          }),
        },
      ],
      examples: `akan list-secrets
akan list-secrets --branch main`,
    },
    {
      name: "remove-secret",
      signature: "akan remove-secret <name> [--branch <debug|develop|main>] [--subspace <name>] [--host <host>]",
      desc: l.trans({
        en: "Remove a pipeline secret from the project.\nBuilds that start afterwards no longer receive it.",
        ko: "프로젝트에서 파이프라인 시크릿을 지웁니다.\n지운 뒤에 시작하는 빌드는 그 값을 받지 않습니다.",
      }),
      args: [
        {
          name: "name",
          type: "String",
          required: "yes",
          desc: l.trans({ en: "Name of the secret to remove.", ko: "지울 시크릿의 이름입니다." }),
        },
      ],
      options: [
        {
          name: "--branch",
          type: "String",
          defaultValue: l.trans({ en: "every branch", ko: "모든 브랜치" }),
          enumOrFlag: "debug | develop | main",
          desc: l.trans({
            en: "Remove that branch's own value; without it, the every-branch value goes.",
            ko: "그 브랜치 전용 값을 지웁니다. 없으면 모든 브랜치용 값을 지웁니다.",
          }),
        },
        subspaceOption,
        hostOption,
      ],
      notes: [
        {
          name: l.trans({ en: "not there", ko: "없는 시크릿" }),
          desc: l.trans({
            en: "Removing a secret that does not exist says so and changes nothing.",
            ko: "없는 시크릿을 지우면 그렇다고 알리고 아무것도 바꾸지 않습니다.",
          }),
        },
      ],
      examples: `akan remove-secret DISCORD_WEBHOOK
akan remove-secret DEPLOY_KEY --branch main`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="cloud-cli" title={l.trans({ en: "Cloud CLI", ko: "클라우드 명령" })}>
        <Docs.Title>{l.trans({ en: "Cloud CLI", ko: "클라우드 명령" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Eight optional commands for signing in to Akan Cloud, updating the framework, moving env values and managing pipeline secrets. Internal deployment commands are left out of this page on purpose.",
              ko: "Akan Cloud 로그인, 프레임워크 업데이트, env 값 옮기기, 파이프라인 시크릿 관리에 쓰는 명령 여덟 가지로, 필요할 때만 씁니다. 내부 배포용 명령은 일부러 이 페이지에서 뺐습니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubSubTitle>{l.trans({ en: "Words Used on This Page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
        <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

        <Docs.SubSubTitle>
          {l.trans({ en: "Where Each Command Connects", ko: "명령마다 접속하는 곳" })}
        </Docs.SubSubTitle>
        <Docs.Matrix
          type={l.trans({ en: "Command", ko: "명령" })}
          columns={[
            { key: "cloud", label: "Akan Cloud" },
            { key: "scp", label: "SCP" },
            { key: "npm", label: "npm" },
            { key: "local", label: l.trans({ en: "This machine only", ko: "이 컴퓨터만" }) },
          ]}
          groups={connectionGroups}
          markLabel={l.trans({ en: "Connects", ko: "접속함" })}
          emptyLabel={l.trans({ en: "Does not connect", ko: "접속 안 함" })}
        />
        <ul className="my-4 list-disc space-y-2 pl-5">
          {sharedRules.map((rule, idx) => (
            <li key={idx}>{rule}</li>
          ))}
        </ul>

        <Docs.SubSubTitle>{l.trans({ en: "Where Env Values Are Kept", ko: "env 값을 보관하는 곳" })}</Docs.SubSubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>download-env</code> and <code>upload-env</code> read the root <code>.env</code> to pick the
                  store. Both use the same one, so what one uploads the other downloads.
                </span>
              ),
              ko: (
                <span>
                  <code>download-env</code>와 <code>upload-env</code>는 루트 <code>.env</code>를 읽어 보관 위치를
                  정합니다. 둘은 같은 곳을 쓰므로, 올린 것을 그대로 내려받습니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Docs.Table
          columns={[
            { key: "store", label: l.trans({ en: "Store", ko: "보관처" }) },
            { key: "when", label: l.trans({ en: "Used when", ko: "쓰는 경우" }) },
            { key: "where", label: l.trans({ en: "Where the archive lives", ko: "압축본이 있는 곳" }) },
          ]}
          rows={storeRows}
          stacked
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: (
              <>
                <strong>Both directions overwrite.</strong> <code>upload-env</code> replaces the stored archive whole,
                and <code>download-env</code> writes over local files at the same paths. Download before you edit, and
                upload right after.
              </>
            ),
            ko: (
              <>
                <strong>양쪽 모두 덮어씁니다.</strong> <code>upload-env</code>는 보관된 압축본을 통째로 바꾸고,{" "}
                <code>download-env</code>는 같은 경로의 로컬 파일을 덮어씁니다. 고치기 전에 내려받고, 고친 뒤 바로
                올립니다.
              </>
            ),
          })}
        </Docs.Alert>

        <Docs.SubSubTitle>{l.trans({ en: "Pipeline Secrets", ko: "파이프라인 시크릿" })}</Docs.SubSubTitle>
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <>
                  <strong>They belong to a project.</strong> The root <code>.env</code>'s <code>AKAN_WORKSPACE_ID</code>{" "}
                  names it, or <code>--subspace</code> a subspace's <code>workspaceId</code>, and only its members
                  signed in with <code>akan login</code> may change or list them.
                </>
              ),
              ko: (
                <>
                  <strong>시크릿은 프로젝트에 속합니다.</strong> 루트 <code>.env</code>의 <code>AKAN_WORKSPACE_ID</code>
                  가, <code>--subspace</code>를 주면 그 subspace의 <code>workspaceId</code>가 프로젝트를 정하고,{" "}
                  <code>akan login</code>으로 로그인한 그 프로젝트 멤버만 바꾸거나 볼 수 있습니다.
                </>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <>
                  <strong>A step asks for one by name.</strong> Only a step that lists the name in <code>secrets</code>{" "}
                  receives it, as an environment variable of that name.
                </>
              ),
              ko: (
                <>
                  <strong>step은 이름으로 시크릿을 요청합니다.</strong> <code>secrets</code>에 그 이름을 적은 step만,
                  같은 이름의 환경변수로 값을 받습니다.
                </>
              ),
            })}
          </li>
        </ul>
        <Docs.Alert type="warning">
          {l.trans({
            en: (
              <>
                <strong>Anyone who can push to the repository can read a secret.</strong> A step they add can print it,
                the same model as GitHub Actions secrets, so grant push access as you would grant the secret itself.
              </>
            ),
            ko: (
              <>
                <strong>저장소에 push할 수 있는 사람은 시크릿을 읽을 수 있습니다.</strong> 그 사람이 추가한 step이 값을
                출력할 수 있기 때문입니다. GitHub Actions 시크릿과 같은 모델이므로, push 권한은 시크릿 자체를 주듯이
                신중하게 줍니다.
              </>
            ),
          })}
        </Docs.Alert>

        <Docs.SubSubTitle>{l.trans({ en: "Related Pages", ko: "관련 페이지" })}</Docs.SubSubTitle>
        <Docs.LinkGrid
          items={[
            {
              href: "/docs/core/config#app-env",
              title: l.trans({ en: "Application Env", ko: "애플리케이션 환경설정" }),
              desc: l.trans({
                en: "What goes in the `env/` files these commands move.",
                ko: "이 명령들이 옮기는 `env/` 파일에 무엇을 적는지 설명합니다.",
              }),
            },
            {
              href: "/conventions/applib/config#secrets",
              title: "secrets",
              desc: l.trans({
                en: "Declare extra secret files that travel with the env values.",
                ko: "env 값과 함께 옮길 시크릿 파일을 선언합니다.",
              }),
            },
            {
              href: "/cheatsheet/dev/pipeline",
              title: l.trans({ en: "Build Pipeline", ko: "빌드 파이프라인" }),
              desc: l.trans({
                en: "Give a pipeline step a secret it reads at build time.",
                ko: "파이프라인 step에 빌드 때 읽을 시크릿을 줍니다.",
              }),
            },
            {
              href: "/references/cli/tunnel",
              title: l.trans({ en: "Tunnel CLI", ko: "터널 명령" }),
              desc: l.trans({
                en: "Share a local app on a public URL with the `akan login` session.",
                ko: "`akan login` 세션으로 로컬 앱을 공개 URL에 공유합니다.",
              }),
            },
          ]}
        />
      </Scroll.Slide>
      {commands.flatMap((command) => [
        <Divider key={`${command.name}-divider`} />,
        <CommandReferenceSlide key={command.name} command={command} />,
      ])}
      <DocsToc />
    </Scroll>
  );
});
