"use client";
import { clsx } from "@akanjs/client";
import type { ProtoFile } from "@akanjs/constant";
import { Button, Image, Input, Layout, Radio } from "@akanjs/ui";
import { cnst, msg, st, usePage } from "@shared/client";
import { Field, Only } from "@shared/ui";
import { formatPhone, isEmail, isPhoneNumber } from "@util/common";
import { CodeInput, Inform, Upload } from "@util/ui";
import { useEffect, useRef, useState } from "react";
import { AiOutlineClose, AiOutlineEdit, AiOutlinePlus, AiOutlineSave } from "react-icons/ai";

interface UserEditProps {
  className?: string;
}

export const General = ({ className }: UserEditProps) => {
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
      className={clsx("btn bg-primary-light border-primary-light", className)}
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
      className={clsx("btn bg-primary-light border-primary-light", className)}
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
                  "aspect-1 flex w-full items-center justify-center rounded-2xl bg-gray-200 duration-300 hover:opacity-50",
                  { "border-primary border-4": i === 0 }
                )}
              >
                <AiOutlinePlus className="text-primary text-6xl font-bold opacity-60" />
                {i === 0 && (
                  <div className="bg-primary absolute top-2 left-2 rounded-md px-1 text-xs text-white">대표 사진</div>
                )}
              </div>
            )}
            renderComplete={(file) => (
              <div
                className={clsx("aspect-1 w-full overflow-hidden rounded-2xl", {
                  "border-primary border-4": i === 0,
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
              <div className="aspect-1 text-primary flex w-full items-center justify-center rounded-xl bg-gray-200 duration-300 hover:opacity-50">
                <AiOutlinePlus className="text-2xl font-bold opacity-60" />
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
      className="bg-primary-light border-primary-light"
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

interface AgreePoliciesProps {
  className?: string;
  companyName: string;
  serviceName: string;
  startDateStr?: string;
  policy?: {
    company: {
      ceo: string;
      address: string;
      phone: string;
    };
    customerService: {
      department: string;
      email: string;
    };
    privacyManager: {
      name: string;
      phone: string;
      email: string;
    };
    privacyAuthority: {
      name: string;
      phone: string;
      email: string;
    };
    locationAuthority: {
      name: string;
      email: string;
    };
  };
}
export const AgreePolicies = ({ className, companyName, serviceName, startDateStr, policy }: AgreePoliciesProps) => {
  const agreePolicies = st.use.agreePolicies();
  return (
    <Inform.AccordionPolicy
      value={agreePolicies}
      onChange={(value) => {
        st.do.setAgreePolicies(value);
      }}
      companyName={companyName}
      serviceName={serviceName}
      startDateStr={startDateStr}
      policy={policy}
    />
  );
};

interface LeaveInfoProps {
  className?: string;
  redirect?: string;
  leaveReasons?: string[];
  comeBackReasons?: string[];
}
export const LeaveInfo = ({ className, redirect, leaveReasons, comeBackReasons }: LeaveInfoProps) => {
  const leaveInfo = st.use.leaveInfo();
  useEffect(() => {
    st.do.setLeaveInfo(cnst.leaveInfo.getDefault());
  }, []);
  if (leaveInfo.type === "noReply")
    return (
      <LeaveType
        className={className}
        value={leaveInfo.type}
        onChange={(type) => {
          st.do.setLeaveInfo({ ...leaveInfo, type });
        }}
      />
    );
  else if (leaveInfo.reason === null)
    return (
      <Reason
        className={className}
        leaveReasons={leaveReasons}
        comeBackReasons={comeBackReasons}
        value={leaveInfo.reason}
        onChange={(reason) => {
          st.do.setLeaveInfo({ ...leaveInfo, reason });
        }}
      />
    );
  else if (leaveInfo.satisfaction === null)
    return (
      <Satisfaction
        className={className}
        value={leaveInfo.satisfaction}
        onChange={(satisfaction) => {
          st.do.setLeaveInfo({ ...leaveInfo, satisfaction });
        }}
      />
    );
  else
    return (
      <Voc
        className={className}
        value={leaveInfo.voc}
        onChange={(voc) => {
          st.do.setLeaveInfo({ ...leaveInfo, voc });
        }}
        redirect={redirect}
      />
    );
};

interface LeaveTypeProps {
  className?: string;
  value: cnst.LeaveType["value"];
  onChange: (value: cnst.LeaveType["value"]) => void;
}

export const LeaveType = ({ className, value, onChange }: LeaveTypeProps) => {
  const { l } = usePage();
  const [type, setType] = useState<cnst.LeaveType["value"]>(value);
  return (
    <div className={clsx("flex h-full flex-col items-center justify-center gap-4", className)}>
      <div className="mb-10 w-full text-xl">
        탈퇴를 선택하셨습니다.
        <br />
        <br />
        탈퇴 후 재가입 의향이 있으신가요?
      </div>
      <Radio
        className="flex flex-col items-start justify-start gap-5 px-2"
        value={type}
        onChange={(value) => {
          setType(value as cnst.LeaveType["value"]);
        }}
      >
        {cnst.LeaveType.filter((type) => type !== "noReply").map((leaveType, idx) => (
          <Radio.Item className="pl-1 text-start" key={idx} value={leaveType}>
            {l(`leaveType.${leaveType}`)}
          </Radio.Item>
        ))}
      </Radio>
      <button
        className="btn btn-primary w-full"
        onClick={() => {
          onChange(type);
        }}
      >
        {l("util.next")}
      </button>
    </div>
  );
};

interface ReasonProps {
  className?: string;
  leaveReasons?: string[];
  comeBackReasons?: string[];
  value: string | null;
  onChange: (value: string) => void;
}

export const Reason = ({
  className,
  leaveReasons = [
    "사용해보니 서비스를 사용할 의사가 없어서",
    "동일한 다른 서비스 앱을 사용하기 위해서",
    "광고(푸시, 알림)이 번거로워서",
    "이벤트, 호기심 등으로 일시적으로 가입했기 때문에",
    "보기에 없음",
  ],
  comeBackReasons = ["가입정보를 수정하기 위해서", "시간이 지나고 다시 사용하기 위해서", "보기에 없음"],
  value,
  onChange,
}: ReasonProps) => {
  const { l } = usePage();
  const leaveInfo = st.use.leaveInfo();
  const askText =
    leaveInfo.type === "comeback" ? "재가입 의향이 있으신 이유는 무엇인가요?" : "탈퇴의 가장 큰 이유는 무엇인가요?";
  const reasons = leaveInfo.type === "comeback" ? comeBackReasons : leaveReasons;
  const [reason, setReason] = useState<string | null>(value);
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-4", className)}>
      <div className="mb-10 w-full text-xl">{askText}</div>
      <Radio
        className="flex flex-col items-start justify-start gap-5 px-2"
        value={reason}
        onChange={(reason: string) => {
          setReason(reason);
        }}
      >
        {reasons.map((reason, idx) => (
          <Radio.Item className="pl-1 text-start" key={idx} value={reason}>
            {reason}
          </Radio.Item>
        ))}
      </Radio>
      <button
        className="btn btn-primary w-full"
        disabled={!reason}
        onClick={() => {
          if (reason) onChange(reason);
        }}
      >
        {l("util.next")}
      </button>
    </div>
  );
};

interface SatisfactionProps {
  className?: string;
  value: number | null;
  onChange: (value: number) => void;
}
export const Satisfaction = ({ className, value, onChange }: SatisfactionProps) => {
  const { l } = usePage();
  const satisfyLevel = ["매우 만족", "만족", "보통", "불만족", "매우 불만족"];
  const [satisfaction, setSatisfaction] = useState<number | null>(value);
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-4", className)}>
      <div className="mb-10 w-full text-xl">서비스에 대해 얼마나 만족하셨나요?</div>
      <Radio
        className="flex flex-col items-start justify-start gap-5 px-2"
        value={satisfaction}
        onChange={(satisfaction: number) => {
          setSatisfaction(satisfaction);
        }}
      >
        {satisfyLevel.map((answer, idx) => (
          <Radio.Item className="pl-1 text-start" key={idx} value={idx}>
            {answer}
          </Radio.Item>
        ))}
      </Radio>
      <button
        className="btn btn-primary w-full"
        disabled={satisfaction === null}
        onClick={() => {
          if (satisfaction !== null) onChange(satisfaction);
        }}
      >
        {l("util.next")}
      </button>
    </div>
  );
};

interface VocProps {
  className?: string;
  value: string | null;
  onChange: (value: string) => void;
  redirect?: string;
}
export const Voc = ({ className, value, onChange, redirect }: VocProps) => {
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-4", className)}>
      <div className="mb-10 w-full text-xl">운영진에 바라는 개선사항을 알려주세요.</div>
      <Input.TextArea
        autoFocus
        className="w-full"
        inputClassName="p-2 w-full rounded-md h-[300px] resize-none bg-base-100"
        value={value ?? ""}
        validate={(value) => true}
        placeholder="기타 의견을 남겨주세요."
        onChange={(voc) => {
          onChange(voc);
        }}
      />
      <button
        className="btn btn-secondary w-full"
        onClick={async () => {
          await st.do.setLeaveInfoOfSelf();
          if (!window.confirm("탈퇴하시겠습니까?")) return;
          await st.do.removeSelf({ redirect });
          msg.success("user.leaveSuccess");
        }}
      >
        제출후 탈퇴하기
      </button>
    </div>
  );
};
