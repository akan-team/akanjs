"use client";
import { st, usePage } from "@libs/shared/client";
import { useAutoSubmit } from "@libs/shared/webkit";
import { buttonRecipe } from "@libs/util/ui";
import { cn } from "akanjs/client";
import { isEmail, isPhoneNumber } from "akanjs/common";
import { Input, Modal } from "akanjs/ui";

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
        type="button"
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
            type="button"
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
        type="button"
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
        type="button"
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
        type="button"
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
      type="button"
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={emailCode.length !== 6}
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
      type="button"
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={phoneCode.length !== 6}
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
      type="button"
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
      type="button"
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
      type="button"
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={phoneCode.length !== 6}
      onClick={handleClick}
    >
      {l("util.next")}
    </button>
  );
};

interface SubmitPhoneProps {
  className?: string;
  userId: string;
  redirect: string;
  hash?: string;
}

export const SubmitPhone = ({ className = "", userId, redirect, hash }: SubmitPhoneProps) => {
  const { l } = usePage();
  const phone = st.use.phone();
  return (
    <button
      type="button"
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={!isPhoneNumber(phone)}
      onClick={() => {
        void st.do.setPhoneInPrepareUser(userId, phone, { hash, redirect });
      }}
    >
      {l("user.getPhoneCode")}
    </button>
  );
};

interface GeneratePrepareUserWithAccountIdProps {
  redirect: string;
  requestEmailCode?: boolean;
}
export const GeneratePrepareUserWithAccountId = ({
  redirect,
  requestEmailCode,
}: GeneratePrepareUserWithAccountIdProps) => {
  const { l } = usePage();
  const accountId = st.use.accountId();
  return (
    <button
      type="button"
      className={buttonRecipe({ variant: "primary" })}
      disabled={!accountId || !isEmail(accountId)}
      onClick={() => {
        if (!accountId || !isEmail(accountId)) return;
        void st.do.generatePrepareUserWithAccountId({ redirect, requestEmailCode });
      }}
    >
      {l("util.next")}
    </button>
  );
};

interface SubmitAccountIdProps {
  userId: string;
  redirect: string;
}
export const SubmitAccountId = ({ userId, redirect }: SubmitAccountIdProps) => {
  const { l } = usePage();
  const accountId = st.use.accountId();
  return (
    <button
      type="button"
      className={buttonRecipe({ variant: "primary" })}
      disabled={!accountId || !isEmail(accountId)}
      onClick={() => {
        if (!accountId || !isEmail(accountId)) return;
        void st.do.setAccountIdInPrepareUser(userId, { redirect });
      }}
    >
      {l("util.next")}
    </button>
  );
};

interface SubmitPasswordProps {
  userId: string;
  redirect: string;
}
export const SubmitPassword = ({ userId, redirect }: SubmitPasswordProps) => {
  const { l } = usePage();
  const accountId = st.use.accountId();
  const password = st.use.password();
  const passwordConfirm = st.use.passwordConfirm();
  return (
    <button
      type="button"
      className={buttonRecipe({ variant: "primary" })}
      disabled={!accountId || !password || !passwordConfirm || password !== passwordConfirm}
      onClick={() => {
        void st.do.setPasswordInPrepareUser(userId, { redirect });
      }}
    >
      {l("util.next")}
    </button>
  );
};

interface SubmitPolicyProps {
  userId: string;
  redirect: string;
  mandatoryPolicies?: string[];
}
export const SubmitPolicy = ({
  userId,
  redirect,
  mandatoryPolicies = ["termsofservice", "privacy", "location"],
}: SubmitPolicyProps) => {
  const { l } = usePage();
  const agreePolicies = st.use.agreePolicies();
  return (
    <button
      type="button"
      className={buttonRecipe({ variant: "primary" })}
      disabled={!mandatoryPolicies.every((policy) => agreePolicies.includes(policy))}
      onClick={() => {
        void st.do.setAgreePoliciesOfPrepareUser(userId, agreePolicies, { redirect });
      }}
    >
      {l("util.next")}
    </button>
  );
};
