"use client";
import { fetch, st, User, usePage } from "@libs/shared/client";
import { Field, Only } from "@libs/shared/ui";
import { buttonRecipe, CodeInput, Upload } from "@libs/util/ui";
import { cn } from "akanjs/client";
import { isEmail, isPhoneNumber } from "akanjs/common";
import type { ProtoFile } from "akanjs/constant";
import { Button, Image, Input, Layout } from "akanjs/ui";
import { useEffect, useRef } from "react";
import { AiOutlinePlus } from "react-icons/ai";

export * from "../../ui/UserLeave";

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

interface SubmitPhoneProps {
  className?: string;
  userId: string;
  redirect: string;
  hash?: string;
}

export const SubmitPhone = ({ className = "", userId, redirect, hash }: SubmitPhoneProps) => {
  const phone = st.use.phone();
  return (
    <button
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={!isPhoneNumber(phone)}
      onClick={() => {
        void st.do.setPhoneInPrepareUser(userId, phone, { hash, redirect });
      }}
    >
      인증번호 받기
    </button>
  );
};

interface PhoneCodeProps {
  className?: string;
  autoComplete?: boolean;
}
export const PhoneCode = ({ className, autoComplete = true }: PhoneCodeProps) => {
  const phoneCode = st.use.phoneCode();
  return (
    <div className={cn("w-full pb-4", className)}>
      <CodeInput
        autoComplete={autoComplete}
        unitStyle="underline"
        value={phoneCode}
        onChange={st.do.setPhoneCode}
        maxNum={6}
      />
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
  const userForm = st.use.userForm();
  return (
    <Input
      autoFocus
      inputStyleType="underline"
      className={className}
      inputClassName={inputClassName}
      onKeyDown={onKeyDown}
      placeholder={placeholder ?? "이름을 입력해주세요"}
      validate={(value: string) =>
        value.length >= 2 && value.length <= 20 ? true : "2자 이상 20자 이내로 입력해주세요."
      }
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
  const userForm = st.use.userForm();
  return (
    <button
      className={cn(buttonRecipe({ variant: "primary" }), className)}
      disabled={!userForm.name || userForm.name.length < 2}
      onClick={async () => {
        if (!userForm.name) return;
        await st.do.setNameOfPrepareUser(userId, userForm.name, { redirect });
      }}
    >
      다음
    </button>
  );
};

interface AccountIdProps {
  inputStyleType?: "underline" | "bordered" | "borderless";
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  redirect: string;
}

export const AccountId = ({
  inputStyleType = "bordered",
  className,
  inputClassName,
  placeholder,
  redirect,
}: AccountIdProps) => {
  const accountId = st.use.accountId();
  return (
    <Input.Email
      autoFocus
      inputStyleType={inputStyleType}
      className={className}
      inputClassName={inputClassName}
      placeholder={placeholder ?? "이메일을 입력해주세요"}
      value={accountId}
      onChange={st.do.setAccountId}
      onPressEnter={() => {
        if (!accountId || !isEmail(accountId)) return;
        void st.do.generatePrepareUserWithAccountId({ redirect });
      }}
      validate={(value) => isEmail(value)}
    />
  );
};

interface GeneratePrepareUserWithAccountIdProps {
  redirect: string;
}
export const GeneratePrepareUserWithAccountId = ({ redirect }: GeneratePrepareUserWithAccountIdProps) => {
  const accountId = st.use.accountId();
  return (
    <button
      className={buttonRecipe({ variant: "primary" })}
      disabled={!accountId || !isEmail(accountId)}
      onClick={() => {
        if (!accountId || !isEmail(accountId)) return;
        void st.do.generatePrepareUserWithAccountId({ redirect });
      }}
    >
      다음
    </button>
  );
};

interface SubmitAccountIdProps {
  userId: string;
  redirect: string;
}
export const SubmitAccountId = ({ userId, redirect }: SubmitAccountIdProps) => {
  const accountId = st.use.accountId();
  return (
    <button
      className={buttonRecipe({ variant: "primary" })}
      disabled={!accountId || !isEmail(accountId)}
      onClick={() => {
        if (!accountId || !isEmail(accountId)) return;
        void st.do.setAccountIdInPrepareUser(userId, { redirect });
      }}
    >
      다음
    </button>
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

interface SubmitPasswordProps {
  userId: string;
  redirect: string;
}
export const SubmitPassword = ({ userId, redirect }: SubmitPasswordProps) => {
  const accountId = st.use.accountId();
  const password = st.use.password();
  const passwordConfirm = st.use.passwordConfirm();
  return (
    <button
      className={buttonRecipe({ variant: "primary" })}
      disabled={!accountId || !password || !passwordConfirm || password !== passwordConfirm}
      onClick={() => {
        void st.do.setPasswordInPrepareUser(userId, { redirect });
      }}
    >
      다음
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
  const agreePolicies = st.use.agreePolicies();
  return (
    <button
      className={buttonRecipe({ variant: "primary" })}
      disabled={!mandatoryPolicies.every((policy) => agreePolicies.includes(policy))}
      onClick={() => {
        void st.do.setAgreePoliciesOfPrepareUser(userId, agreePolicies, { redirect });
      }}
    >
      다음
    </button>
  );
};

interface NicknameProps {
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}
export const Nickname = ({ className, inputClassName, placeholder }: NicknameProps) => {
  const userForm = st.use.userForm();
  return (
    <Input
      autoFocus
      className={className}
      inputClassName={inputClassName}
      placeholder={placeholder ?? "이름을 입력해주세요"}
      validate={(value: string | null) =>
        value && value.length >= 2 && value.length <= 20 ? true : "2자 이상 20자 이내로 입력해주세요."
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
  const userForm = st.use.userForm();
  return (
    <button
      className={cn(buttonRecipe({ variant: "default" }, "border-primary-light bg-primary-light"), className)}
      disabled={!userForm.nickname || userForm.nickname.length < 2 || userForm.nickname.length > 20}
      onClick={() => {
        void st.do.setNicknameOfPrepareUser(userId, { redirect });
      }}
    >
      다음
    </button>
  );
};

interface SubmitNicknameProps {
  redirect: string;
  className?: string;
}
export const SubmitNickname = ({ redirect, className }: SubmitNicknameProps) => {
  const userForm = st.use.userForm();
  return (
    <button
      className={cn(buttonRecipe({ variant: "default" }, "border-primary-light bg-primary-light"), className)}
      disabled={!userForm.nickname || userForm.nickname.length < 2 || userForm.nickname.length > 20}
      onClick={() => {
        void st.do.setNicknameOfSelf({ redirect });
      }}
    >
      다음
    </button>
  );
};

export const AppliedImages = () => {
  const userForm = st.use.userForm();
  const { l } = usePage();
  const onRemove = (index: number) => {
    if (!window.confirm(l("user.removeAppliedImageConfirm"))) return;
    st.do.subAppliedImagesOnUser(index);
  };
  return (
    <>
      <div className="mb-2 grid w-full grid-cols-2 gap-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Upload.Image
            key={i}
            aspectRatio={[9, 16]}
            type="crop"
            styleType="square"
            protoFile={userForm.appliedImages[i]}
            onRemove={() => {
              onRemove(i);
            }}
            renderEmpty={() => (
              <div
                className={cn(
                  "flex aspect-1 w-full items-center justify-center rounded-2xl bg-muted duration-300 hover:opacity-50",
                  i === 0 ? "border-4 border-primary" : "",
                )}
              >
                <AiOutlinePlus className="font-bold text-6xl text-primary opacity-60" />
                {i === 0 ? (
                  <div className="absolute top-2 left-2 rounded-md bg-primary px-1 text-white text-xs">
                    {l("user.mainAppliedImage")}
                  </div>
                ) : null}
              </div>
            )}
            renderComplete={(file) => (
              <div
                className={cn("aspect-1 w-full overflow-hidden rounded-2xl", i === 0 ? "border-4 border-primary" : "")}
              >
                <Image file={file} className="size-full object-cover" />
              </div>
            )}
            onSave={(file) => void st.do.uploadAppliedImagesOnUser([file] as unknown as FileList)}
          />
        ))}
      </div>

      <div className="grid w-full grid-cols-3 gap-1">
        {Array.from({ length: 3 }, (_, i) => (
          <Upload.Image
            key={i + 2}
            aspectRatio={[9, 16]}
            type="crop"
            styleType="square"
            onRemove={() => {
              onRemove(i + 2);
            }}
            renderEmpty={() => (
              <div className="flex aspect-1 w-full items-center justify-center rounded-xl bg-muted text-primary duration-300 hover:opacity-50">
                <AiOutlinePlus className="font-bold text-2xl opacity-60" />
              </div>
            )}
            renderComplete={(file) => (
              <div className="aspect-1 w-full rounded-xl">
                <Image file={file as unknown as ProtoFile} className="size-full rounded-xl object-cover" />
              </div>
            )}
            protoFile={userForm.appliedImages[i + 2]}
            onSave={(file) => {
              void st.do.uploadAppliedImagesOnUser([file] as unknown as FileList);
            }}
          />
        ))}
      </div>
    </>
  );
};

interface SubmitAppliedImagesProps {
  redirect: string;
}
export const SubmitAppliedImages = ({ redirect }: SubmitAppliedImagesProps) => {
  const userForm = st.use.userForm();
  return (
    <Button
      className="border-primary-light bg-primary-light"
      disabled={userForm.appliedImages.length < 2}
      onClick={() => {
        void st.do.setAppliedImagesOfSelf(userForm.appliedImages, { redirect });
      }}
    >
      가입하기
    </Button>
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
      className={buttonRecipe({ variant: "primary" }, className)}
      onClick={() => {
        void fetch.activateUser(userId);
      }}
    >
      {l("user.signal.activateUser")}
    </button>
  );
};
