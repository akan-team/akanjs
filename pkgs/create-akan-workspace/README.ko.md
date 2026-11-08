# create-akan-workspace

[English](https://github.com/akan-team/akanjs/blob/main/pkgs/create-akan-workspace/README.md) | [문서](https://akanjs.com/docs/intro/quickstart) | [npm](https://www.npmjs.com/package/create-akan-workspace)

명령 하나로 새 [Akan.js](https://akanjs.com) 워크스페이스를 만듭니다.

```bash
bunx create-akan-workspace@latest
```

이 패키지와 같은 버전의 `akan` CLI(`@akanjs/cli`)를 전역으로 설치한 뒤 `akan create-workspace`를 실행합니다.
이 명령은 다음을 합니다.

1. 워크스페이스 이름과 앱 이름을 묻습니다. 미리 넘겼다면 묻지 않습니다.
2. `./<workspace>`를 만들고 의존성을 설치합니다. 이름이 `.`이면 현재 폴더를 그대로 씁니다.
3. 샘플 `task` 모듈과 페이지가 들어 있는 첫 앱을 만듭니다. `--sample false`면 샘플을 빼고 만듭니다.
4. `AGENTS.md`, `CLAUDE.md`, Cursor 규칙을 쓰고, Claude Code·Codex·Cursor에 Akan MCP 서버를 등록합니다.
5. 첫 git 커밋을 만듭니다. git에 사용자 정보가 없으면 `Akan.js <noreply@akanjs.com>`으로 커밋합니다. 다른 git
   저장소가 추적하는 폴더라면 커밋하지 않고, 새 파일을 그 저장소에서 직접 커밋하도록 남겨 둡니다.

그다음 앱을 실행하면 `http://localhost:8282`에서 열립니다.

```bash
cd <workspace>
akan start <app> --open
```

## 코딩 에이전트로 시작하기

두 이름을 모두 넘기면 아무것도 묻지 않으므로, 코딩 에이전트가 혼자 실행할 수 있습니다.

```bash
bunx create-akan-workspace@latest my-company --app web
```

[시작하기](https://akanjs.com/docs/intro/quickstart)에 Claude Code나 Codex에 붙여 넣을 프롬프트가 있습니다. Bun을
확인하고, 이 명령을 실행하고, 앱까지 띄웁니다. 끝나면 새 워크스페이스 안에서 에이전트를 다시 여세요. MCP 서버와
규칙은 거기서 로드됩니다.

## 기존 폴더에 만들기

워크스페이스 이름을 `.`으로 주면 하위 폴더를 새로 만들지 않고 현재 폴더나 `--dir` 폴더에 바로 만듭니다. 워크스페이스
이름은 그 폴더 이름을 따릅니다. 폴더에는 `.git`이나 메모처럼 워크스페이스가 쓰지 않는 파일이 있어도 됩니다.
`package.json`이나 `README.md`처럼 덮어쓸 파일이 있으면 아무것도 쓰지 않고, 옮겨야 할 파일을 알려 줍니다.

```bash
bunx create-akan-workspace@latest . --app web                # 현재 폴더
bunx create-akan-workspace@latest . --app web --dir app      # ./app
bunx create-akan-workspace@latest my-company --app web --sample false   # 샘플 모듈과 페이지 없이
```

## 옵션

| 옵션 | 설명 | 기본값 |
| --- | --- | --- |
| `[org]` | 워크스페이스(조직) 이름. `.`이면 `--dir` 폴더 자체 | 물어봄 |
| `-a, --app <name>` | 첫 애플리케이션 이름 | 물어봄 |
| `-d, --dir <path>` | 워크스페이스를 만들 디렉터리(`<dir>/<org>`) | `.` |
| `-l, --libs <boolean>` | `shared`, `util` 라이브러리(관리자, 사용자, 파일 등)도 설치 | `false` |
| `-i, --init <boolean>` | 워크스페이스 의존성 설치 | `true` |
| `-s, --sample <boolean>` | 첫 앱에 샘플 `task` 모듈, 페이지, 헬퍼를 생성 | `true` |
| `-r, --registry <url>` | Akan 패키지를 받을 npm 레지스트리(또는 `AKAN_NPM_REGISTRY`) | npmjs |
| `-o, --owner <name>` | 워크스페이스 소유자 | — |

## 요구사항

- [Bun](https://bun.sh) `>=1.4.4`
- 첫 커밋을 위한 Git

## 더 알아보기

- [시작하기](https://akanjs.com/docs/intro/quickstart)
- [`akanjs`](https://www.npmjs.com/package/akanjs): 프레임워크
- [`@akanjs/cli`](https://www.npmjs.com/package/@akanjs/cli): `akan` 명령

## 라이선스

MIT
