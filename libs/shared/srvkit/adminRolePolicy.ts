/**
 * 역할 부여·회수에 앱이 거는 정책. 걸지 않으면 "자기 최고 등급 이하만 주고 뺀다"는 기본 규칙 그대로다 —
 * 누가 역할을 관리하는지와 그 변경을 어디에 남기는지는 이 라이브러리를 쓰는 앱마다 다르다.
 *
 * `adminSsoPolicy` 와 같은 모듈 레지스트리다. 판정은 호출 시점에 읽히므로 부팅 순서와 무관하다.
 */
export interface AdminRoleChange {
  /** 바꾼 사람의 계정(이메일). */
  actor: string;
  adminId: string;
  role: string;
  verb: "add" | "sub";
}

export interface AdminRolePolicy {
  /** 이 역할들을 가진 사람이 `role` 을 주거나 뺄 수 있는지. 비우면 기본 규칙이다. */
  canChange?: (myRoles: readonly string[], role: string) => boolean;
  /** 바뀐 뒤 부른다. 실패하면 호출이 실패로 끝난다 — 남기지 못한 변경을 성공으로 돌려주지 않는다. */
  onChange?: (change: AdminRoleChange) => Promise<void> | void;
}

let policy: AdminRolePolicy = {};

export const setAdminRolePolicy = (next: AdminRolePolicy) => {
  policy = next;
};

export const adminRolePolicy = () => policy;
