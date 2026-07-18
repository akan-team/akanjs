# Create Akan Workspace

새 Akan.js 워크스페이스를 가장 빠르게 만드는 스캐폴딩 패키지입니다. 이 패키지는 Akan.js CLI를 설치하고
워크스페이스 생성 마법사를 실행하는 단일 진입점을 제공합니다.

## 시작하기

```bash
bunx create-akan-workspace
```

이 명령은 다음 작업을 수행합니다.

1. 최신 `akanjs` CLI 설치
2. 인터랙티브 워크스페이스 생성 마법사 실행
3. 개발 환경과 초기 애플리케이션 구성

## 예시

```bash
# 인터랙티브 모드
bunx create-akan-workspace

# 조직 이름 지정
bunx create-akan-workspace "my-company"

# 앱 이름과 대상 경로 지정
bunx create-akan-workspace "my-company" --app "web-app" --dir "./projects"
```

## 옵션

| Option | Description | Example |
| --- | --- | --- |
| `[org]` | 조직 이름 | `my-company` |
| `-a, --app <name>` | 초기 애플리케이션 이름 | `--app web-app` |
| `-d, --dir <path>` | 생성 대상 경로 | `--dir ./projects` |

## 요구사항

- Bun `>=1.3`

## 다음 단계

```bash
cd <workspace-name>
akan start <app-name> --open
```

프로덕션 빌드는 다음 명령으로 확인할 수 있습니다.

```bash
akan build <app-name>
```

## 라이선스

이 패키지는 Akan.js 생태계의 일부이며 MIT 라이선스를 따릅니다.
