# @akanjs/cli

[문서](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/cli) | [런타임](https://www.npmjs.com/package/akanjs)

Akan.js 워크스페이스를 위한 command-line tooling입니다.

`@akanjs/cli`는 Akan 애플리케이션, 라이브러리, 프레임워크 패키지를 생성, 빌드, 테스트, 린트,
릴리즈, 유지보수하는 데 사용하는 `akan` 실행 파일을 제공합니다. Bun-first CLI 패키지이며 Akan
개발 tooling을 내부에 번들링하므로, 애플리케이션 런타임은 더 작은 `akanjs` 패키지에만 의존할 수
있습니다.

## 설치

새 워크스페이스를 바로 만들 수 있습니다.

```bash
bunx create-akan-workspace@latest
```

또는 CLI를 전역으로 설치할 수 있습니다.

```bash
bun install -g @akanjs/cli@latest
akan --help
```

## 자주 쓰는 명령

```bash
akan create-workspace <workspace-name>
akan start <app-name>
akan build <app-name>
akan test <app-or-lib-or-pkg>
akan lint <app-or-lib-or-pkg>
akan create-application <app-name>
akan create-library <lib-name>
akan create-module <module-name>
akan create-scalar <scalar-name>
```

패키지 유지보수 명령도 같은 실행 파일에서 제공합니다.

```bash
akan build-package akanjs
akan build-package @akanjs/cli
akan build-package @akanjs/devkit
akan build-package create-akan-workspace
akan verify-akan-publish-packages
akan smoke-registry --test=true --tag=rc
```

Akan framework 패키지는 반드시 `dist/pkgs/*` 산출물 기준으로 publish합니다. `verify-akan-publish-packages`는
빌드된 패키지에 `npm pack --dry-run --json`을 실행하고, `deploy-akan` 또는 local registry smoke 전에 필요한
metadata를 검증합니다.
저장소 릴리즈에서는 root `akan` bootstrap script가 CLI dist를 덮어쓰지 않도록
`bun run release:build-packages && bun run release:verify-packages`를 우선 사용합니다.

## 패키지 경계

- 애플리케이션과 런타임 코드는 `akanjs`를 사용합니다.
- 사용자-facing 실행 패키지는 `@akanjs/cli`입니다.
- `@akanjs/devkit`은 published CLI 사용을 위해 CLI 안에 번들링됩니다. 일반 CLI 사용자가 별도의
  runtime dependency로 설치할 필요는 없습니다.

## 요구사항

- [Bun](https://bun.sh) `>=1.3.13`
- TypeScript 기반 Akan 워크스페이스

## 라이선스

MIT
