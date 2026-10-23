# @akanjs/devkit

[English](https://github.com/akan-team/akanjs/blob/main/pkgs/@akanjs/devkit/README.md) | [문서](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/devkit) | [런타임](https://www.npmjs.com/package/akanjs)

Akan.js를 위한 development tooling primitive입니다.

`@akanjs/devkit`은 Akan CLI와 프레임워크 수준 tooling에서 사용하는 build runner, workspace
executor, config loader, dependency scanner, frontend artifact builder, command decorator, prompt,
release helper를 담고 있습니다. 애플리케이션 런타임 코드가 아니라 tooling과 package author를 위한
패키지입니다.

## 설치

대부분의 사용자는 devkit 대신 CLI를 설치하면 됩니다.

```bash
bun install -g @akanjs/cli
```

Akan-aware tooling을 직접 만들 때만 `@akanjs/devkit`을 설치하세요.

```bash
bun add -d @akanjs/devkit
```

## 사용 예시

```ts
import { ApplicationBuildRunner } from "@akanjs/devkit/applicationBuildRunner";
import { AppExecutor, WorkspaceExecutor } from "@akanjs/devkit/executors";

const workspace = WorkspaceExecutor.fromRoot();
const app = AppExecutor.from(workspace, "my-app");
const runner = new ApplicationBuildRunner(app);

await runner.typecheck();
await runner.build();
```

값은 그것을 가진 facet에서 import합니다(`@akanjs/devkit/executors`, `@akanjs/devkit/akanConfig`,
`@akanjs/devkit/workflow` 등). 루트 `@akanjs/devkit` 진입점은 타입만 내보내므로, 도구 하나를 불러도 모든 facet이
프로세스에 올라오지 않습니다.

## 제공하는 것

- Workspace, app, library, package, module executor.
- `akan.config.ts` 로딩과 정규화.
- Application build, typecheck, SSR, CSR, release runner.
- Dependency scanning과 package metadata 생성 helper.
- Frontend build transform과 RSC/SSR artifact builder.
- `@akanjs/cli`가 사용하는 command/script decorator.
- 가이드라인, 코드 생성, 그리고 `akan workflow`와 Akan MCP 서버 뒤의 계획 후 적용 워크플로.
- 공유 Biome 설정(`@akanjs/devkit/biome.base.json`)과 모든 워크스페이스가 확장하는 grit lint 규칙.
- Akan 네이티브 런타임 기반 앱 빌드(iOS, Android, macOS, Windows, Linux), 스토어 릴리스, 서명된 업데이트 릴리스.
- `akan code` 에이전트 엔진, 에이전트가 쓰는 도구, 함께 배포되는 akan 스킬(`@akanjs/devkit/codeAgent`).

## 개발 서버 메모리

개발 서버는 커지는 프로세스를 재활용해 스스로 메모리를 묶어 두며, 쓰는 임계값은 모두 환경 변수로 바꿀 수
있습니다. [`DEV_RUNTIME_KNOBS.md`](https://github.com/akan-team/akanjs/blob/main/pkgs/@akanjs/devkit/DEV_RUNTIME_KNOBS.md)에 기본값, `AKAN_MEMORY_LIMIT`에서 나누는 몫, 작은
컨테이너에서 예상할 동작이 정리돼 있습니다.

## 패키지 경계

- 런타임 코드는 `akanjs`에서 import해야 합니다. `AppConfig`, `LibConfig`, `AppInfo`, `LibInfo` 같은
  공유 config 타입도 `akanjs`에서 가져옵니다.
- CLI 사용자는 `@akanjs/cli`를 설치하면 됩니다. published CLI는 이 devkit을 내부에 번들링합니다.
- Tooling author는 Akan workspace introspection이나 build API가 필요할 때 `@akanjs/devkit`을 직접
  import할 수 있습니다.

## 요구사항

- [Bun](https://bun.sh) `>=1.4.4`
- TypeScript
- `react`는 optional peer이며, 렌더링하는 기능에서만 필요합니다.

## 라이선스

MIT
