# @akanjs/devkit

[문서](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/devkit) | [런타임](https://www.npmjs.com/package/akanjs)

Akan.js를 위한 development tooling primitive입니다.

`@akanjs/devkit`은 Akan CLI와 프레임워크 수준 tooling에서 사용하는 build runner, workspace
executor, config loader, dependency scanner, frontend artifact builder, command decorator, prompt,
release helper를 담고 있습니다. 애플리케이션 런타임 코드가 아니라 tooling과 package author를 위한
패키지입니다.

## 설치

대부분의 사용자는 devkit 대신 CLI를 설치하면 됩니다.

```bash
bun install -g @akanjs/cli@latest
```

Akan-aware tooling을 직접 만들 때만 `@akanjs/devkit`을 설치하세요.

```bash
bun add -d @akanjs/devkit
```

## 사용 예시

```ts
import { ApplicationBuildRunner, WorkspaceExecutor } from "@akanjs/devkit";

const workspace = WorkspaceExecutor.fromRoot();
const app = await workspace.getApp("my-app");
const runner = new ApplicationBuildRunner(app);

await runner.build();
```

## 제공하는 것

- Workspace, app, library, package, module executor.
- `akan.config.ts` 로딩과 정규화.
- Application build, typecheck, SSR, CSR, release runner.
- Dependency scanning과 package metadata 생성 helper.
- Frontend build transform과 RSC/SSR artifact builder.
- `@akanjs/cli`가 사용하는 command/script decorator.
- AI prompt, guideline, code-generation 지원 utility.
- Capacitor와 mobile release helper.

## 패키지 경계

- 런타임 코드는 `akanjs`에서 import해야 합니다. `AppConfig`, `LibConfig`, `AppInfo`, `LibInfo` 같은
  공유 config 타입도 `akanjs`에서 가져옵니다.
- CLI 사용자는 `@akanjs/cli`를 설치하면 됩니다. published CLI는 이 devkit을 내부에 번들링합니다.
- Tooling author는 Akan workspace introspection이나 build API가 필요할 때 `@akanjs/devkit`을 직접
  import할 수 있습니다.

## 요구사항

- [Bun](https://bun.sh) `>=1.3.13`
- TypeScript
- Optional peer는 Capacitor integration처럼 해당 기능을 사용할 때만 필요합니다.

## 라이선스

MIT
