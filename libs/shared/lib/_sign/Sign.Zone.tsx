"use client";
import { cnst, st, usePage } from "@libs/shared/client";
import { SsoMainButton, SsoSubButton } from "@libs/shared/ui";
import { pad } from "@libs/util/common";
import { buttonRecipe } from "@libs/util/ui";
import { dayjs } from "akanjs/base";
import { cn } from "akanjs/client";
import { isEmail, isPhoneNumber } from "akanjs/common";
import { Input, Link, Loading, Modal } from "akanjs/ui";
import { useInterval } from "akanjs/webkit";
import { useEffect, useState } from "react";
import { AiFillCheckCircle } from "react-icons/ai";

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
          inputStyleType="bordered"
          className="w-full"
          inputClassName="w-full font-sans rounded-md placeholder:text-lg"
          placeholder={l("user.accountIdPlaceholder")}
          value={accountId}
          onChange={st.do.setAccountId}
          validate={(value: string) => true}
        />
      </div>
      <div className="flex w-full items-baseline">
        <Input.Password
          id="password"
          className="w-full"
          inputClassName="w-full font-sans rounded-md placeholder:text-lg"
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
        type="button"
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
        type="button"
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
  const ssoAttempt = st.use.ssoAttempt();
  const mainSsoTypes = mainSsos.filter((ssoType) => cnst.SsoType.values.includes(ssoType));
  const subSsoTypes = subSsos.filter((ssoType) => cnst.SsoType.values.includes(ssoType));
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
              type="button"
              className={buttonRecipe({ variant: "outline" }, "flex-1")}
              onClick={() => {
                st.do.setSsoAttempt(null);
              }}
            >
              {l("user.ssoWaitCancel")}
            </button>
            <button
              type="button"
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
          <SsoMainButton ssoType={ssoType} />
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
              <SsoSubButton ssoType={ssoType} />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
};
