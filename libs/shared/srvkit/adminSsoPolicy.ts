/**
 * SSO 로 관리자가 들어올 수 있는지. **기본은 아무도 안 된다** — 이 라이브러리를 쓰는 앱 대부분은 관리자를
 * 사람이 등록하고, 켜져 있는 줄 모르면 구글 계정 아무거나 관리자가 된다. 이미 있는 관리자도 `canSignin` 이
 * 허락해야 한다 — user 로그인용으로 공급자를 켜는 순간 비밀번호로만 쓰던 관리자에게 그 경로가 열리면 안 된다.
 *
 * DI(`option.use`)가 아니라 모듈 레지스트리인 이유는 그쪽이 같은 키를 두 번 등록할 수 없기 때문이다 —
 * 라이브러리가 기본값을 걸어 두면 앱이 덮어쓸 수가 없고 부팅이 중복 등록으로 죽는다(`initSsoProviders`
 * 가 같은 이유로 이 모양이다). 판정은 로그인 시점에 읽히므로 부팅 순서와 무관하다.
 */
export interface AdminSsoPolicy {
  canSignup: (accountId: string) => boolean | Promise<boolean>;
  /** 이미 있는 관리자가 이 공급자로 로그인해도 되는지. 비우면 아무도 안 된다. */
  canSignin?: (accountId: string, ssoType: string) => boolean | Promise<boolean>;
  /** 새로 만든 관리자가 받는 등급. 비우면 로그인은 되지만 아무것도 못 한다(가드가 전부 막는다). */
  roles?: string[];
}

const refusal: AdminSsoPolicy = { canSignup: () => false, canSignin: () => false };
let policy: AdminSsoPolicy = refusal;

/** 앱의 `lib/option.ts` 가 부른다. 누가 가입할 수 있는지는 앱이 안다. */
export const setAdminSsoPolicy = (next: AdminSsoPolicy) => {
  policy = next;
};

export const adminSsoPolicy = () => policy;

//? Naver and Facebook hand back an address without saying it was verified, so it cannot stand for an operator.
const unverifiedEmailSsoTypes: readonly string[] = ["naver", "facebook"];

export const isAdminSsoTypeAllowed = (ssoType: string) => !unverifiedEmailSsoTypes.includes(ssoType);
