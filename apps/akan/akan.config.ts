import type { AppConfig } from "akanjs";

const config: AppConfig = {
  externalLibs: ["shiki"],
  secrets: ["secrets/**/*"],
  // 문서/쇼케이스 앱 — 열린 Tailwind 팔레트 + daisyUI 를 의도적으로 존치. 자체 마이그레이션 전까지
  // styleGuard/themeValidator 강제에서 제외(앱 단위 opt-out).
  vocabularyClosure: false,
};

export default config;
