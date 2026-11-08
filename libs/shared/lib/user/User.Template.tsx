"use client";
import { st, User, usePage } from "@libs/shared/client";
import { Field, LeaveInfo as LeaveSurvey, Only } from "@libs/shared/ui";
import { buttonRecipe, CodeInput } from "@libs/util/ui";
import { cn } from "akanjs/client";
import { isEmail, isPhoneNumber } from "akanjs/common";
import { Input, Layout } from "akanjs/ui";
import { useEffect, useRef } from "react";

export { LeaveTypeStep, Reason, Satisfaction, Voc } from "../../ui/UserLeave";
export {
  GeneratePrepareUserWithAccountId,
  SubmitAccountId,
  SubmitPassword,
  SubmitPhone,
  SubmitPolicy,
} from "../_sign/Sign.Util";

interface LeaveInfoProps {
  className?: string;
  redirect?: string;
  leaveReasons?: string[];
  comeBackReasons?: string[];
}
export const LeaveInfo = ({ redirect, ...props }: LeaveInfoProps) => {
  return <LeaveSurvey {...props} onLeave={() => st.do.removeSelf({ redirect })} />;
};

interface GeneralProps {
  className?: string;
}

export const General = ({ className }: GeneralProps) => {
  const user = st.use.user();
  const userForm = st.use.userForm();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      <Field.Text
        label={l("user.name")}
        desc={l("user.name.desc")}
        value={userForm.name}
        onChange={st.do.setNameOnUser}
      />
      {user ? (
        <Only.Admin>
          <User.Util.SetAccountIdByAdmin accountId={user.accountId} />
          <User.Util.SetPasswordByAdmin />
          <User.Util.SetPhoneByAdmin phone={user.phone} />
        </Only.Admin>
      ) : null}
    </Layout.Template>
  );
};

interface PhoneProps {
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  userId?: string;
  redirect?: string;
}
export const Phone = ({ className, inputClassName, placeholder, userId, redirect }: PhoneProps) => {
  const { l } = usePage();
  const phone = st.use.phone();
  const inputRef = useRef<HTMLInputElement>(null);
  const path = st.use.path();
  useEffect(() => {
    inputRef.current?.focus();
  }, [path]);
  return (
    <Input
      inputRef={inputRef}
      type="tel"
      maxLength={13}
      className={className}
      inputClassName={inputClassName}
      placeholder={placeholder ?? l("user.phonePlaceholder")}
      value={phone}
      onChange={st.do.setPhone}
      onPressEnter={() => {
        if (!userId || !isPhoneNumber(phone)) return;
        void st.do.setPhoneInPrepareUser(userId, phone, { redirect });
      }}
      validate={(value) => true}
    />
  );
};

interface PhoneCodeProps {
  className?: string;
  submitOnComplete?: boolean;
}
export const PhoneCode = ({ className, submitOnComplete = true }: PhoneCodeProps) => {
  const phoneCode = st.use.phoneCode();
  return (
    <div className={cn("w-full pb-4", className)}>
      <CodeInput
        submitOnComplete={submitOnComplete}
        unitStyle="underline"
        value={phoneCode}
        onChange={st.do.setPhoneCode}
        maxNum={6}
      />
    </div>
  );
};

interface EmailCodeProps {
  className?: string;
}
export const EmailCode = ({ className }: EmailCodeProps) => {
  const emailCode = st.use.emailCode();
  return (
    <div className={cn("w-full pb-4", className)}>
      <CodeInput unitStyle="underline" value={emailCode} onChange={st.do.setEmailCode} maxNum={6} />
    </div>
  );
};

interface NameProps {
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const Name = ({ className, inputClassName, placeholder, onKeyDown }: NameProps) => {
  const { l } = usePage();
  const userForm = st.use.userForm();
  return (
    <Input
      autoFocus
      inputStyleType="underline"
      className={className}
      inputClassName={inputClassName}
      onKeyDown={onKeyDown}
      placeholder={placeholder ?? l("user.namePlaceholder")}
      validate={(value: string) => (value.length >= 2 && value.length <= 20 ? true : l("user.nameLength"))}
      value={userForm.name ?? ""}
      onChange={st.do.setNameOnUser}
    />
  );
};

interface SubmitNameProps {
  userId: string;
  redirect: string;
  className?: string;
}
export const SubmitName = ({ userId, redirect, className }: SubmitNameProps) => {
  const { l } = usePage();
  const userForm = st.use.userForm();
  return (
    <button
      type="button"
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={!userForm.name || userForm.name.length < 2}
      onClick={async () => {
        if (!userForm.name) return;
        await st.do.setNameOfPrepareUser(userId, userForm.name, { redirect });
      }}
    >
      {l("util.next")}
    </button>
  );
};

interface AccountIdProps {
  inputStyleType?: "underline" | "bordered" | "borderless";
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  redirect: string;
  requestEmailCode?: boolean;
}

export const AccountId = ({
  inputStyleType = "bordered",
  className,
  inputClassName,
  placeholder,
  redirect,
  requestEmailCode,
}: AccountIdProps) => {
  const { l } = usePage();
  const accountId = st.use.accountId();
  return (
    <Input.Email
      autoFocus
      inputStyleType={inputStyleType}
      className={className}
      inputClassName={inputClassName}
      placeholder={placeholder ?? l("user.emailPlaceholder")}
      value={accountId}
      onChange={st.do.setAccountId}
      onPressEnter={() => {
        if (!accountId || !isEmail(accountId)) return;
        void st.do.generatePrepareUserWithAccountId({ redirect, requestEmailCode });
      }}
      validate={(value) => isEmail(value)}
    />
  );
};

interface PasswordWithConfirmProps {
  className?: string;
  userId: string;
  redirect: string;
}
export const PasswordWithConfirm = ({ className, userId, redirect }: PasswordWithConfirmProps) => {
  const { l } = usePage();
  const password = st.use.password();
  const passwordConfirm = st.use.passwordConfirm();
  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <Field.Password
        label={l("user.password")}
        desc={l("user.password.desc")}
        value={password}
        onChange={st.do.setPassword}
        showConfirm
        confirmValue={passwordConfirm}
        onChangeConfirm={st.do.setPasswordConfirm}
        onPressEnter={() => {
          if (!password || !passwordConfirm || password !== passwordConfirm) return;
          void st.do.setPasswordInPrepareUser(userId, { redirect });
        }}
      />
    </div>
  );
};

interface NicknameProps {
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}
export const Nickname = ({ className, inputClassName, placeholder }: NicknameProps) => {
  const { l } = usePage();
  const userForm = st.use.userForm();
  return (
    <Input
      autoFocus
      className={className}
      inputClassName={inputClassName}
      placeholder={placeholder ?? l("user.nicknamePlaceholder")}
      validate={(value: string | null) =>
        value && value.length >= 2 && value.length <= 20 ? true : l("user.nicknameLength")
      }
      value={userForm.nickname}
      onChange={st.do.setNicknameOnUser}
    />
  );
};

interface SubmitNicknameOfPrepareUserProps {
  redirect: string;
  userId: string;
  className?: string;
}
export const SubmitNicknameOfPrepareUser = ({ redirect, userId, className }: SubmitNicknameOfPrepareUserProps) => {
  const { l } = usePage();
  const userForm = st.use.userForm();
  return (
    <button
      type="button"
      className={cn(buttonRecipe({ variant: "default" }, "border-primary-light bg-primary-light"), className)}
      disabled={!userForm.nickname || userForm.nickname.length < 2 || userForm.nickname.length > 20}
      onClick={() => {
        void st.do.setNicknameOfPrepareUser(userId, { redirect });
      }}
    >
      {l("util.next")}
    </button>
  );
};

interface SubmitNicknameProps {
  redirect: string;
  className?: string;
}
export const SubmitNickname = ({ redirect, className }: SubmitNicknameProps) => {
  const { l } = usePage();
  const userForm = st.use.userForm();
  return (
    <button
      type="button"
      className={cn(buttonRecipe({ variant: "default" }, "border-primary-light bg-primary-light"), className)}
      disabled={!userForm.nickname || userForm.nickname.length < 2 || userForm.nickname.length > 20}
      onClick={() => {
        void st.do.setNicknameOfSelf({ redirect });
      }}
    >
      {l("util.next")}
    </button>
  );
};

interface ActivateByAdminProps {
  userId: string;
  className?: string;
}
export const ActivateByAdmin = ({ userId, className }: ActivateByAdminProps) => {
  const { l } = usePage();
  return (
    <button
      type="button"
      className={buttonRecipe({ variant: "primary" }, className)}
      onClick={() => {
        void st.do.activateUserByAdmin(userId);
      }}
    >
      {l("user.signal.activateUser")}
    </button>
  );
};
