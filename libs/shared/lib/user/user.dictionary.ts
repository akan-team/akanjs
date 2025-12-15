import { modelDictionary } from "@akanjs/dictionary";

import type { ProfileStatus, User, UserInsight, UserRole, UserStatus, Verify } from "./user.constant";
import type { UserFilter } from "./user.document";
import type { UserEndpoint, UserSlice } from "./user.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["User", "유저"]).desc([
      "User is an public information of the user who uses the service. It can be displayed to other users.",
      "유저는 서비스를 이용하는 사용자의 공개 정보입니다. 다른 사용자에게 표시될 수 있습니다.",
    ])
  )
  .model<User>((t) => ({
    nickname: t(["Nickname", "닉네임"]).desc([
      "Nickname of the user that is displayed to other users",
      "다른 사용자에게 표시되는 유저의 닉네임",
    ]),
    image: t(["Image", "이미지"]).desc(["Profile image of the user", "유저의 프로필 이미지"]),
    images: t(["Images", "이미지들"]).desc(["Profile images of the user", "유저의 프로필 이미지들"]),
    appliedImages: t(["Applied Images", "신청된 이미지들"]).desc([
      "Applied images of the user",
      "유저의 신청된 이미지들",
    ]),
    name: t(["Name", "이름"]).desc(["Name of the user", "유저의 이름"]),
    agreePolicies: t(["Agree Policies", "동의 정책"]).desc(["Agreed policies of the user", "유저의 동의 정책"]),
    discord: t(["Discord", "디스코드"]).desc(["Discord information of the user", "유저의 디스코드 정보"]),
    accountId: t(["Account ID", "아이디"]).desc(["Account ID of the user", "유저의 아이디"]),
    password: t(["Password", "비밀번호"]).desc(["Password of the user", "유저의 비밀번호"]),
    phone: t(["Phone", "휴대폰 번호"]).desc(["Phone number of the user", "유저의 휴대폰 번호"]),
    notiInfo: t(["Noti Info", "알림 정보"]).desc(["Notification information of the user", "유저의 알림 정보"]),
    imageNum: t(["Image Number", "이미지 수"]).desc(["Number of images of the user", "유저의 이미지 수"]),
    encourageInfo: t(["Encourage Info", "격려 정보"]).desc(["Encourage information of the user", "유저의 격려 정보"]),
    restrictInfo: t(["Restrict Info", "제한 정보"]).desc(["Restrict information of the user", "유저의 제한 정보"]),
    leaveInfo: t(["Leave Info", "탈퇴 정보"]).desc(["Leave information of the user", "유저의 탈퇴 정보"]),
    verifies: t(["Verifies", "인증정보"]).desc(["Verification information of the user", "유저의 인증정보"]),
    roles: t(["Roles", "권한"]).desc(["Authorized roles of the user", "유저의 권한"]),
    playing: t(["Playing", "플레이 중"]).desc(["Services that the user is playing", "유저가 플레이 중인 서비스"]),
    isOnline: t(["Is Online", "온라인 상태"]).desc(["Online status of the user", "유저의 온라인 상태"]),
    lastLoginAt: t(["Last Login At", "최근 로그인"]).desc(["Latest login time of the user", "유저의 최근 로그인 시간"]),
    joinAt: t(["Join At", "가입일"]).desc(["Join date of the user", "유저의 가입일"]),
    profileStatus: t(["Profile Status", "프로필 상태"]).desc([
      "Profile approval status of the user",
      "유저의 프로필 승인 상태",
    ]),
    badgeCount: t(["Badge Count", "뱃지 수"]).desc(["Badge count of the user", "유저의 뱃지 수"]),
    status: t(["Status", "상태"]).desc(["Status of the user", "유저의 상태"]),
  }))
  .insight<UserInsight>((t) => ({}))
  .query<UserFilter>((fn) => ({
    byStatuses: fn(["By Statuses", "상태별 조회"]).arg((t) => ({
      statuses: t(["Statuses", "상태들"]).desc(["Statuses to search", "상태들로 조회"]),
    })),
    byNickname: fn(["By Nickname", "닉네임별 조회"]).arg((t) => ({
      nickname: t(["Nickname", "닉네임"]).desc(["Nickname to search", "닉네임으로 조회"]),
      status: t(["Status", "상태"]).desc(["Status to search", "상태로 조회"]),
    })),
    byAccountId: fn(["By Account ID", "아이디별 조회"]).arg((t) => ({
      accountId: t(["Account ID", "아이디"]).desc(["Account ID to search", "아이디로 조회"]),
      statuses: t(["Statuses", "상태들"]).desc(["Statuses to search", "상태들로 조회"]),
    })),
    byPhone: fn(["By Phone", "휴대폰 번호별 조회"]).arg((t) => ({
      phone: t(["Phone", "휴대폰 번호"]).desc(["Phone number to search", "휴대폰 번호로 조회"]),
      statuses: t(["Statuses", "상태들"]).desc(["Statuses to search", "상태들로 조회"]),
    })),
    byLoginAt: fn(["By Login At", "최근 로그인 시간별 조회"]).arg((t) => ({
      from: t(["From", "최근 로그인 시간"]).desc(["Last login time to search", "최근 로그인 시간으로 조회"]),
      to: t(["To", "끝"]).desc(["Last login time to search", "최근 로그인 시간으로 조회"]),
      statuses: t(["Statuses", "상태들"]).desc(["Statuses to search", "상태들로 조회"]),
    })),
  }))
  .sort<UserFilter>((t) => ({}))
  .enum<Verify>("verify", (t) => ({
    naver: t(["Naver", "네이버"]).desc(["Naver verify", "네이버 인증"]),
    kakao: t(["Kakao", "카카오"]).desc(["Kakao verify", "카카오 인증"]),
    github: t(["Github", "깃허브"]).desc(["Github verify", "깃허브 인증"]),
    google: t(["Google", "구글"]).desc(["Google verify", "구글 인증"]),
    apple: t(["Apple", "애플"]).desc(["Apple verify", "애플 인증"]),
    facebook: t(["Facebook", "페이스북"]).desc(["Facebook verify", "페이스북 인증"]),
    wallet: t(["Wallet", "지갑"]).desc(["Wallet verify", "지갑 인증"]),
    password: t(["Password", "비밀번호"]).desc(["Password verify", "비밀번호 인증"]),
    phone: t(["Phone", "휴대폰 번호"]).desc(["Phone verify", "휴대폰 번호 인증"]),
    email: t(["Email", "이메일"]).desc(["Email verify", "이메일 인증"]),
  }))
  .enum<UserRole>("userRole", (t) => ({
    root: t(["Root", "루트"]).desc(["Root role", "루트 권한"]),
    admin: t(["Admin", "관리자"]).desc(["Admin role", "관리자 권한"]),
    user: t(["User", "사용자"]).desc(["User role", "사용자 권한"]),
    business: t(["Business", "비지니스"]).desc(["Business role", "비지니스 권한"]),
    guest: t(["Guest", "게스트"]).desc(["Guest role", "게스트 권한"]),
  }))
  .enum<ProfileStatus>("profileStatus", (t) => ({
    active: t(["Active", "활성"]).desc(["Active profile status", "활성 프로필 상태"]),
    prepare: t(["Prepare", "준비"]).desc(["Prepare profile status", "준비 프로필 상태"]),
    applied: t(["Applied", "신청됨"]).desc(["Applied profile status", "신청됨 프로필 상태"]),
    reapplied: t(["Reapplied", "재신청됨"]).desc(["Reapplied profile status", "재신청됨 프로필 상태"]),
    approved: t(["Approved", "승인됨"]).desc(["Approved profile status", "승인됨 프로필 상태"]),
    featured: t(["Featured", "주목받는"]).desc(["Featured profile status", "주목받는 프로필 상태"]),
    reserved: t(["Reserved", "예약됨"]).desc(["Reserved profile status", "예약됨 프로필 상태"]),
    rejected: t(["Rejected", "거부됨"]).desc(["Rejected profile status", "거부됨 프로필 상태"]),
  }))
  .enum<UserStatus>("userStatus", (t) => ({
    prepare: t(["Prepare", "준비"]).desc(["Prepare status", "준비 상태"]),
    active: t(["Active", "활성"]).desc(["Active status", "활성 상태"]),
    dormant: t(["Dormant", "휴면"]).desc(["Dormant status", "휴면 상태"]),
    restricted: t(["Restricted", "제한됨"]).desc(["Restricted status", "제한됨 상태"]),
  }))
  .slice<UserSlice>((fn) => ({}))
  .endpoint<UserEndpoint>((fn) => ({
    addBadgeCount: fn(["Add Badge Count", "뱃지 수 증가"])
      .desc(["API to add a badge count", "뱃지 수를 증가하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
      })),
    subBadgeCount: fn(["Sub Badge Count", "뱃지 수 감소"])
      .desc(["API to sub a badge count", "뱃지 수를 감소하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
      })),
    getUserIdHasNickname: fn(["Get User ID with Nickname", "닉네임을 가진 유저 ID 조회"])
      .desc(["API to get the user ID with a given nickname", "주어진 닉네임을 가진 유저 ID를 조회하는 API"])
      .arg((t) => ({
        nickname: t(["Nickname", "닉네임"]).desc(["Nickname", "닉네임"]),
      })),
    getSelf: fn(["Get Self", "자기 자신 조회"]).desc(["API to get the self", "자기 자신을 조회하는 API"]),
    signinWithSignToken: fn(["Sign in with Sign Token", "서명 토큰으로 로그인"])
      .desc(["API to sign in with a sign token", "서명 토큰으로 로그인하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        signToken: t(["Sign Token", "서명 토큰"]).desc(["Sign Token", "서명 토큰"]),
      })),
    signoutUser: fn(["Sign out", "로그아웃"]).desc(["API to sign out", "로그아웃하는 API"]),
    activateUser: fn(["Activate User", "유저 활성화"])
      .desc(["API to activate a user", "유저를 활성화하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
      })),
    removeUser: fn(["Remove User", "유저 삭제"])
      .desc(["API to remove a user", "유저를 삭제하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
      })),
    generatePrepareUser: fn(["Generate Prepare User", "준비 유저 생성"])
      .desc(["API to generate a prepare user", "준비 유저를 생성하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        token: t(["Token", "토큰"]).desc(["Token", "토큰"]),
      })),
    setNicknameOfSelf: fn(["Set Nickname of Self", "자기 자신 닉네임 설정"])
      .desc(["API to set the nickname of the self", "자기 자신의 닉네임을 설정하는 API"])
      .arg((t) => ({
        nickname: t(["Nickname", "닉네임"]).desc(["Nickname", "닉네임"]),
      })),
    setAppliedImagesOfSelf: fn(["Set Applied Images of Self", "자기 자신 적용 이미지 설정"])
      .desc(["API to set the applied images of the self", "자기 자신의 적용 이미지를 설정하는 API"])
      .arg((t) => ({
        appliedImages: t(["Applied Images", "적용 이미지"]).desc(["Applied Images", "적용 이미지"]),
      })),
    setLeaveInfoOfSelf: fn(["Set Leave Info of Self", "자기 자신 탈퇴 정보 설정"])
      .desc(["API to set the leave info of the self", "자기 자신의 탈퇴 정보를 설정하는 API"])
      .arg((t) => ({
        leaveInfo: t(["Leave Info", "탈퇴 정보"]).desc(["Leave Info", "탈퇴 정보"]),
      })),
    approveUserImages: fn(["Approve User Images", "유저 이미지 승인"])
      .desc(["API to approve user images", "유저 이미지를 승인하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
      })),
    myAccountId: fn(["My Account ID", "내 아이디 조회"]).desc(["API to get my account ID", "내 아이디를 조회하는 API"]),
    userExistsHasAccountId: fn(["User Exists Has Account ID", "유저 존재 여부 조회"])
      .desc([
        "API to check if a user exists with a given account ID",
        "주어진 아이디를 가진 유저 존재 여부를 조회하는 API",
      ])
      .arg((t) => ({
        accountId: t(["Account ID", "아이디"]).desc(["Account ID", "아이디"]),
      })),
    setAccountIdInPrepareUser: fn(["Set Account ID in Prepare User", "준비 유저 아이디 설정"])
      .desc(["API to set the account ID in a prepare user", "준비 유저의 아이디를 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        accountId: t(["Account ID", "아이디"]).desc(["Account ID", "아이디"]),
      })),
    setPasswordInPrepareUser: fn(["Set Password in Prepare User", "준비 유저 비밀번호 설정"])
      .desc(["API to set the password in a prepare user", "준비 유저의 비밀번호를 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        accountId: t(["Account ID", "아이디"]).desc(["Account ID", "아이디"]),
        password: t(["Password", "비밀번호"]).desc(["Password", "비밀번호"]),
      })),
    signinWithPassword: fn(["Sign in with Password", "비밀번호로 로그인"])
      .desc(["API to sign in with a password", "비밀번호로 로그인하는 API"])
      .arg((t) => ({
        accountId: t(["Account ID", "아이디"]).desc(["Account ID", "아이디"]),
        password: t(["Password", "비밀번호"]).desc(["Password", "비밀번호"]),
        token: t(["Token", "토큰"]).desc(["Token", "토큰"]),
      })),
    changePassword: fn(["Change Password", "비밀번호 변경"])
      .desc(["API to change the password", "비밀번호를 변경하는 API"])
      .arg((t) => ({
        password: t(["Password", "비밀번호"]).desc(["Password", "비밀번호"]),
        prevPassword: t(["Previous Password", "이전 비밀번호"]).desc(["Previous Password", "이전 비밀번호"]),
        token: t(["Token", "토큰"]).desc(["Token", "토큰"]),
      })),
    requestPhoneCodeForSetPassword: fn(["Request Phone Code for Set Password", "비밀번호 설정을 위한 휴대폰 인증 요청"])
      .desc(["API to request a phone code for setting a password", "비밀번호 설정을 위한 휴대폰 인증 요청을 하는 API"])
      .arg((t) => ({
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
        hash: t(["Hash", "해시"]).desc(["Hash", "해시"]),
      })),
    getSignTokenForSetPassword: fn(["Get Sign Token for Set Password", "비밀번호 설정을 위한 서명 토큰 조회"])
      .desc(["API to get a sign token for setting a password", "비밀번호 설정을 위한 서명 토큰을 조회하는 API"])
      .arg((t) => ({
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
        phoneCode: t(["Phone Code", "휴대폰 인증번호"]).desc(["Phone Code", "휴대폰 인증번호"]),
      })),
    setPasswordWithSignToken: fn(["Set Password with Sign Token", "서명 토큰으로 비밀번호 설정"])
      .desc(["API to set a password with a sign token", "서명 토큰으로 비밀번호를 설정하는 API"])
      .arg((t) => ({
        password: t(["Password", "비밀번호"]).desc(["Password", "비밀번호"]),
        signToken: t(["Sign Token", "서명 토큰"]).desc(["Sign Token", "서명 토큰"]),
      })),
    resetPassword: fn(["Reset Password", "비밀번호 초기화"])
      .desc(["API to reset a password", "비밀번호를 초기화하는 API"])
      .arg((t) => ({
        accountId: t(["Account ID", "아이디"]).desc(["Account ID", "아이디"]),
      })),
    getUserIdHasPhone: fn(["Get User ID Has Phone", "휴대폰 번호를 가진 유저 ID 조회"])
      .desc(["API to get the user ID with a given phone number", "주어진 휴대폰 번호를 가진 유저 ID를 조회하는 API"])
      .arg((t) => ({
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
      })),
    setPhoneInPrepareUser: fn(["Set Phone in Prepare User", "준비 유저 휴대폰 번호 설정"])
      .desc(["API to set the phone number in a prepare user", "준비 유저의 휴대폰 번호를 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
        hash: t(["Hash", "해시"]).desc(["Hash", "해시"]),
      })),
    verifyPhoneInPrepareUser: fn(["Verify Phone in Prepare User", "준비 유저 휴대폰 인증"])
      .desc(["API to verify a phone number in a prepare user", "준비 유저의 휴대폰 인증을 하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
        phoneCode: t(["Phone Code", "휴대폰 인증번호"]).desc(["Phone Code", "휴대폰 인증번호"]),
      })),
    setPhoneInActiveUser: fn(["Set Phone in Active User", "활성화 유저 휴대폰 번호 설정"])
      .desc(["API to set the phone number in an active user", "활성화 유저의 휴대폰 번호를 설정하는 API"])
      .arg((t) => ({
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
        phoneCode: t(["Phone Code", "휴대폰 인증번호"]).desc(["Phone Code", "휴대폰 인증번호"]),
      })),
    requestPhoneCodeForSignin: fn(["Request Phone Code for Signin", "로그인을 위한 휴대폰 인증 요청"])
      .desc(["API to request a phone code for signin", "로그인을 위한 휴대폰 인증 요청을 하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
        hash: t(["Hash", "해시"]).desc(["Hash", "해시"]),
      })),
    getSignTokenForSignin: fn(["Get Sign Token for Signin", "로그인을 위한 서명 토큰 조회"])
      .desc(["API to get a sign token for signin", "로그인을 위한 서명 토큰을 조회하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
        phoneCode: t(["Phone Code", "휴대폰 인증번호"]).desc(["Phone Code", "휴대폰 인증번호"]),
      })),
    addUserRole: fn(["Add User Role", "유저 권한 추가"])
      .desc(["API to add a role to a user", "유저에 권한을 추가하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        role: t(["Role", "권한"]).desc(["Role", "권한"]),
      })),
    subUserRole: fn(["Subtract User Role", "유저 권한 제거"])
      .desc(["API to subtract a role from a user", "유저로부터 권한을 제거하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        role: t(["Role", "권한"]).desc(["Role", "권한"]),
      })),
    restrictUser: fn(["Restrict User", "유저 제한"])
      .desc(["API to restrict a user", "유저를 제한하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        reason: t(["Restriction Reason", "제한 사유"]).desc(["Restriction Reason", "제한 사유"]),
        until: t(["Restriction Until", "제한 기간"]).desc(["Restriction Until", "제한 기간"]),
      })),
    releaseUser: fn(["Release User", "유저 해제"])
      .desc(["API to release a user from restriction", "유저의 제한을 해제하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
      })),
    getRestrictInfo: fn(["Get Restrict Info", "유저 제한 정보 조회"])
      .desc(["API to get the restrict info of a user", "유저의 제한 정보를 조회하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
      })),
    setAccountIdByAdmin: fn(["Set Account ID by Admin", "관리자에 의한 유저 아이디 설정"])
      .desc(["API to set the account ID by an admin", "관리자에 의해 유저 아이디를 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        accountId: t(["Account ID", "아이디"]).desc(["Account ID", "아이디"]),
      })),
    setPasswordByAdmin: fn(["Set Password by Admin", "관리자에 의한 유저 비밀번호 설정"])
      .desc(["API to set the password by an admin", "관리자에 의해 유저 비밀번호를 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        password: t(["Password", "비밀번호"]).desc(["Password", "비밀번호"]),
      })),
    setPhoneByAdmin: fn(["Set Phone by Admin", "관리자에 의한 유저 휴대폰 번호 설정"])
      .desc(["API to set the phone number by an admin", "관리자에 의해 유저 휴대폰 번호를 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        phone: t(["Phone", "휴대폰 번호"]).desc(["Phone", "휴대폰 번호"]),
      })),
    getAccessTokenByAdmin: fn(["Get Access Token by Admin", "관리자에 의한 유저 액세스 토큰 조회"])
      .desc(["API to get the access token by an admin", "관리자에 의해 유저 액세스 토큰을 조회하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
      })),
    getEncourageInfo: fn(["Get Encourage Info", "유저 응원 정보 조회"])
      .desc(["API to get the encourage info of a user", "유저의 응원 정보를 조회하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
      })),
    setJourneyByAdmin: fn(["Set Journey by Admin", "관리자에 의한 유저 여정 상태 설정"])
      .desc(["API to set the journey by an admin", "관리자에 의해 유저 여정 상태를 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        journey: t(["Journey", "여정"]).desc(["Journey", "여정"]),
      })),
    setInquiryByAdmin: fn(["Set Inquiry by Admin", "관리자에 의한 유저 획득 상태 설정"])
      .desc(["API to set the inquiry by an admin", "관리자에 의해 유저 획득를 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        inquiry: t(["Inquiry", "획득"]).desc(["Inquiry", "획득"]),
      })),
    setNameOfPrepareUser: fn(["Set Name of Prepare User", "준비 유저 이름 설정"])
      .desc(["API to set the name of a prepare user", "준비 유저의 이름을 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        name: t(["Name", "이름"]).desc(["Name", "이름"]),
      })),
    setAgreePoliciesOfPrepareUser: fn(["Set Agree Policies of Prepare User", "준비 유저 동의 정책 설정"])
      .desc(["API to set the agree policies of a prepare user", "준비 유저의 동의 정책을 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        agreePolicies: t(["Agree Policies", "동의 정책"]).desc(["Agree Policies", "동의 정책"]),
      })),
    setDiscordOfPrepareUser: fn(["Set Discord of Prepare User", "준비 유저 디스코드 설정"])
      .desc(["API to set the discord of a prepare user", "준비 유저의 디스코드를 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        discord: t(["Discord", "디스코드"]).desc(["Discord", "디스코드"]),
      })),
    setNotiSettingOfUser: fn(["Set Noti Setting of User", "유저 알림 설정 설정"])
      .desc(["API to set the noti setting of a user", "유저의 알림 설정을 설정하는 API"])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        notiSetting: t(["Noti Setting", "알림 설정"]).desc(["Noti Setting", "알림 설정"]),
      })),
    addNotiDeviceTokenOfSelf: fn(["Add Noti Device Tokens of Self", "유저 알림 디바이스 토큰 추가"])
      .desc(["API to add the noti device tokens of a self", "유저의 알림 디바이스 토큰을 추가하는 API"])
      .arg((t) => ({
        notiDeviceToken: t(["Noti Device Token", "알림 디바이스 토큰"]).desc([
          "Noti Device Token",
          "알림 디바이스 토큰",
        ]),
      })),
    subNotiDeviceTokenOfSelf: fn(["Subtract Noti Device Tokens of Self", "유저 알림 디바이스 토큰 제거"])
      .desc(["API to subtract the noti device tokens of a self", "유저의 알림 디바이스 토큰을 제거하는 API"])
      .arg((t) => ({
        notiDeviceToken: t(["Noti Device Token", "알림 디바이스 토큰"]).desc([
          "Noti Device Token",
          "알림 디바이스 토큰",
        ]),
      })),
    github: fn(["Github", "깃허브"]).desc(["Github", "깃허브"]),
    githubCallback: fn(["Github Callback", "깃허브 콜백"]).desc(["Github Callback", "깃허브 콜백"]),
    google: fn(["Google", "구글"]).desc(["Google", "구글"]),
    googleCallback: fn(["Google Callback", "구글 콜백"]).desc(["Google Callback", "구글 콜백"]),
    naver: fn(["Naver", "네이버"]).desc(["Naver", "네이버"]),
    naverCallback: fn(["Naver Callback", "네이버 콜백"]).desc(["Naver Callback", "네이버 콜백"]),
    apple: fn(["Apple", "애플"]).desc(["Apple", "애플"]),
    appleCallback: fn(["Apple Callback", "애플 콜백"])
      .desc(["Apple Callback", "애플 콜백"])
      .arg((t) => ({
        payload: t(["Payload", "페이로드"]).desc(["Payload", "페이로드"]),
      })),
    kakao: fn(["Kakao", "카카오"]).desc(["Kakao", "카카오"]),
    kakaoCallback: fn(["Kakao Callback", "카카오 콜백"]).desc(["Kakao Callback", "카카오 콜백"]),
    facebook: fn(["Facebook", "페이스북"]).desc(["Facebook", "페이스북"]),
    facebookCallback: fn(["Facebook Callback", "페이스북 콜백"]).desc(["Facebook Callback", "페이스북 콜백"]),
    setAppliedImagesOfPrepareUser: fn(["Set applied images of prepare user", "준비중 유저의 프로필 사진을 설정합니다."])
      .desc(["Set applied images of prepare user", "준비중 유저의 프로필 사진을 설정합니다."])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        appliedImages: t(["Applied images", "적용된 사진"]).desc(["Applied images", "적용된 사진"]),
      })),
    setNicknameOfPrepareUser: fn(["Set nickname of prepare user", "준비중 유저의 닉네임을 설정합니다."])
      .desc(["Set nickname of prepare user", "준비중 유저의 닉네임을 설정합니다."])
      .arg((t) => ({
        userId: t(["User ID", "유저 ID"]).desc(["User ID", "유저 ID"]),
        nickname: t(["Nickname", "닉네임"]).desc(["Nickname", "닉네임"]),
      })),
    setRemoteAuthToken: fn(["Set Remote Auth Token", "원격 인증 토큰 설정"])
      .desc(["Set Remote Auth Token", "원격 인증 토큰 설정"])
      .arg((t) => ({
        remoteId: t(["Remote ID", "원격 아이디"]).desc(["Remote ID", "원격 아이디"]),
      })),
    getRemoteAuthToken: fn(["Get Remote Auth Token", "원격 인증 토큰 조회"])
      .desc(["Get Remote Auth Token", "원격 인증 토큰 조회"])
      .arg((t) => ({
        remoteId: t(["Remote ID", "원격 아이디"]).desc(["Remote ID", "원격 아이디"]),
      })),
    refreshJwt: fn(["Refresh JWT", "JWT 갱신"]).desc(["Refresh JWT", "JWT 갱신"]),
  }))
  .error({
    noAccount: ["No account exists. Sign up is needed,", "가입되지 않은 이메일입니다. 회원가입을 먼저 해주세요."],
    wrongPassword: ["Wrong password. Please try again.", "비밀번호가 틀렸습니다. 다시 시도해주세요."],
  })
  .translate({
    prevPassword: ["Password", "기존 비밀번호"],
    newPassword: ["New Password", "새 비밀번호"],
    passwordConfirm: ["Confirm Password", "비밀번호 확인"],
    changePassword: ["Change Password", "비밀번호 변경"],
    forgotPassword: ["Forgot password?", "비밀번호 찾기"],
    forgotPasswordDesc: [
      "Enter your account ID or E-mail to receive temporal password.",
      "임시비밀번호 발급을 위한 아이디 또는 이메일을 입력하세요.",
    ],
    sendResetEmail: ["Send reset e-mail", "재설정 이메일 발송"],
    signup: ["Create new account", "회원가입"],
    signWithGithub: ["Sign in with Github", "Github로 시작하기"],
    signWithGoogle: ["Sign in with Google", "구글로 시작하기"],
    signWithFacebook: ["Sign in with Facebook", "페이스북로 시작하기"],
    signWithTwitter: ["Sign in with Twitter", "트위터로 시작하기"],
    signWithNaver: ["Sign in with Naver", "네이버로 시작하기"],
    signWithKakao: ["Sign in with Kakao", "카카오로 시작하기"],
    signWithApple: ["Sign in with Apple", "Apple로 시작하기"],
    accountIdPlaceholder: ["ID or E-mail", "아이디 (이메일)"],
    passwordPlaceholder: ["Password", "비밀번호"],
    phonePlaceholder: ["Please enter without '-'.", "'-' 없이 입력해주세요."],
    phoneCodePlaceholder: ["Phone Code", "인증번호"],
    accountNotFoundError: ["No account exists.", "존재하지 않는 이메일입니다."],
    noAccountError: ["No account exists. Sign up is needed,", "가입되지 않은 이메일입니다. 회원가입을 먼저 해주세요."],
    wrongPasswordError: ["Wrong password. Please try again.", "비밀번호가 틀렸습니다. 다시 시도해주세요."],
    accountIdAlreadyExistsError: ["Account ID already exists.", "이미 존재하는 아이디입니다."],
    changeAccountIdLoading: ["Changing Account ID...", "아이디 변경중..."],
    changeAccountIdSuccess: ["Account ID changed successfully.", "아이디가 변경되었습니다."],
    changePasswordLoading: ["Changing Password...", "비밀번호 변경중..."],
    changePasswordSuccess: ["Password changed successfully.", "비밀번호가 변경되었습니다."],
    changePhoneLoading: ["Changing Phone Number...", "휴대폰 번호 변경중..."],
    changePhoneSuccess: ["Phone Number changed successfully.", "휴대폰 번호가 변경되었습니다."],
    createUserLoading: ["Creating User...", "유저 생성중..."],
    createUserSuccess: ["User created successfully.", "유저가 생성되었습니다."],
    resignupDaysRemainError: [
      "You cannot re-signup now. Please try again after re-signup days.",
      "재가입 기간이 아닙니다. 재가입 제한기간이 지난 후 다시 시도해주세요.",
    ],
    invalidePhoneOrPhoneCodeError: [
      "Invalid phone or phone code. Please try again.",
      "유효하지 않은 휴대폰 번호 또는 인증번호입니다. 다시 시도해주세요.",
    ],
    expiredPhoneCodeError: ["Expired phone code. Please try again.", "만료된 인증번호입니다. 다시 시도해주세요."],
    emailSentSuccess: ["Email Sent", "이메일이 발송되었습니다."],
    deleteLoading: ["Deleting...", "삭제중..."],
    deleteSuccess: ["Deleted", "삭제되었습니다."],
    leaveSuccess: ["Leaved", "탈퇴되었습니다."],
    noUserWithPhoneError: [
      "No user with the phone number exists.",
      "해당 휴대폰 번호를 가진 사용자가 존재하지 않습니다.",
    ],
  });
