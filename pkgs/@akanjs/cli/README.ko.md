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

## 종료 코드

| 종료 코드 | `code` | 뜻 |
| --- | --- | --- |
| 0 | | 끝남 |
| 1 | `failed`, 또는 에러 자체의 코드 | 명령이 실패함 |
| 2 | `usage`, `unknownTarget` | 명령줄이나 그것이 가리키는 대상을 고쳐야 함: 모르는 플래그나 명령, 선택지 밖의 값, 물어볼 터미널이 없는 인자, 워크스페이스에 없는 앱·라이브러리·패키지·모듈 |
| 2 | `refused` | 거절됨: 새 스토어 빌드가 필요한 팩(`akan pack-update --against`, `akan push-update`, `akan register-binary`), Akan Cloud 프로젝트가 거절한 릴리스 |
| 3 | `checkFailed` | 검사가 돌았고 문제를 찾음: `akan verify`, `akan typecheck`와 `akan build`의 타입 검사, `akan preview`, `akan agent install --check` |
| 130 | `interrupted` | 중단됨, Ctrl+C로 닫은 프롬프트 포함 |

일부 명령은 한 계열의 코드를 고정합니다. `akan pack-update`, `akan push-update`, `akan register-binary`는 usage나
unknown-target 실패에 1로 끝나므로, 이 명령의 2는 늘 스토어 빌드나 거절만 뜻합니다. `akan agent`도 같은 실패에
1로 끝납니다. Claude Code가 훅의 종료 코드 2를 차단으로 읽기 때문에, `akan agent hook`은 2로 끝나지 않습니다.
`akan doctor --strict`, `akan workflow`, `akan subspace`는 보고서가 실패나 거절을 말할 때 1로 끝납니다.

`--json`이나 `--format json`을 주면 stdout에는 JSON만 나옵니다. 실패하면 마지막 줄이
`{"ok":false,"error":"<메시지>","code":"<코드>"}`이고, 메시지는 stderr로 갑니다. NDJSON 스트림(`akan code --json`,
`akan logs --json`)도 그 줄로 끝납니다. `akan verify`처럼 자체 JSON 보고서가 실패를 말하는 명령은 이 줄을
덧붙이지 않습니다. 고유 코드를 쓰는 명령이 둘 있습니다. `akan pipeline`은 오류가 있는 계획이면 1, 계획을 세우지
못하면 2로 끝나고, `akan migrate`는 자체 JSON 줄로 답하며 `usage`, `invalidParam`, `notFound` 코드면 2,
`verifyFailed`면 3으로 끝납니다.

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

릴리스 후보(rc)는 CI가 배포합니다. `rc` 브랜치에 push될 때마다 CI 전체를 돌린 뒤, 대기 중인 changeset이
릴리스할 버전의 다음 `<version>-rc.N`을 npm provenance와 함께 배포하고 그 커밋에 `v<version>-rc.N` 태그를 붙입니다.
정식 릴리스는 지금처럼 수동입니다: `bun run changeset:version`, 커밋해서 `main`에 push, 그다음
`akan deploy-akan --registry npm`. npm 배포가 끝나면 `deploy-akan`이 그 커밋으로 에디터 확장 릴리스를 CI에
요청합니다. 커밋이 아직 `main`에 없으면 push한 뒤 돌릴 `gh workflow run` 명령을 알려 줍니다.
`npm-publish` environment는 `rc`만 허용하므로 `rc`에 push할 수 있는 사람은 rc를 배포할 수 있습니다. 저장소 규칙에서
`rc` push 권한을 제한하세요.

`akan sync-architecture`는 `pkgs/akanjs/ARCHITECTURE.md`의 패싯 레이어와 프로세스 메시지 표를 프레임워크 소스에서
다시 만들고, 손으로 쓴 부분이 소스에 더는 없는 클래스를 가리키면 실패합니다.

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
