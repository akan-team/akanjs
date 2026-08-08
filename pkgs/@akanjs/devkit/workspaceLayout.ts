/**
 * App/lib 루트 레이아웃 허용 목록 — 단일 소스.
 *
 * 같은 규칙을 scanInfo(`akan sync`, hard error) · akanContext(`akan doctor`, diagnostic) ·
 * qualityScanner(`akan quality scan`, warning) 세 곳이 각자 복사해 두면서 실제로 어긋났다
 * (스코프 AGENTS.md/CLAUDE.md 는 sync 만 허용, `plugin` 은 문서에만, `secrets` 는 doctor 만 거부).
 * 규칙을 추가할 때는 이 파일만 고치고, 루트 AGENTS.md 와 `.cursor/rules/akan-scan-conventions.mdc`
 * 의 목록도 같이 갱신한다.
 */

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

/**
 * scanSync 는 앱 루트를 `Bun.Glob("*")` 로 읽어 dotfile 을 아예 보지 못한다. 디렉터리를 직접 읽는
 * doctor 가 그 차이만큼 `.DS_Store` 같은 툴 산출물을 에러로 올리므로 같은 기준으로 걸러낸다.
 */
export const isScannedAppRootEntry = (name: string) => !name.startsWith(".") || appRootAllowedDirs.has(name);
