import { modelDictionary } from "akanjs/dictionary";

import type { Admin, AdminInsight, AdminRole } from "./admin.constant";
import type { AdminFilter } from "./admin.document";
import type { AdminEndpoint, AdminSlice } from "./admin.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Admin", "관리자"]).desc([
      "Admin is a person who manages the system, that has a data managent and system monitoring authority.",
      "관리자는 시스템을 관리하는 사람으로, 데이터 관리 및 시스템 모니터링 권한을 가지고 있습니다.",
    ]),
  )
  .model<Admin>((t) => ({
    accountId: t(["Account ID", "아이디"]).desc(["Account ID Description", "아이디 설명"]),
    password: t(["Password", "패스워드"]).desc(["Password Description", "패스워드 설명"]),
    roles: t(["Roles", "역할"]).desc(["Roles Description", "역할 설명"]),
    lastLoginAt: t(["Last Login", "마지막 로그인"]).desc(["Last Login Description", "마지막 로그인 설명"]),
  }))
  .insight<AdminInsight>((t) => ({}))
  .query<AdminFilter>((fn) => ({
    byAccountId: fn(["By Account ID", "아이디별 조회"]).arg((t) => ({
      accountId: t(["Account ID", "아이디"]).desc(["Account ID Description", "아이디 설명"]),
    })),
    bySearch: fn(["By Search", "검색어별 조회"]).arg((t) => ({
      text: t(["Text", "검색어"]).desc(["Account ID text", "아이디 검색어"]),
      roles: t(["Roles", "역할"]).desc(["Roles Description", "역할 설명"]),
    })),
  }))
  .enum<AdminRole>("adminRole", (t) => ({
    manager: t(["Manager", "매니저"]).desc(["Manager Description", "매니저 설명"]),
    admin: t(["Admin", "관리자"]).desc(["Admin Description", "관리자 설명"]),
    superAdmin: t(["Super Admin", "최고 관리자"]).desc(["Super Admin Description", "최고 관리자 설명"]),
  }))
  .slice<AdminSlice>((fn) => ({
    inMention: fn(["Mentionable Admins", "멘션 가능한 관리자"])
      .desc(["Admins matching a mention search", "멘션 검색어에 일치하는 관리자"])
      .arg((t) => ({
        text: t(["Text", "검색어"]).desc(["Account ID text", "아이디 검색어"]),
      })),
  }))
  .endpoint<AdminEndpoint>((fn) => ({
    isAdminSystemInitialized: fn(["Is Admin System Initialized", "관리자 시스템 초기화 여부"]),
    createAdminWithInitialize: fn(["Create Admin With Initialize", "초기 관리자 생성"]).arg((t) => ({
      data: t(["Data", "데이터"]).desc(["Data Description", "데이터 설명"]),
    })),
    me: fn(["Me", "나"]),
    setAdminPassword: fn(["Set Admin Password", "관리자 비밀번호 설정"]).arg((t) => ({
      adminId: t(["Admin ID", "관리자 아이디"]).desc(["Admin ID Description", "관리자 아이디 설명"]),
      password: t(["Password", "패스워드"]).desc(["Password Description", "패스워드 설명"]),
    })),
    signinAdmin: fn(["Sign in Admin", "관리자 로그인"]).arg((t) => ({
      accountId: t(["Account ID", "아이디"]).desc(["Account ID Description", "아이디 설명"]),
      password: t(["Password", "패스워드"]).desc(["Password Description", "패스워드 설명"]),
    })),
    signoutAdmin: fn(["Sign out Admin", "관리자 로그아웃"]),
    refreshAdminJwt: fn(["Refresh Admin JWT", "관리자 JWT 갱신"]).arg((t) => ({
      refreshToken: t(["Refresh Token", "리프레시 토큰"]).desc(["Refresh Token", "리프레시 토큰"]),
    })),
    addAdminRole: fn(["Add Admin Role", "관리자 권한 추가"]).arg((t) => ({
      adminId: t(["Admin ID", "관리자 아이디"]).desc(["Admin ID Description", "관리자 아이디 설명"]),
      role: t(["Role", "권한"]).desc(["Role Description", "권한 설명"]),
    })),
    subAdminRole: fn(["Sub Admin Role", "관리자 권한 제거"]).arg((t) => ({
      adminId: t(["Admin ID", "관리자 아이디"]).desc(["Admin ID Description", "관리자 아이디 설명"]),
      role: t(["Role", "권한"]).desc(["Role Description", "권한 설명"]),
    })),
    runAdminSql: fn(["Run SQL", "SQL 실행"])
      .desc([
        "Runs one read-only statement against this app's database. Reads only: SELECT or WITH, one statement, and the `_doc` column — where every hidden and secret field lives — cannot be reached. Rows are capped.",
        "이 앱의 데이터베이스에 읽기 전용 문장 하나를 실행한다. 읽기만 가능하다 — SELECT 또는 WITH, 한 문장, 그리고 hidden·secret 필드가 모두 들어 있는 `_doc` 컬럼에는 닿을 수 없다. 행 수에는 상한이 있다.",
      ])
      .arg((t) => ({
        sql: t(["SQL", "SQL"]).desc([
          "One SELECT or WITH statement. Quote identifiers with double quotes.",
          "SELECT 또는 WITH 문장 하나. 식별자는 큰따옴표로 감싼다.",
        ]),
        limit: t(["Limit", "행 제한"]).desc([
          "Rows to return at most. Defaults to the ceiling, which no caller can raise.",
          "반환할 최대 행 수. 기본값은 상한이며, 호출자가 올릴 수는 없다.",
        ]),
      })),
  }))
  .error({
    adminSystemAlreadyInitialized: ["Admin system already initialized", "관리자 시스템이 이미 초기화되었습니다"],
    passwordNotMatched: ["Password does not match", "비밀번호가 일치하지 않습니다"],
    noAdminAccount: ["No admin account", "관리자 계정이 없습니다"],
    noAccessToSetPassword: ["No access to set password", "비밀번호를 설정할 권한이 없습니다"],
    noRefreshToken: ["No refresh token", "리프레시 토큰이 없습니다"],
    notAllowed: ["Not allowed", "허용되지 않습니다"],
  });
