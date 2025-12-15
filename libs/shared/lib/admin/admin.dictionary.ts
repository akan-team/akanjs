import { modelDictionary } from "@akanjs/dictionary";

import type { Admin, AdminInsight, AdminRole } from "./admin.constant";
import type { AdminFilter } from "./admin.document";
import type { AdminEndpoint, AdminSlice } from "./admin.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Admin", "관리자"]).desc([
      "Admin is a person who manages the system, that has a data managent and system monitoring authority.",
      "관리자는 시스템을 관리하는 사람으로, 데이터 관리 및 시스템 모니터링 권한을 가지고 있습니다.",
    ])
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
  }))
  .enum<AdminRole>("adminRole", (t) => ({
    manager: t(["Manager", "매니저"]).desc(["Manager Description", "매니저 설명"]),
    admin: t(["Admin", "관리자"]).desc(["Admin Description", "관리자 설명"]),
    superAdmin: t(["Super Admin", "최고 관리자"]).desc(["Super Admin Description", "최고 관리자 설명"]),
  }))
  .slice<AdminSlice>((fn) => ({}))
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
    addAdminRole: fn(["Add Admin Role", "관리자 권한 추가"]).arg((t) => ({
      adminId: t(["Admin ID", "관리자 아이디"]).desc(["Admin ID Description", "관리자 아이디 설명"]),
      role: t(["Role", "권한"]).desc(["Role Description", "권한 설명"]),
    })),
    subAdminRole: fn(["Sub Admin Role", "관리자 권한 제거"]).arg((t) => ({
      adminId: t(["Admin ID", "관리자 아이디"]).desc(["Admin ID Description", "관리자 아이디 설명"]),
      role: t(["Role", "권한"]).desc(["Role Description", "권한 설명"]),
    })),
  }));
