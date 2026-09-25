/**
 * App/lib 루트 레이아웃 허용 목록 — 단일 소스.
 *
 * 같은 규칙을 scanInfo(`akan sync`, hard error) · akanContext(`akan doctor`, diagnostic) ·
 * qualityScanner(`akan quality scan`, warning) 세 곳이 각자 복사해 두면서 실제로 어긋났다
 * (스코프 AGENTS.md/CLAUDE.md 는 sync 만 허용, `plugin` 은 문서에만, `secrets` 는 doctor 만 거부).
 * 규칙을 추가할 때는 이 파일만 고치고, 루트 AGENTS.md 의 목록도 같이 갱신한다.
 */

export type SysType = "app" | "lib";

export const appRootAllowedFiles = new Set([
  // 스코프 에이전트 가이드 — scan(write) 이 유지하는 색인 + 마커 밖 hand-written 내용 (agentsIndex.ts)
  "AGENTS.md",
  "CLAUDE.md",
  "akan.app.json",
  "akan.config.ts",
  "capacitor.config.ts",
  "client.ts",
  "main.ts",
  "package.json",
  "server.ts",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
]);

export const appRootAllowedDirs = new Set([
  ".akan",
  "android",
  "common",
  "env",
  "ios",
  "lib",
  "mobile",
  "page",
  "plugin",
  "private",
  "public",
  "script",
  "secrets",
  "srvkit",
  "ui",
  "webkit",
]);

/**
 * 라이브러리 루트는 앱 루트에서 실행/모바일 전용 항목(`main.ts`, `capacitor.config.ts`, `.akan`,
 * `android`, `ios`, `mobile`, `script`, `secrets`)을 뺀 집합이다 — 라이브러리는 부팅되지도, 패키징되지도
 * 않는다. `index.ts` 는 lib 에만 생성되고, `README.md` / `tsconfig.spec.json` 은 라이브러리가 패키지로
 * 배포되기 때문에 남는다. `public` / `private` 은 syncAssets 가 앱으로 심링크하므로 라이브러리도 가진다.
 */
export const libRootAllowedFiles = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "akan.config.ts",
  "akan.lib.json",
  "client.ts",
  "index.ts",
  "package.json",
  "server.ts",
  "tsconfig.json",
  "tsconfig.spec.json",
  "tsconfig.tsbuildinfo",
]);

export const libRootAllowedDirs = new Set([
  "common",
  "env",
  "lib",
  "page",
  "plugin",
  "private",
  "public",
  "srvkit",
  "ui",
  "webkit",
]);

export const rootAllowedFiles = { app: appRootAllowedFiles, lib: libRootAllowedFiles } as const;
export const rootAllowedDirs = { app: appRootAllowedDirs, lib: libRootAllowedDirs } as const;

export const libFacetRootAllowedFiles = new Set([
  "cnst.ts",
  "db.ts",
  "dict.ts",
  "option.ts",
  "sig.ts",
  "srv.ts",
  "st.ts",
  "useClient.ts",
  "useServer.ts",
]);

/** `<model>.signal.test.ts` — lib 파싯 루트에 놓이는 유일한 비생성 파일 (테스트가 배럴 전체를 부팅한다). */
const libFacetRootTestPattern = /^[A-Za-z][A-Za-z0-9_-]*\.signal\.(test|spec)\.(ts|tsx)$/;

export const isAllowedLibFacetRootFile = (filename: string) =>
  libFacetRootAllowedFiles.has(filename) || libFacetRootTestPattern.test(filename);

/**
 * scanSync 는 루트를 `Bun.Glob("*")` 로 읽어 dotfile 을 아예 보지 못한다. 디렉터리를 직접 읽는
 * doctor 가 그 차이만큼 `.DS_Store` 같은 툴 산출물을 에러로 올리므로 같은 기준으로 걸러낸다.
 */
export const isScannedRootEntry = (type: SysType, name: string) =>
  !name.startsWith(".") || rootAllowedDirs[type].has(name);
