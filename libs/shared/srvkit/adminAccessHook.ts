/**
 * 관리자 로그인·로그아웃과 임의 SQL 실행을 앱이 기록할 자리. 걸지 않으면 아무것도 하지 않는다 — 접속 이력을 남길지와
 * 어디에 남길지는 이 라이브러리를 쓰는 앱마다 다르다. `adminRolePolicy` 와 같은 모듈 레지스트리다.
 *
 * 기록 실패가 로그인을 막으면 안 되므로 `onAccess` 는 기다리지 않는다. `onSql` 은 기다린다 — 기록이 실패하면 SQL 도
 * 돌지 않는다.
 */
export interface AdminAccess {
  /** 관리자 계정(이메일). */
  accountId: string;
  method: "password" | "sso" | "signout";
}

export interface AdminSqlRun {
  adminId: string;
  accountId: string;
  sql: string;
  limit: number | null;
  ip: string | null;
}

export interface AdminAccessHook {
  onAccess?: (access: AdminAccess) => Promise<void> | void;
  onSql?: (run: AdminSqlRun) => Promise<void> | void;
}

let hook: AdminAccessHook = {};

export const setAdminAccessHook = (next: AdminAccessHook) => {
  hook = next;
};

export const adminAccessHook = () => hook;
