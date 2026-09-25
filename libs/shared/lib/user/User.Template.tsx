"use client";
import { st, usePage } from "@libs/shared/client";
import { Field, Only } from "@libs/shared/ui";
import { CodeInput, Upload } from "@libs/util/ui";
import { clsx } from "akanjs/client";
import { formatPhone, isEmail, isPhoneNumber } from "akanjs/common";
import type { ProtoFile } from "akanjs/constant";
import { Button, Image, Input, Layout } from "akanjs/ui";
import { useEffect, useRef, useState } from "react";
import { AiOutlineClose, AiOutlineEdit, AiOutlinePlus, AiOutlineSave } from "react-icons/ai";

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
          <SetAccountIdByAdmin accountId={user.accountId} />
          <SetPasswordByAdmin />
          <SetPhoneByAdmin phone={user.phone} />
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
      onChange={(value) => {
        st.do.setPhone(formatPhone(value));
      }}
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
      className={clsx("btn btn-primary", className)}
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
    <div className={clsx("w-full pb-4", className)}>
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
      className={clsx("btn btn-primary", className)}
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
      onChange={(value) => {
        st.do.setAccountId(value);
      }}
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
      className="btn btn-primary"
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
      className={"btn btn-primary"}
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
    <div className={clsx("flex w-full flex-col gap-2", className)}>
      <Field.Password
        label={l("user.password")}
        desc={l("user.password.desc")}
        value={password}
        onChange={(password) => {
          st.do.setPassword(password);
        }}
        showConfirm
        confirmValue={passwordConfirm}
        onChangeConfirm={(passwordConfirm) => {
          st.do.setPasswordConfirm(passwordConfirm);
        }}
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
      className={"btn btn-primary"}
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
      className={"btn btn-primary"}
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
      className={clsx("btn border-primary-light bg-primary-light", className)}
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
      className={clsx("btn border-primary-light bg-primary-light", className)}
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
  const onRemove = (index: number) => {
    if (!window.confirm("사진을 삭제하시겠습니까?")) return;
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
                className={clsx(
                  "flex aspect-1 w-full items-center justify-center rounded-2xl bg-gray-200 duration-300 hover:opacity-50",
                  { "border-4 border-primary": i === 0 },
                )}
              >
                <AiOutlinePlus className="font-bold text-6xl text-primary opacity-60" />
                {i === 0 && (
                  <div className="absolute top-2 left-2 rounded-md bg-primary px-1 text-white text-xs">대표 사진</div>
                )}
              </div>
            )}
            renderComplete={(file) => (
              <div
                className={clsx("aspect-1 w-full overflow-hidden rounded-2xl", {
                  "border-4 border-primary": i === 0,
                })}
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
              <div className="flex aspect-1 w-full items-center justify-center rounded-xl bg-gray-200 text-primary duration-300 hover:opacity-50">
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
      {/* <BottomSheet onCancel={() => {}} open={false}>
        <CropImage src={""} download ref={cropRef} />
        <div className="relative  flex w-full items-center justify-center gap-2">
          <button onClick={() => {}} className="btn flex-1 rounded-2xl btn-primary">
            저장
          </button>
        </div>
      </BottomSheet> */}
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

interface SetAccountIdByAdminProps {
  className?: string;
  accountId: string | null;
}
export const SetAccountIdByAdmin = ({ className, accountId }: SetAccountIdByAdminProps) => {
  const [changeId, setChangeId] = useState(accountId ?? "empty");
  const [editState, setEditState] = useState<"edit" | "saving" | null>(null);
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <label className="w-24">AccountId: </label>
      <input
        className="input"
        value={changeId}
        onChange={(e) => {
          setChangeId(e.target.value);
        }}
        disabled={!editState}
      />
      {editState ? (
        <>
          <button
            className="btn btn-primary"
            disabled={
              editState === "saving" ||
              changeId === accountId ||
              changeId.length < 4 ||
              (isEmail(accountId) && !isEmail(changeId))
            }
            onClick={async () => {
              setEditState("saving");
              await st.do.setAccountIdByAdmin(changeId);
              setEditState(null);
            }}
          >
            <AiOutlineSave />
          </button>
          <button
            className="btn btn-outline"
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
          className="btn"
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
export const SetPasswordByAdmin = ({ className }: SetPasswordByAdminProps) => {
  const [password, setPassword] = useState("********");
  const [editState, setEditState] = useState<"edit" | "saving" | null>(null);
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <label className="w-24">Password: </label>
      <input
        className="input"
        type="password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
        disabled={!editState}
      />
      {editState ? (
        <>
          <button
            className="btn btn-primary"
            disabled={editState === "saving" || password.length < 8 || password.length > 20}
            onClick={async () => {
              setEditState("saving");
              await st.do.setPasswordByAdmin(password);
              setEditState(null);
            }}
          >
            <AiOutlineSave />
          </button>
          <button
            className="btn btn-outline"
            disabled={editState === "saving"}
            onClick={() => {
              setPassword("********");
              setEditState(null);
            }}
          >
            <AiOutlineClose />
          </button>
        </>
      ) : (
        <button
          className="btn"
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
  const [changePhone, setChangePhone] = useState(phone ?? "empty");
  const [editState, setEditState] = useState<"edit" | "saving" | null>(null);
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <label className="w-24">Phone: </label>
      <input
        className="input"
        value={changePhone}
        onChange={(e) => {
          setChangePhone(formatPhone(e.target.value));
        }}
        disabled={!editState}
      />
      {editState ? (
        <>
          <button
            className="btn btn-primary"
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
            className="btn btn-outline"
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
          className="btn"
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
