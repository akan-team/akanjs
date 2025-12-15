"use client";
import { dayjs } from "@akanjs/base";
import { clsx, getCookie, router, setCookie } from "@akanjs/client";
import { useInterval, usePushNoti } from "@akanjs/next";
import { Input, Link, Loading, Modal } from "@akanjs/ui";
import { cnst, fetch, st, usePage } from "@shared/client";
import { isEmail, isPhoneNumber, pad } from "@util/common";
import { AreYouRobot, Icon } from "@util/ui";
import { ReactNode, useEffect, useState } from "react";
import { AiFillCheckCircle, AiFillGithub } from "react-icons/ai";

declare global {
  interface Window {
    [key: string]: any;
  }
}

interface VerifyPhoneProps {
  disabled?: boolean;
  hash?: string;
}
export const SetPasswordWithPhone = ({ disabled, hash = "verify" }: VerifyPhoneProps) => {
  const { l } = usePage();
  const self = st.use.self();
  const phoneCode = st.use.phoneCode();
  const phoneCodeAt = st.use.phoneCodeAt();
  const phoneVerifiedAt = st.use.phoneVerifiedAt();
  const [phoneCodeRemain, setPhoneCodeRemain] = useState({ minute: 0, second: 0 });
  const isPhoneVerified = !!phoneVerifiedAt && phoneVerifiedAt.isAfter(dayjs().subtract(3, "minutes"));
  useInterval(() => {
    if (!phoneCodeAt) return;
    const remainSec = Math.max(0, phoneCodeAt.add(3, "minutes").diff(dayjs(), "second"));
    setPhoneCodeRemain({ minute: Math.floor(remainSec / 60), second: remainSec % 60 });
  }, 1000);
  return (
    <>
      <div className="my-6 flex">
        <div className="flex w-full gap-2">
          <Input
            className="w-full"
            inputClassName="w-full"
            placeholder={l("user.phonePlaceholder")}
            value={self.phone ?? ""}
            disabled={true}
            validate={(value) => true}
          />
          <button
            className={`btn w-20 text-xs whitespace-nowrap ${!phoneCodeAt && "btn-primary"}`}
            disabled={!!disabled || !isPhoneNumber(self.phone)} // || self.verifies.includes("phone")}
            onClick={() => {
              if (self.phone) void st.do.requestPhoneCodeForSetPassword(hash);
            }}
          >
            {phoneCodeAt ? "재요청" : "인증요청"}
          </button>
        </div>
      </div>
      <div className="my-6 flex">
        <div className="relative flex w-full gap-2">
          <Input
            className="w-full"
            inputClassName="w-full"
            placeholder={l("user.phoneCodePlaceholder")}
            value={phoneCode}
            onChange={st.do.setPhoneCode}
            disabled={!phoneCodeAt || isPhoneVerified}
            validate={(value) => true}
          />
          {!isPhoneVerified && phoneCodeAt && (
            <div className="text-primary/70 absolute top-2 right-28 flex h-8 items-center align-middle text-sm">
              {pad(phoneCodeRemain.minute, 2)}:{pad(phoneCodeRemain.second, 2)}
            </div>
          )}
          <button
            className="btn btn-primary w-20 text-xs whitespace-nowrap"
            disabled={!phoneCodeAt || isPhoneVerified}
            onClick={() => void st.do.getSignTokenForSetPassword()}
          >
            {isPhoneVerified ? "인증완료" : "인증하기"}
          </button>
        </div>
      </div>
      {/* TODO: 비밀번호 입력 */}
    </>
  );
};

interface SigninPasswordProps {
  siteKey?: string;
  redirect: string;
  replace?: boolean;
  forgotPasswordHref?: string | null;
  signupHref?: string | null;
}
export const SignInPassword = ({
  siteKey,
  redirect,
  replace = false,
  forgotPasswordHref = "/forgotpassword",
  signupHref = "/signup/general",
}: SigninPasswordProps) => {
  const { l, lang } = usePage();
  const accountId = st.use.accountId();
  const password = st.use.password();
  const turnstileToken = st.use.turnstileToken();
  const isSubmitable = isEmail(accountId) && password.length >= 7;
  const [isReady, setIsReady] = useState(true);

  useEffect(() => {
    return () => {
      st.do.setAccountId("");
      st.do.setPassword("");
      st.do.setTurnstileToken("");
    };
  }, []);
  return (
    <>
      <div className="mb-2 flex w-full items-baseline">
        <Input
          id="accountId"
          // icon={<AiOutlineMail />}
          inputStyleType="bordered"
          className="w-full"
          inputClassName="w-full font-sans rounded-md placeholder:text-lg"
          // status={!userForm.accountId || isEmail(userForm.accountId) ? "" : "error"}
          placeholder={l("user.accountIdPlaceholder")}
          value={accountId}
          onChange={st.do.setAccountId}
          validate={(value: string) => true}
        />
      </div>
      <div className="flex w-full items-baseline">
        <Input.Password
          id="password"
          // icon={<AiOutlineLock />}
          className="w-full"
          inputClassName="w-full font-sans rounded-md placeholder:text-lg"
          // status={!password.length || password.length >= 7 ? "" : "error"}
          value={password}
          placeholder={l("user.passwordPlaceholder")}
          onChange={st.do.setPassword}
          onPressEnter={() => {
            if (isReady && isSubmitable) void st.do.signinWithPassword({ redirect, replace });
          }}
          validate={(value: string) => true}
        />
      </div>
      <div className="mt-4 mb-2 flex w-full items-center justify-end gap-3 text-sm tracking-tight text-gray-500">
        {forgotPasswordHref ? (
          <Link href={forgotPasswordHref} className="cursor-pointer duration-300 hover:opacity-50">
            {l("user.forgotPassword")}
          </Link>
        ) : null}
        {signupHref ? (
          <>
            <div className="text-gray-400">|</div>
            <Link href={signupHref} className="cursor-pointer bg-none duration-300 hover:opacity-50">
              {l("user.signup")}
            </Link>
          </>
        ) : null}
      </div>
      {siteKey ? (
        <AreYouRobot
          siteKey={siteKey}
          onSuccess={(token) => {
            st.do.setTurnstileToken(token);
            setIsReady(true);
          }}
        />
      ) : null}
      <button
        id="signin-button"
        className={`text-base-100 btn btn-primary w-full md:mt-5 ${isReady ? "" : "btn-disabled"} gap-2`}
        disabled={!isSubmitable}
        onClick={() => void st.do.signinWithPassword({ redirect, replace })}
      >
        {l("shared.signin")}
        <div className="w-4">
          {!isReady ? (
            <Loading.Spin />
          ) : (
            <div className="animate-pop text-lg duration-200">
              <AiFillCheckCircle />
            </div>
          )}
        </div>
      </button>
    </>
  );
};

export const ChangePassword = ({ siteKey }: { siteKey: string }) => {
  const { l } = usePage();
  const password = st.use.password();
  const prevPassword = st.use.prevPassword();
  const userModal = st.use.userModal();
  const passwordConfirm = st.use.passwordConfirm();
  const turnstileToken = st.use.turnstileToken();
  return (
    <>
      <button
        className="btn btn-sm"
        onClick={() => {
          st.do.setUserModal("changePassword");
        }}
      >
        {l("user.changePassword")}
      </button>
      <Modal
        open={userModal === "changePassword"}
        onCancel={() => {
          st.do.setUserModal(null);
        }}
        title="비밀번호 변경"
        action={
          <button
            className="btn w-full"
            onClick={() => void st.do.changePassword()}
            disabled={password.length < 7 || password !== passwordConfirm || !turnstileToken}
          >
            Submit
          </button>
        }
      >
        <div className="mb-2 flex items-baseline justify-center">
          <div className="w-32">{l("user.prevPassword")}</div>
          <Input.Password value={prevPassword} onChange={st.do.setPrevPassword} validate={(value) => true} />
        </div>
        <div className="mb-2 flex items-baseline justify-center">
          <div className="w-32">{l("user.newPassword")}</div>
          <Input.Password value={password} onChange={st.do.setPassword} validate={(value) => true} />
        </div>
        <div className="mb-2 flex items-baseline justify-center">
          <div className="w-32">{l("user.passwordConfirm")}</div>
          <Input.Password value={passwordConfirm} onChange={st.do.setPasswordConfirm} validate={(value) => true} />
        </div>
        <div className="mb-2 flex justify-center">
          <AreYouRobot
            siteKey={siteKey}
            onSuccess={(token) => {
              st.do.setTurnstileToken(token);
            }}
          />
        </div>
      </Modal>
    </>
  );
};

interface SSOButtonsProps {
  className?: string;
  mainSsos?: cnst.SsoType["value"][];
  subSsos?: cnst.SsoType["value"][];
  signinRedirect: string;
  signupRedirect: string;
  errorRedirect?: string;
  replace?: boolean;
}

export const SSOButtons = ({
  className,
  mainSsos = [],
  subSsos = [],
  signinRedirect,
  signupRedirect,
  errorRedirect = "/404",
  replace = false,
}: SSOButtonsProps) => {
  const { l } = usePage();
  const mainSsoButtonMap: { [key in cnst.SsoType["value"]]: ReactNode } = {
    kakao: (
      <button className="btn relative flex w-full items-center border-none bg-[#FEE500] text-[#3c1e1e] shadow-sm hover:bg-[#FEE500] hover:opacity-50">
        <Icon.Kakao className="absolute left-4 rounded-full" />
        {l("user.signWithKakao")}
      </button>
    ),
    naver: (
      <button className="btn relative flex w-full items-center border-none bg-[#1ec800] text-white shadow-sm hover:bg-[#1ec800] hover:opacity-50">
        <Icon.Naver className="absolute left-4 rounded-full fill-white" />
        {l("user.signWithNaver")}
      </button>
    ),
    github: (
      <button className="btn relative flex w-full items-center border-none bg-black text-white shadow-sm">
        <AiFillGithub className="absolute left-[18px] text-4xl text-white" />
        {l("user.signWithGithub")}
      </button>
    ),
    google: (
      <button className="btn relative flex w-full items-center border border-gray-200 bg-white text-black shadow-sm">
        <Icon.Google className="absolute left-4 rounded-full" />
        {l("user.signWithGoogle")}
      </button>
    ),
    facebook: (
      <button className="btn relative flex w-full items-center border-none bg-[#039be5] text-white shadow-sm">
        <Icon.Facebook className="absolute left-[22px] rounded-full" width={30} />
        {l("user.signWithFacebook")}
      </button>
    ),
    apple: (
      <button className="btn relative flex w-full items-center border-none bg-black text-white shadow-sm">
        <Icon.Apple className="absolute left-4 rounded-full" />
        {l("user.signWithApple")}
      </button>
    ),
  };
  const subSsoButtonMap: { [key in cnst.SsoType["value"]]: ReactNode } = {
    kakao: (
      <button className="relative flex size-14 items-center justify-center rounded-full bg-[#FEE500] hover:bg-[#FEE500] hover:opacity-50">
        <Icon.Kakao className="" />
      </button>
    ),
    naver: (
      <button className="relative flex size-14 items-center justify-center rounded-full bg-[#1ec800] hover:bg-[#1ec800] hover:opacity-50">
        <Icon.Naver className="fill-white" />
      </button>
    ),
    github: (
      <button className="relative flex size-14 items-center justify-center rounded-full bg-black text-black">
        <div className="flex size-10 items-center justify-center rounded-full bg-white">
          <AiFillGithub className="scale-125 text-[200px]" />
        </div>
      </button>
    ),
    google: (
      <button className="relative flex size-14 items-center justify-center rounded-full bg-white shadow-md">
        <Icon.Google className="" />
      </button>
    ),
    facebook: (
      <button className="relative flex size-14 items-center justify-center rounded-full bg-[#1778F2]">
        <Icon.Facebook className="mr-[0.5px] mb-1 fill-transparent" />
      </button>
    ),
    apple: (
      <button className="relative flex size-14 items-center justify-center rounded-full bg-black">
        <Icon.Apple className="fill-white" />
      </button>
    ),
  };
  const mainSsoTypes = mainSsos.filter((ssoType) => !!mainSsoButtonMap[ssoType]);
  const subSsoTypes = subSsos.filter((ssoType) => !!subSsoButtonMap[ssoType]);
  return (
    <div className={clsx("flex w-full flex-col justify-between gap-1.5 md:gap-3", className)}>
      {mainSsoTypes.map((ssoType) => (
        <a
          key={ssoType}
          onClick={() => {
            st.do.ssoSigninUser(ssoType, { signinRedirect, signupRedirect, errorRedirect, replace });
          }}
        >
          {mainSsoButtonMap[ssoType]}
        </a>
      ))}
      {subSsoTypes.length ? (
        <div className="mt-5 flex items-center justify-center gap-4">
          {subSsoTypes.map((ssoType) => (
            <a
              key={ssoType}
              onClick={() => {
                st.do.ssoSigninUser(ssoType, { signinRedirect, signupRedirect, errorRedirect, replace });
              }}
            >
              {subSsoButtonMap[ssoType]}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const ForgotPassword = () => {
  const { l } = usePage();
  const [finished, setFinished] = useState(false);
  const [accountId, setAccountId] = useState("");
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="mb-4 text-center text-3xl font-bold">{l("user.forgotPassword")}</div>
      <div className="mb-6 text-center text-sm">{l("user.forgotPasswordDesc")}</div>
      <div className="mb-2 flex w-full items-baseline">
        <Input
          // icon={<AiOutlineMail />}
          // iconClassName="btn btn-square text-xl"
          className="w-full"
          inputClassName="w-full"
          placeholder={l("user.accountIdPlaceholder")}
          value={accountId}
          onChange={(accountId) => {
            setAccountId(accountId);
          }}
          validate={(accountId) => {
            if (!isEmail(accountId)) return "이메일 형식이 아닙니다.";
            else return true;
          }}
        />
      </div>
      <button
        className="btn btn-primary text-base-100 w-full"
        disabled={!isEmail(accountId) || finished}
        onClick={async () => {
          await st.do.resetPassword(accountId);
          setFinished(true);
        }}
      >
        {l("user.sendResetEmail")}
      </button>
    </div>
  );
};

interface SignoutProps {
  className?: string;
  href?: string;
  children: any;
}
export const Signout = ({ className, href, children }: SignoutProps) => {
  return (
    <Link className={className} href={href} onClick={() => void st.do.logout()}>
      {children}
    </Link>
  );
};

interface ResendPhoneCodeForSigninProps {
  className?: string;
  userId: string;
  phone: string;
  hash: string;
}
export const ResendPhoneCodeForSignin = ({ className, userId, phone, hash }: ResendPhoneCodeForSigninProps) => {
  return (
    <div className={clsx("mt-2 flex justify-center", className)}>
      <button
        className="cursor-pointer border-b border-dashed text-sm opacity-60 duration-300 hover:opacity-100"
        onClick={() => {
          void st.do.requestPhoneCodeForSignin(userId, phone, hash);
        }}
      >
        인증번호 다시받기
      </button>
    </div>
  );
};

interface ResendPhoneCodeForSetPhoneInPrepareUserProps {
  className?: string;
  userId: string;
  phone: string;
  hash?: string;
}
export const ResendPhoneCodeForSetPhoneInPrepareUser = ({
  className,
  userId,
  phone,
  hash = "dummy",
}: ResendPhoneCodeForSetPhoneInPrepareUserProps) => {
  return (
    <div className={clsx("mt-2 flex justify-center", className)}>
      <button
        className="cursor-pointer border-b border-dashed text-sm opacity-60 duration-300 hover:opacity-100"
        onClick={() => {
          void st.do.setPhoneInPrepareUser(userId, phone, { hash });
        }}
      >
        인증번호 다시받기
      </button>
    </div>
  );
};

interface ActivateProps {
  className?: string;
  userId: string;
  redirect: string;
}
export const Activate = ({ className, userId, redirect }: ActivateProps) => {
  return (
    <button
      className={clsx("btn btn-primary", className)}
      onClick={() => {
        void st.do.activateUser(userId, { redirect });
      }}
    >
      시작하기
    </button>
  );
};

interface PhoneSignRouteProps {
  className?: string;
  signinHref?: string;
  signupHref?: string;
}

export const PhoneSignRoute = ({
  className = "",
  signinHref = "/signin/phoneCode",
  signupHref = "/signup/phoneCode",
}: PhoneSignRouteProps) => {
  const phone = st.use.phone();
  return (
    <button
      className={clsx("btn btn-primary", className)}
      disabled={!isPhoneNumber(phone)}
      onClick={async () => {
        const userId = await fetch.getUserIdHasPhone(phone);
        const encodedPhone = encodeURIComponent(phone);
        const hash = "sign"; // TODO: 추후 변경
        if (userId) {
          void st.do.requestPhoneCodeForSignin(userId, phone, hash);
          router.push(`${signinHref}?userId=${userId}&phone=${encodedPhone}&hash=${hash}`);
        } else {
          const { turnstileToken } = st.get();
          const prepareUserId = getCookie("prepareUserId");
          const user = await fetch.generatePrepareUser(prepareUserId ?? null, turnstileToken ?? "dummy");
          setCookie("prepareUserId", user.id);
          void st.do.setPhoneInPrepareUser(user.id, phone, {
            hash,
            redirect: `${signupHref}?userId=${user.id}&phone=${encodedPhone}&hash=${hash}`,
          });
        }
      }}
    >
      인증번호 받기
    </button>
  );
};

interface SigninWithPhoneCodeProps {
  redirect: string;
  userId: string;
  className?: string;
}
export const SigninWithPhoneCode = ({ redirect, userId, className = "" }: SigninWithPhoneCodeProps) => {
  const phoneCode = st.use.phoneCode();
  const handleClick = async () => {
    await st.do.signinWithPhoneCode(userId, { redirect });
  };
  useEffect(() => {
    if (phoneCode.length === 6) void handleClick();
  }, [phoneCode]);
  return (
    <button className={clsx("btn btn-primary", className)} disabled={phoneCode.length !== 6} onClick={handleClick}>
      다음
    </button>
  );
};
interface VerifyPhoneInPrepareUserProps {
  userId: string;
  redirect: string;
  className?: string;
}
export const VerifyPhoneInPrepareUser = ({ userId, redirect, className = "" }: VerifyPhoneInPrepareUserProps) => {
  const phoneCode = st.use.phoneCode();
  const handleClick = async () => {
    await st.do.verifyPhoneInPrepareUser(userId, { redirect });
  };
  useEffect(() => {
    if (phoneCode.length === 6) void handleClick();
  }, [phoneCode]);
  return (
    <button className={clsx("btn btn-primary", className)} disabled={phoneCode.length !== 6} onClick={handleClick}>
      다음
    </button>
  );
};

interface PushNotificationSwitchProps {
  className?: string;
}

export const PushNotificationSwitch = ({ className }: PushNotificationSwitchProps) => {
  const user = st.use.user();
  const self = st.use.self();
  const pushNoti = usePushNoti();
  const deviceToken = st.use.deviceToken();
  //! TODO: 추후 수정필요
  // const checked = self.notiDeviceTokens?.includes(deviceToken) ?? false;
  const checked = false as boolean;
  useEffect(() => {
    const getToken = async () => {
      const deviceToken = await pushNoti.getToken();
      if (!deviceToken) return;
      st.do.setDeviceToken(deviceToken);
    };
    void getToken();
  }, []);

  return (
    <div>
      <input
        type="checkbox"
        className="toggle"
        // checked={checked}
        checked={checked}
        onClick={() => {
          if (checked) void st.do.subNotiDeviceTokenOfSelf(deviceToken);
          else void st.do.addNotiDeviceTokenOfSelf(deviceToken);
        }}
      />
    </div>
  );
};
