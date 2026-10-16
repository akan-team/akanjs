"use client";
import { type cnst, st, usePage } from "@libs/shared/client";
import { useAutoSubmit } from "@libs/shared/webkit";
import { pad } from "@libs/util/common";
import { buttonRecipe, Icon } from "@libs/util/ui";
import { usePushNotification } from "@libs/util/webkit";
import { dayjs } from "akanjs/base";
import { cn } from "akanjs/client";
import { formatPhone, isEmail, isPhoneNumber } from "akanjs/common";
import { Input, Link, Loading, Modal, Switch } from "akanjs/ui";
import { useInterval } from "akanjs/webkit";
import { type ReactNode, useEffect, useState } from "react";
import { AiFillCheckCircle, AiFillGithub, AiOutlineClose, AiOutlineEdit, AiOutlineSave } from "react-icons/ai";

interface SetPasswordWithPhoneProps {
  disabled?: boolean;
  hash?: string;
}
export const SetPasswordWithPhone = ({ disabled, hash = "verify" }: SetPasswordWithPhoneProps) => {
  const { l } = usePage();
  const phone = st.use.phone();
  const phoneCode = st.use.phoneCode();
  const phoneCodeAt = st.use.phoneCodeAt();
  const signToken = st.use.signToken();
  const password = st.use.password();
  const passwordConfirm = st.use.passwordConfirm();
  const [remainSec, setRemainSec] = useState(0);
  useInterval(() => {
    setRemainSec(phoneCodeAt ? Math.max(0, 180 - dayjs().diff(phoneCodeAt, "second")) : 0);
  }, 1000);
  const isPhoneVerified = !!signToken;
  const isPasswordReady = password.length >= 7 && password === passwordConfirm;
  return (
    <div className="my-4 flex flex-col gap-4">
      <div className="flex w-full gap-2">
        <Input
          className="w-full"
          inputClassName="w-full"
          placeholder={l("user.phonePlaceholder")}
          value={phone}
          onChange={st.do.setPhone}
          disabled={!!disabled || isPhoneVerified}
          validate={(value) => true}
        />
        <button
          type="button"
          className={buttonRecipe({ variant: phoneCodeAt ? "default" : "primary" }, "w-20 whitespace-nowrap text-xs")}
          disabled={!!disabled || isPhoneVerified || !isPhoneNumber(phone)}
          onClick={() => void st.do.requestPhoneCodeForSetPassword(hash)}
        >
          {phoneCodeAt ? l("user.resendPhoneCode") : l("user.requestPhoneCode")}
        </button>
      </div>
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
        {!isPhoneVerified && remainSec ? (
          <div className="absolute top-2 right-28 flex h-8 items-center text-primary/70 text-sm">
            {pad(Math.floor(remainSec / 60), 2)}:{pad(remainSec % 60, 2)}
          </div>
        ) : null}
        <button
          type="button"
          className={buttonRecipe({ variant: "primary" }, "w-20 whitespace-nowrap text-xs")}
          disabled={!phoneCodeAt || isPhoneVerified || phoneCode.length !== 6}
          onClick={() => void st.do.getSignTokenForSetPassword()}
        >
          {isPhoneVerified ? l("user.phoneVerified") : l("user.verifyPhoneCode")}
        </button>
      </div>
      {isPhoneVerified ? (
        <>
          <Input.Password
            placeholder={l("user.newPassword")}
            value={password}
            onChange={st.do.setPassword}
            validate={(value) => true}
          />
          <Input.Password
            placeholder={l("user.passwordConfirm")}
            value={passwordConfirm}
            onChange={st.do.setPasswordConfirm}
            validate={(value) => true}
          />
          <button
            type="button"
            className={buttonRecipe({ variant: "primary" }, "w-full")}
            disabled={!isPasswordReady}
            onClick={() => void st.do.setPasswordWithSignToken()}
          >
            {l("user.setNewPassword")}
          </button>
        </>
      ) : null}
    </div>
  );
};

interface SignInPasswordProps {
  redirect: string;
  replace?: boolean;
  forgotPasswordHref?: string | null;
  signupHref?: string | null;
}
export const SignInPassword = ({
  redirect,
  replace = false,
  forgotPasswordHref = "/forgotpassword",
  signupHref = "/signup/general",
}: SignInPasswordProps) => {
  const { l } = usePage();
  const accountId = st.use.accountId();
  const password = st.use.password();
  const isSubmitable = isEmail(accountId) && password.length >= 7;
  useEffect(() => {
    return () => {
      st.do.setAccountId("");
      st.do.setPassword("");
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
            if (isSubmitable) void st.do.signinWithPassword({ redirect, replace });
          }}
          validate={(value: string) => true}
        />
      </div>
      <div className="mt-4 mb-2 flex w-full items-center justify-end gap-3 text-muted-foreground text-sm tracking-tight">
        {forgotPasswordHref ? (
          <Link href={forgotPasswordHref} className="cursor-pointer duration-300 hover:opacity-50">
            {l("user.forgotPassword")}
          </Link>
        ) : null}
        {signupHref ? (
          <>
            <div className="text-muted-foreground">|</div>
            <Link href={signupHref} className="cursor-pointer bg-none duration-300 hover:opacity-50">
              {l("user.signup")}
            </Link>
          </>
        ) : null}
      </div>
      <button
        id="signin-button"
        className={buttonRecipe({ variant: "primary" }, "w-full gap-2 text-background md:mt-5")}
        disabled={!isSubmitable}
        onClick={() => void st.do.signinWithPassword({ redirect, replace })}
      >
        {l("shared.signin")}
        <div className="w-4">
          <div className="animate-pop text-lg duration-200">
            <AiFillCheckCircle />
          </div>
        </div>
      </button>
    </>
  );
};

export const ChangePassword = () => {
  const { l } = usePage();
  const password = st.use.password();
  const prevPassword = st.use.prevPassword();
  const userModal = st.use.userModal();
  const passwordConfirm = st.use.passwordConfirm();
  st.tool("changePassword", {
    confirm: true,
    guard: () =>
      userModal !== "changePassword"
        ? "The change-password form is not open."
        : password.length < 7
          ? "The new password needs at least seven characters."
          : password !== passwordConfirm
            ? "The two new passwords do not match."
            : true,
  })
    .desc("Save the new password the change-password form holds.")
    .exec(() => st.do.changePassword());
  return (
    <>
      <button
        className={buttonRecipe({ size: "sm", variant: "default" })}
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
        title={l("user.changePassword")}
        action={
          <button
            className={buttonRecipe({ variant: "default" }, "w-full")}
            onClick={() => void st.do.changePassword()}
            disabled={password.length < 7 || password !== passwordConfirm}
          >
            {l("user.setNewPassword")}
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
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border-none bg-[var(--kakao)] text-[var(--kakao-ink)] shadow-sm hover:bg-[var(--kakao)] hover:opacity-50",
        )}
      >
        <Icon.Kakao className="absolute left-4 rounded-full" />
        {l("user.signWithKakao")}
      </button>
    ),
    naver: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border-none bg-[var(--naver)] text-white shadow-sm hover:bg-[var(--naver)] hover:opacity-50",
        )}
      >
        <Icon.Naver className="absolute left-4 rounded-full fill-white" />
        {l("user.signWithNaver")}
      </button>
    ),
    github: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border-none bg-black text-white shadow-sm",
        )}
      >
        <AiFillGithub className="absolute left-[18px] text-4xl text-white" />
        {l("user.signWithGithub")}
      </button>
    ),
    google: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border border-border bg-white text-black shadow-sm",
        )}
      >
        <Icon.Google className="absolute left-4 rounded-full" />
        {l("user.signWithGoogle")}
      </button>
    ),
    facebook: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border-none bg-[var(--telegram)] text-white shadow-sm",
        )}
      >
        <Icon.Facebook className="absolute left-[22px] rounded-full" width={30} />
        {l("user.signWithFacebook")}
      </button>
    ),
    apple: (
      <button
        className={buttonRecipe(
          { variant: "default" },
          "relative flex w-full items-center border-none bg-black text-white shadow-sm",
        )}
      >
        <Icon.Apple className="absolute left-4 rounded-full" />
        {l("user.signWithApple")}
      </button>
    ),
  };
  const subSsoButtonMap: { [key in cnst.SsoType["value"]]: ReactNode } = {
    kakao: (
      <button className="relative flex size-14 items-center justify-center rounded-full bg-[var(--kakao)] hover:bg-[var(--kakao)] hover:opacity-50">
        <Icon.Kakao className="" />
      </button>
    ),
    naver: (
      <button className="relative flex size-14 items-center justify-center rounded-full bg-[var(--naver)] hover:bg-[var(--naver)] hover:opacity-50">
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
      <button className="relative flex size-14 items-center justify-center rounded-full bg-[var(--facebook)]">
        <Icon.Facebook className="mr-[0.5px] mb-1 fill-transparent" />
      </button>
    ),
    apple: (
      <button className="relative flex size-14 items-center justify-center rounded-full bg-black">
        <Icon.Apple className="fill-white" />
      </button>
    ),
  };
  const ssoAttempt = st.use.ssoAttempt();
  const mainSsoTypes = mainSsos.filter((ssoType) => !!mainSsoButtonMap[ssoType]);
  const subSsoTypes = subSsos.filter((ssoType) => !!subSsoButtonMap[ssoType]);
  return (
    <div className={cn("flex w-full flex-col justify-between gap-1.5 md:gap-3", className)}>
      <Modal
        open={!!ssoAttempt}
        onCancel={() => {
          st.do.setSsoAttempt(null);
        }}
        title={l("user.ssoWaitTitle")}
        action={
          <div className="flex w-full gap-2">
            <button
              className={buttonRecipe({ variant: "outline" }, "flex-1")}
              onClick={() => {
                st.do.setSsoAttempt(null);
              }}
            >
              {l("user.ssoWaitCancel")}
            </button>
            <button
              className={buttonRecipe({ variant: "primary" }, "flex-1")}
              onClick={() => {
                if (ssoAttempt)
                  void st.do.ssoSigninUser(ssoAttempt.ssoType, {
                    signinRedirect,
                    signupRedirect,
                    errorRedirect,
                    replace,
                  });
              }}
            >
              {l("user.ssoWaitReopen")}
            </button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <Loading.Spin />
          <p className="text-foreground/70 text-sm">{l("user.ssoWaitDesc")}</p>
        </div>
      </Modal>
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
  st.tool("resetPassword", {
    confirm: ({ accountId }) => `Send a password reset email to ${String(accountId)}?`,
    guard: ({ accountId }) =>
      finished
        ? "A reset email has already been sent from this screen."
        : isEmail(String(accountId ?? ""))
          ? true
          : "That is not an email address.",
  })
    .desc("Email a password-reset link to one account address.")
    .arg("accountId", String)
    .exec(async (address) => {
      setAccountId(address);
      await st.do.resetPassword(address);
      setFinished(true);
    });
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="mb-4 text-center font-bold text-3xl">{l("user.forgotPassword")}</div>
      <div className="mb-6 text-center text-sm">{l("user.forgotPasswordDesc")}</div>
      <div className="mb-2 flex w-full items-baseline">
        <Input
          // icon={<AiOutlineMail />}
          // iconClassName={buttonRecipe({ shape: "square" , variant: "default" }, "text-xl")}
          className="w-full"
          inputClassName="w-full"
          placeholder={l("user.accountIdPlaceholder")}
          value={accountId}
          onChange={(accountId) => {
            setAccountId(accountId);
          }}
          validate={(accountId) => {
            if (!isEmail(accountId)) return l("user.invalidEmailFormat");
            else return true;
          }}
        />
      </div>
      <button
        className={buttonRecipe({ variant: "primary" }, "w-full text-background")}
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
  children: ReactNode;
}
export const Signout = ({ className, href, children }: SignoutProps) => {
  st.tool("signout", { confirm: true })
    .desc("Sign out of this account.")
    .exec(() => st.do.logout());
  return (
    <Link className={className} href={href} onClick={() => void st.do.logout()}>
      {children}
    </Link>
  );
};

interface ResendPhoneCodeForSigninProps {
  className?: string;
  phone: string;
  hash: string;
}
export const ResendPhoneCodeForSignin = ({ className, phone, hash }: ResendPhoneCodeForSigninProps) => {
  const { l } = usePage();
  st.tool("resendPhoneCode", { confirm: true })
    .desc("Send the sign-in code to this phone number again by SMS.")
    .exec(() => st.do.requestPhoneCodeForSignin(phone, hash));
  return (
    <div className={cn("mt-2 flex justify-center", className)}>
      <button
        className="cursor-pointer border-b border-dashed text-sm opacity-60 duration-300 hover:opacity-100"
        onClick={() => {
          void st.do.requestPhoneCodeForSignin(phone, hash);
        }}
      >
        {l("user.resendCode")}
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
  const { l } = usePage();
  return (
    <div className={cn("mt-2 flex justify-center", className)}>
      <button
        className="cursor-pointer border-b border-dashed text-sm opacity-60 duration-300 hover:opacity-100"
        onClick={() => {
          void st.do.setPhoneInPrepareUser(userId, phone, { hash });
        }}
      >
        {l("user.resendCode")}
      </button>
    </div>
  );
};

interface ResendEmailCodeInPrepareUserProps {
  className?: string;
  userId: string;
}
export const ResendEmailCodeInPrepareUser = ({ className, userId }: ResendEmailCodeInPrepareUserProps) => {
  const { l } = usePage();
  return (
    <div className={cn("mt-2 flex justify-center", className)}>
      <button
        className="cursor-pointer border-b border-dashed text-sm opacity-60 duration-300 hover:opacity-100"
        onClick={() => {
          void st.do.requestEmailCodeInPrepareUser(userId);
        }}
      >
        {l("user.resendEmailCode")}
      </button>
    </div>
  );
};

interface VerifyEmailInPrepareUserProps {
  userId: string;
  redirect: string;
  className?: string;
}
export const VerifyEmailInPrepareUser = ({ userId, redirect, className = "" }: VerifyEmailInPrepareUserProps) => {
  const { l } = usePage();
  const emailCode = st.use.emailCode();
  const { run: handleClick } = useAutoSubmit(emailCode, async () => {
    await st.do.verifyEmailInPrepareUser(userId, { redirect });
  });
  st.tool("verifyEmailCode", {
    guard: () => (emailCode.length === 6 ? true : "The six-digit code from the mail goes in first."),
  })
    .desc("Confirm the email address with the six-digit code that was mailed to it, once it is typed in.")
    .exec(handleClick);
  return (
    <button
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={emailCode.length !== 6}
      onClick={handleClick}
    >
      {l("util.next")}
    </button>
  );
};

interface ActivateProps {
  className?: string;
  userId: string;
  redirect?: string;
  /** 별도 약관 화면 없이 가입을 끝내는 경우, 이 버튼이 곧 동의 표시가 되는 약관 목록. */
  agreePolicies?: string[];
}
export const Activate = ({ className, userId, redirect, agreePolicies }: ActivateProps) => {
  const { l } = usePage();
  st.tool("activateUser", { confirm: true })
    .desc("Finish signing up and open the account.")
    .exec(() => st.do.activateUser(userId, { redirect, agreePolicies }));
  return (
    <button
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      onClick={() => {
        void st.do.activateUser(userId, { redirect, agreePolicies });
      }}
    >
      {l("user.getStarted")}
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
  const { l } = usePage();
  const phone = st.use.phone();
  return (
    <button
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={!isPhoneNumber(phone)}
      onClick={() => void st.do.startPhoneSign({ signinHref, signupHref })}
    >
      {l("user.getPhoneCode")}
    </button>
  );
};

interface SigninWithPhoneCodeProps {
  redirect: string;
  phone: string;
  className?: string;
}
export const SigninWithPhoneCode = ({ redirect, phone, className = "" }: SigninWithPhoneCodeProps) => {
  const { l } = usePage();
  const phoneCode = st.use.phoneCode();
  const { run: handleClick } = useAutoSubmit(phoneCode, async () => {
    await st.do.signinWithPhoneCode(phone, { redirect });
  });
  st.tool("signinWithPhoneCode", {
    guard: () => (phoneCode.length === 6 ? true : "The six-digit code from the text goes in first."),
  })
    .desc("Sign in with the six-digit code that was texted to this number, once it is typed in.")
    .exec(handleClick);
  return (
    <button
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={phoneCode.length !== 6}
      onClick={handleClick}
    >
      {l("util.next")}
    </button>
  );
};
interface VerifyPhoneInPrepareUserProps {
  userId: string;
  redirect: string;
  className?: string;
}
export const VerifyPhoneInPrepareUser = ({ userId, redirect, className = "" }: VerifyPhoneInPrepareUserProps) => {
  const { l } = usePage();
  const phoneCode = st.use.phoneCode();
  const { run: handleClick } = useAutoSubmit(phoneCode, async () => {
    await st.do.verifyPhoneInPrepareUser(userId, { redirect });
  });
  st.tool("verifyPhoneCode", {
    guard: () => (phoneCode.length === 6 ? true : "The six-digit code from the text goes in first."),
  })
    .desc("Confirm the phone number with the six-digit code that was texted to it, once it is typed in.")
    .exec(handleClick);
  return (
    <button
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={phoneCode.length !== 6}
      onClick={handleClick}
    >
      {l("util.next")}
    </button>
  );
};

interface PushNotificationSwitchProps {
  className?: string;
}

export const PushNotificationSwitch = ({ className }: PushNotificationSwitchProps) => {
  const pushNotification = usePushNotification();
  const deviceToken = st.use.deviceToken();
  const pushRegistered = st.use.pushRegistered();
  const checked = pushRegistered === true;

  // The token list is on a secret field, so the switch cannot read its own state off `self` — it asks the
  // server once for this one device.
  useEffect(() => {
    const load = async () => {
      const permission = await pushNotification.getPermission();
      const pushToken = permission === "granted" ? await pushNotification.getToken() : undefined;
      await st.do.loadPushState(pushToken?.token ?? null, permission);
    };
    void load();
  }, []);

  const toggle = async (on: boolean) => {
    if (!on) {
      if (deviceToken) await st.do.unregisterPushToken(deviceToken);
      return;
    }
    const pushToken = await pushNotification.register();
    if (!pushToken) {
      await st.do.loadPushState(null, await pushNotification.getPermission());
      return;
    }
    await st.do.registerPushToken(pushToken);
  };

  st.tool("setPushNotification", {
    guard: ({ on }) => (on === checked ? `Already ${on ? "on" : "off"}.` : true),
  })
    .desc("Turn push notifications on or off for this device.")
    .arg("on", Boolean)
    .exec(toggle);
  return (
    <div className={className}>
      <Switch checked={checked} onChange={toggle} />
    </div>
  );
};

interface SetAccountIdByAdminProps {
  className?: string;
  accountId: string | null;
}
export const SetAccountIdByAdmin = ({ className, accountId }: SetAccountIdByAdminProps) => {
  const { l } = usePage();
  const [changeId, setChangeId] = useState(accountId ?? "empty");
  const [editState, setEditState] = useState<"edit" | "saving" | null>(null);
  const invalid =
    changeId === accountId || changeId.length < 4 || (isEmail(accountId) && !isEmail(changeId))
      ? l("user.setAccountIdByAdminInvalid")
      : null;
  st.tool("setAccountIdByAdmin", {
    confirm: "Change the sign-in id of this account?",
    guard: ({ accountId: next }) =>
      typeof next !== "string" || next.length < 4
        ? "An account id is at least four characters."
        : isEmail(accountId) && !isEmail(next)
          ? "This account signs in with an email, so the new id has to be an email too."
          : true,
  })
    .desc("Change the account id this user signs in with.")
    .arg("accountId", String)
    .exec(async (next) => {
      await st.do.setAccountIdByAdmin(next);
      setChangeId(next);
    });
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="w-24">{l("user.accountId")}</span>
      <Input
        value={changeId}
        onChange={setChangeId}
        disabled={!editState}
        validate={() => invalid ?? true}
        onPressEnter={() => {
          if (invalid || editState !== "edit") return;
          void st.do.setAccountIdByAdmin(changeId);
          setEditState(null);
        }}
      />
      {editState ? (
        <>
          <button
            className={buttonRecipe({ variant: "primary" })}
            disabled={editState === "saving" || !!invalid}
            onClick={async () => {
              setEditState("saving");
              await st.do.setAccountIdByAdmin(changeId);
              setEditState(null);
            }}
          >
            <AiOutlineSave />
          </button>
          <button
            className={buttonRecipe({ variant: "outline" })}
            disabled={editState === "saving"}
            onClick={() => {
              setChangeId(accountId ?? "");
              setEditState(null);
            }}
          >
            <AiOutlineClose />
          </button>
        </>
      ) : (
        <button
          className={buttonRecipe({ variant: "default" })}
          onClick={() => {
            setEditState("edit");
          }}
        >
          <AiOutlineEdit />
        </button>
      )}
    </div>
  );
};

interface SetPasswordByAdminProps {
  className?: string;
}
// XXX: no tool here. Every other admin edit on this screen changes what an account *is*; overwriting its
// password changes who can *be* it, with no notice to the person who owns it. That is account takeover, so it
// stays a thing an operator does by hand.
export const SetPasswordByAdmin = ({ className }: SetPasswordByAdminProps) => {
  const { l } = usePage();
  const [password, setPassword] = useState("");
  const [editState, setEditState] = useState<"edit" | "saving" | null>(null);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="w-24">{l("user.password")}</span>
      <Input.Password
        value={password}
        onChange={setPassword}
        placeholder="********"
        disabled={!editState}
        validate={(value: string) =>
          value.length < 8 || value.length > 20 ? l("user.setPasswordByAdminInvalid") : true
        }
      />
      {editState ? (
        <>
          <button
            className={buttonRecipe({ variant: "primary" })}
            disabled={editState === "saving" || password.length < 8 || password.length > 20}
            onClick={async () => {
              setEditState("saving");
              try {
                await st.do.setPasswordByAdmin(password);
                setPassword("");
              } finally {
                setEditState(null);
              }
            }}
          >
            <AiOutlineSave />
          </button>
          <button
            className={buttonRecipe({ variant: "outline" })}
            disabled={editState === "saving"}
            onClick={() => {
              setPassword("");
              setEditState(null);
            }}
          >
            <AiOutlineClose />
          </button>
        </>
      ) : (
        <button
          className={buttonRecipe({ variant: "default" })}
          onClick={() => {
            setEditState("edit");
          }}
        >
          <AiOutlineEdit />
        </button>
      )}
    </div>
  );
};

interface SetPhoneByAdminProps {
  className?: string;
  phone: string | null;
}
export const SetPhoneByAdmin = ({ className, phone }: SetPhoneByAdminProps) => {
  const { l } = usePage();
  const [changePhone, setChangePhone] = useState(phone ?? "empty");
  const [editState, setEditState] = useState<"edit" | "saving" | null>(null);
  st.tool("setPhoneByAdmin", {
    confirm: "Change the verified phone number of this account?",
    guard: ({ phone: next }) =>
      typeof next !== "string" || !isPhoneNumber(formatPhone(next))
        ? "That is not a phone number this account can verify with."
        : true,
  })
    .desc("Change the phone number this user verifies with.")
    .arg("phone", String)
    .exec(async (next) => {
      const formatted = formatPhone(next);
      await st.do.setPhoneByAdmin(formatted);
      setChangePhone(formatted);
    });
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="w-24">{l("user.phone")}</span>
      <Input
        value={changePhone}
        onChange={(value) => {
          setChangePhone(formatPhone(value));
        }}
        disabled={!editState}
        validate={(value: string) => isPhoneNumber(value) || l("user.setPhoneByAdminInvalid")}
      />
      {editState ? (
        <>
          <button
            className={buttonRecipe({ variant: "primary" })}
            disabled={editState === "saving" || !isPhoneNumber(changePhone) || changePhone === phone}
            onClick={async () => {
              setEditState("saving");
              await st.do.setPhoneByAdmin(changePhone);
              setEditState(null);
            }}
          >
            <AiOutlineSave />
          </button>
          <button
            className={buttonRecipe({ variant: "outline" })}
            disabled={editState === "saving"}
            onClick={() => {
              setChangePhone(phone ?? "");
              setEditState(null);
            }}
          >
            <AiOutlineClose />
          </button>
        </>
      ) : (
        <button
          className={buttonRecipe({ variant: "default" })}
          onClick={() => {
            setEditState("edit");
          }}
        >
          <AiOutlineEdit />
        </button>
      )}
    </div>
  );
};
