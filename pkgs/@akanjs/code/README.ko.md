# @akanjs/code

[English](https://github.com/akan-team/akanjs/blob/main/pkgs/@akanjs/code/README.md) | [Docs](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/code) | [CLI](https://www.npmjs.com/package/@akanjs/cli)

`akan code` 뒤의 코딩 에이전트입니다. 엔진, 에이전트가 쓰는 도구, 터미널 UI가 들어 있습니다.

`akan code` 명령은 `@akanjs/cli`에 있지만, 에이전트와 에이전트가 쓰는 LLM 공급자 SDK는 이 패키지로 배포됩니다.
그래서 `akan code`를 쓰지 않는 워크스페이스는 그 SDK를 설치하지 않습니다.

## 설치

워크스페이스에 `@akanjs/cli`와 정확히 같은 버전으로 설치합니다.

```bash
bun add -d @akanjs/code@<akan 버전>
```

패키지가 없거나 버전이 다르면 `akan code`가 이 명령을 알려 주고, 터미널에서는 대신 실행할지 묻고, 그 밖에는 이
명령과 함께 종료합니다.

## 사용

```ts
import { CodeAgent } from "@akanjs/code";
```

`@akanjs/code`는 에이전트를 직접 품는 SDK 진입점이며, 가져오면 엔진이 로드됩니다. `@akanjs/code/host`는
`akan code`가 먼저 로드하는 가벼운 진입점으로, 실행 모드에 필요한 엔진만 띄웁니다.

함께 배포되는 akan 스킬은 `@akanjs/devkit`(`@akanjs/devkit/codeAgent`)에 남아 있으므로 `akan agent install`은 이
패키지 없이도 동작합니다.
