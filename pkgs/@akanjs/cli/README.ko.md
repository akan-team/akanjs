# @akanjs/cli

[English](https://github.com/akan-team/akanjs/blob/main/pkgs/@akanjs/cli/README.md) | [문서](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/cli) | [런타임](https://www.npmjs.com/package/akanjs)

에이전트까지 들어 있는 TypeScript 프레임워크 [Akan.js](https://akanjs.com)의 `akan` 명령입니다.

`akan`은 Akan 워크스페이스를 만들고, 실행하고, 빌드하고, 테스트하고, 배포합니다. 하나의 코드베이스에서 웹,
iOS, Android, 데스크톱 앱이 나오고, 코딩 에이전트에게는 따라야 할 규칙과 도구를 줍니다. Bun-first 패키지이며 Akan
개발 도구를 내부에 번들하므로, 애플리케이션 런타임은 더 작은 `akanjs` 패키지에만 의존합니다.

## 설치

Claude Code나 Codex로 시작한다면 [시작하기](https://akanjs.com/docs/intro/quickstart)의 프롬프트를 붙여 넣으세요.
에이전트가 워크스페이스를 만들어 줍니다.

터미널에서는 이렇게 시작합니다.

```bash
bunx create-akan-workspace@latest
```

또는 CLI를 전역으로 설치합니다.

```bash
bun install -g @akanjs/cli
akan --help
```

## 자주 쓰는 명령

```bash
akan create-workspace <workspace> --app <app>
akan create-application <app>
akan create-library <lib>
akan create-module <module>
akan create-scalar <scalar>
akan start <app> --open
akan build <app>
akan typecheck <app>
akan lint <app-or-lib-or-pkg>
akan test <app-or-lib-or-pkg>
akan logs <app>
akan update
```

- `akan start`는 여러 앱을 한 번에 받습니다(`akan start a,b`, 또는 `all`). 앱마다 로그를 나눠 보여 주는 전체
  화면으로 열리고, `--plain`은 접두어가 붙은 줄 출력으로, `--kill`은 개발 포트를 먼저 비우고, `--share`는 앱마다
  공개 URL을 붙입니다. 모든 세션은 `local/apps/<app>/runtime/dev.log`에도 기록됩니다.
- `akan logs <app>`은 실행 중인 서버의 로그를 `--level`, `--grep`, `--endpoint`, `--trace`, `--origin`으로 걸러
  따라갑니다.

## 네이티브 앱

```bash
akan start-ios <app>        # start-android, start-desktop도 있습니다
akan build-ios <app>        # build-android, build-desktop도 있습니다
akan release-ios <app>      # release-android도 있습니다
akan update-keygen <app>
akan publish-update <app>
```

iOS, Android, macOS, Windows, Linux 앱은 앱의 CSR 번들을 Akan 네이티브 런타임에 올려 만들고,
`akan.config.ts`의 `native` 섹션에서 설정합니다.

## 코딩 에이전트를 위한 명령

```bash
akan code "작업에 마감일을 추가해 줘"   # 터미널 코딩 에이전트
akan agent install all                # AGENTS.md, CLAUDE.md, Cursor 규칙
akan mcp-install all                  # Cursor, Claude Code, Codex에 Akan MCP 서버 등록
akan mcp --mode plan                  # stdio MCP 서버: readonly, plan, apply
akan workflow list                    # MCP 없이 같은 워크플로: list, explain, plan, apply
akan guideline show ssrRule
akan context --format json
akan doctor --strict --format json
akan quality ssr
akan repair generated
```

새 워크스페이스에는 규칙과 MCP 서버가 이미 설치돼 있습니다. MCP 서버는 `readonly` 모드에서 읽기만 하고, `plan`
모드에서 워크플로를 계획하며, `mcp-install`이 등록하는 `apply` 모드에서는 계획을 적용하고 검증과 수리 도구까지
실행합니다. 에이전트는 워크플로를 거쳐 코드를 고치므로 워크스페이스 규칙을 우회하지 않고 따릅니다. `akan code`는
같은 규칙, 워크플로, 스킬 위에서 일하는 터미널 에이전트입니다.

## Akan Cloud

```bash
akan login           # Akan Cloud에 로그인
akan tunnel <app>    # 실행 중인 앱을 공개 URL로 공유
akan build <app>     # Akan Cloud가 돌릴 프로덕션 결과물 빌드
```

## 패키지 유지보수

프레임워크 메인테이너는 같은 실행 파일로 Akan 패키지를 빌드하고 검증합니다.

```bash
akan build-package akanjs
akan build-package @akanjs/cli
akan build-package @akanjs/devkit
akan build-package create-akan-workspace
akan verify-akan-publish-packages
akan smoke-registry --test=true --tag=rc
```

Akan 프레임워크 패키지는 `dist/pkgs/*`에서만 배포합니다. `verify-akan-publish-packages`는 빌드된 패키지에
`npm pack --dry-run --json`을 실행해 `deploy-akan`이나 로컬 레지스트리 스모크 전에 맞아야 하는 메타데이터를
확인합니다. 저장소 릴리스에서는 `bun run release:build-packages && bun run release:verify-packages`를 쓰세요. CLI
패키지 결과물이 마지막에 빌드되어 루트 `akan` 부트스트랩 스크립트가 덮어쓰지 않습니다.

## 패키지 경계

- 애플리케이션과 런타임 코드에서는 `akanjs`를 사용합니다.
- 사용자용 실행 파일 패키지는 `@akanjs/cli`입니다.
- `@akanjs/devkit`은 배포된 CLI 안에 번들되므로, 일반 CLI 사용자는 따로 설치할 필요가 없습니다.
- `akan code` 에이전트도 같은 경계를 따릅니다. 엔진, 도구, 스킬은 devkit facet(`@akanjs/devkit/codeAgent`)이고,
  `@akanjs/cli/code`는 터미널 호스트이자 둘을 다시 내보내는 SDK 진입점입니다.

## 요구사항

- [Bun](https://bun.sh) `>=1.4.4`
- TypeScript Akan 워크스페이스
- 네이티브 빌드: Xcode(iOS), Android SDK와 JDK 21(Android), Rust(데스크톱)

## 라이선스

MIT
