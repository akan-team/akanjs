"use client";
import { cnst, msg, st, usePage } from "@libs/shared/client";
import { clsx } from "akanjs/client";
import { Input, Radio } from "akanjs/ui";
import { useEffect, useState } from "react";

interface LeaveInfoProps {
  className?: string;
  redirect?: string;
  leaveReasons?: string[];
  comeBackReasons?: string[];
}
export const LeaveInfo = ({ className, redirect, leaveReasons, comeBackReasons }: LeaveInfoProps) => {
  const leaveInfo = st.use.leaveInfo();
  useEffect(() => {
    st.do.setLeaveInfo(new cnst.LeaveInfo());
  }, []);
  if (leaveInfo.type === "noReply")
    return (
      <LeaveTypeStep
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

interface LeaveTypeStepProps {
  className?: string;
  value: cnst.LeaveType["value"];
  onChange: (value: cnst.LeaveType["value"]) => void;
}

export const LeaveTypeStep = ({ className, value, onChange }: LeaveTypeStepProps) => {
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
        onChange={(reason) => {
          if (reason) setReason(String(reason));
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
        onChange={(satisfaction) => {
          if (typeof satisfaction !== "string") setSatisfaction(satisfaction);
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
