# Akan.js

[English](https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/README.md) | [문서](https://akanjs.com/docs) | [v3 릴리스 노트](https://akanjs.com/blog/v3release) | [npm](https://www.npmjs.com/package/akanjs)

<img width="600" alt="Akan.js — 한 줄의 비즈니스 코드로 모든 면을." src="https://akanjs.com/jelly/og.jpg" />

**에이전트까지 들어 있는 TypeScript 프레임워크.** Bun으로 구동합니다.

Akan.js는 풀스택 TypeScript 프레임워크입니다. 필드 선언 한 줄이 스키마, 서비스, API, 클라이언트 상태, UI를 모두
지나고, 같은 코드가 웹 앱, iOS·Android 앱, 데스크톱 앱으로 나갑니다. 가드를 단 엔드포인트는 그대로 MCP 툴이, 화면의
컨트롤은 인페이지 에이전트 툴이 되고, 사람이 지나는 가드를 똑같이 지납니다.

## 빠른 시작

### 코딩 에이전트로 시작하기

빈 디렉터리에서 Claude Code나 Codex를 열고 아래 프롬프트를 붙여 넣으세요. 워크스페이스와 앱 이름을 그 아래에
적어 두거나, 에이전트가 묻게 두면 됩니다.

```text
Akan.js(https://akanjs.com) 워크스페이스를 새로 만들어 줘.

1. Bun 1.4.4 이상이 설치돼 있는지 확인해 줘(`bun --version`). 없거나 버전이 낮으면 https://bun.sh 안내대로 설치하거나 업그레이드해 줘.
2. 워크스페이스 이름과 첫 앱 이름을 물어봐 줘. 짧은 영문 소문자로, 아래에 적어 뒀다면 그걸 쓰면 돼.
3. 이 디렉터리에서 `bunx create-akan-workspace@latest <워크스페이스> --app <앱>`을 실행해 줘. akan CLI를 전역으로 설치하고, ./<워크스페이스>를 만들어 의존성까지 설치해.
4. ./<워크스페이스> 안에서 `akan start <앱>`으로 개발 서버를 백그라운드에 띄우고, 출력된 주소(기본 http://localhost:8282)가 열리는지 확인해 줘.
5. 다 되면 알려 주고, ./<워크스페이스> 안에서 너를 다시 열라고 안내해 줘. 프로젝트의 Akan MCP 서버와 AGENTS.md 규칙은 거기서 로드돼.
```

새 워크스페이스에는 에이전트가 따를 것이 이미 들어 있습니다. `AGENTS.md`와 `CLAUDE.md`, Cursor 규칙, 그리고
Claude Code·Codex·Cursor에 등록된 Akan MCP 서버입니다. 워크스페이스 안에서 에이전트를 다시 열어야 이것들이
로드됩니다.

### 터미널로 시작하기

[Bun](https://bun.sh) `>=1.4.4`이 필요합니다.

```bash
bunx create-akan-workspace@latest
cd <workspace-name>
akan start <app-name> --open
```

워크스페이스 이름과 앱 이름을 물은 뒤 `akan` CLI와 워크스페이스 의존성을 설치하고 샘플 앱을 만들어 줍니다. 앱은
`http://localhost:8282`에서 열립니다.

### 기존 저장소 안에서 시작하기

앱이 놓일 폴더와 실행 방식이 정해진 작업이라면, 예를 들어 다른 저장소의 하위 폴더, Node와 npm만 있는 호스트, 스펙이 정한
URL이라면, 코딩 에이전트는 묻지 않고 아래대로 진행하면 됩니다.

- **그 폴더에 바로 만들기:** `bunx create-akan-workspace@latest . --app <app> --dir <folder> --sample false`.
  `<folder>` 자체에 쓰고, 이미 있는 파일은 덮어쓰지 않고 멈추며, 샘플 모듈과 페이지는 만들지 않습니다. 함께 생기는
  `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`, `.cursor/`, `.mcp.json`은 지우지 마세요. 에이전트가 따를 규칙과
  도구가 들어 있습니다.
- **`<folder>`에서 작업하기.** `akan`은 워크스페이스 루트에서만 실행되고, 그곳에서 연 에이전트 세션이 워크스페이스의
  규칙과 MCP 서버를 불러옵니다.
- **변경마다 `akan verify <app>`로 확인하기.** sync, lint, 타입체크, 빌드, SSR 검사를 한 번에 하고 실패한 것만
  출력합니다. `akan preview <app> --changed`는 변경이 닿는 페이지를 열어 봅니다.
- **정해진 URL:** 페이지는 기본적으로 `/<locale>/…` 아래에 있습니다. 기본 로케일을 프리픽스 없는 경로
  (`/books/OL45804W`)로 내보내려면 `akan.config.ts`에 `i18n: { defaultLocale: "en", locales: ["en"], localePrefix:
  "as-needed" }`를 두세요. `<Link>`도 따라갑니다.
- **Node와 npm만 있는 호스트:** `npx -y bun@1.4.4 x create-akan-workspace@latest . --app <app> --dir <folder> --sample false`를
  실행한 뒤 `npm run build`, `PORT=3000 npm start`로 빌드하고 띄웁니다. 생성기가 쓰는 script와 새로 clone한 사본에
  필요한 것은 [`create-akan-workspace` README](https://github.com/akan-team/akanjs/blob/main/pkgs/create-akan-workspace/README.ko.md#node와-npm만-있을-때)에
  있습니다.
- **실행할 곳에 맞게 빌드하기.** 셸이나 Bun이 읽는 `.env.local`에서 지정한 변수가 워크스페이스 `.env`보다 우선하고(빈
  값은 지정하지 않은 것으로 보며, 빌드는 그렇게 가져간 값을 하나씩 알려 줍니다), `AKAN_PUBLIC_ENV`는 `--env`가 둘보다
  우선합니다. 새 워크스페이스의 `.env`는 `local`이라 내 컴퓨터나 테스트 러너에서는 이대로 맞지만, 서버가
  엔드포인트 rate limit 없이 로컬 기본값으로 실행됩니다. 다른 사람이 접속하는 호스트라면 셸이나 워크스페이스 `.env`에
  `AKAN_PUBLIC_REPO_NAME`과 `AKAN_PUBLIC_SERVE_DOMAIN`(서비스할 도메인)을 지정하고 `akan build <app> --env main`을
  실행하세요.

## 첫 앱 만들기

- **화면**은 `apps/<app>/page/` 아래 파일입니다. `<route>.tsx`나 `_index.tsx`, 그 바깥의 `_layout.tsx`, 경로
  세그먼트는 `[id]/`이고, `akanjs/client`의 `page()` 체인 하나를 export합니다. [라우팅](https://akanjs.com/docs/core/routing)
- **저장되는 모델**은 `lib/<model>/` 모듈이고 `akan create-module <model> <app>`으로 만듭니다. 외부 API처럼 저장할
  모델이 없는 서비스는 `akan create-service <service> <app>`으로 `lib/_<service>/`에 둡니다.
  [파일 규칙](https://akanjs.com/docs/core/file-rule)
- 코딩 에이전트가 따르는 **규칙**은 워크스페이스 안에 있습니다. `AGENTS.md`, `.claude/rules/akan/`, 그리고
  `.claude/skills/`와 `.agents/skills/`의 스킬입니다. `akan guideline show <name>`은 번들된 가이드라인을 출력합니다.
- **`akan.config.ts`**는 비워 둬도 됩니다. 라우트, 도메인, 로케일, 데이터베이스 모드, 네이티브 앱이 필요할 때만
  늘어납니다. [설정](https://akanjs.com/docs/core/config)

## 빌드와 실행

```bash
akan start <app>                            # 개발 서버, http://localhost:8282
akan verify <app>                           # sync, lint, 타입체크, 빌드, SSR 검사
akan build <app>                            # dist/apps/<app>에 프로덕션 빌드
cd dist/apps/<app> && PORT=3000 bun main.js
```

[Akan Cloud](https://cloud.akanjs.com)는 Akan 앱을 실행하는 플랫폼입니다. `akan login`으로 로그인하고,
`akan tunnel <app>`으로 실행 중인 앱을 공개 URL로 공유합니다.

## 더 보기

- [akanjs.com](https://akanjs.com): 코드 한 줄이 닿는 곳, 에이전트의 인터페이스가 되는 화면, MCP 서버가 되는 서버.
- [문서](https://akanjs.com/docs), [CLI 레퍼런스](https://akanjs.com/references/cli/overview),
  [`llms.txt`](https://akanjs.com/llms.txt). 코딩 에이전트에 `https://akanjs.com/mcp`를 연결하면 코드를 쓰면서 문서를
  읽습니다.
- [MCP](https://akanjs.com/cheatsheet/interface/mcp)와 [인페이지 에이전트](https://akanjs.com/cheatsheet/interface/agent-chat):
  가드, 거절, rate limit, 모델 설정.
- [v3 성능](https://akanjs.com/blog/v3release#v3-performance): v2와 비교한 수치와 측정 방법.
- `akanjs`는 npm 패키지 하나입니다. subpath(`akanjs/base`, `akanjs/client`, `akanjs/signal`, `akanjs/ui`, …)가 서버
  전용, 클라이언트 전용, UI, 툴링 코드를 나누고([패키지 레퍼런스](https://akanjs.com/references/akanjs/base)), 툴링은
  `@akanjs/cli`와 `@akanjs/devkit`으로 나옵니다.
- 기여: [`CONTRIBUTING.md`](https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/CONTRIBUTING.md)와
  [행동 강령](https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/CODE_OF_CONDUCT.md). 라이선스: MIT
  ([`LICENSE`](https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/LICENSE)).
