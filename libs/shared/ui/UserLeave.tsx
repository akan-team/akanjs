"use client";
import { cnst, msg, st, usePage } from "@libs/shared/client";
import { buttonRecipe } from "@libs/util/ui";
import { Int } from "akanjs/base";
import { cn } from "akanjs/client";
import { Input, Radio } from "akanjs/ui";
import { useEffect, useState } from "react";

interface LeaveInfoProps {
  className?: string;
  leaveReasons?: string[];
  comeBackReasons?: string[];
  onLeave: () => Promise<void>;
}
export const LeaveInfo = ({ className, leaveReasons, comeBackReasons, onLeave }: LeaveInfoProps) => {
  const leaveInfo = st.use.leaveInfo();
  useEffect(() => {
    st.do.setLeaveInfo(new cnst.LeaveInfo());
  }, []);
  st.tool("answerLeaveSurvey")
    .desc(
      "Answer the leaving survey — why you are going, how satisfied you were, and anything else. It does not close the account.",
    )
    .opt("type", cnst.LeaveType)
    .opt("reason", String)
    .opt("satisfaction", Int)
    .opt("voc", String)
    .exec((type, reason, satisfaction, voc) =>
      st.do.setLeaveInfo({
        ...leaveInfo,
        ...(type ? { type } : {}),
        ...(reason ? { reason } : {}),
        ...(satisfaction ? { satisfaction } : {}),
        ...(voc ? { voc } : {}),
      }),
    );
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
        onLeave={onLeave}
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
    <div className={cn("flex h-full flex-col items-center justify-center gap-4", className)}>
      <div className="mb-10 w-full text-xl">
        {l("leaveInfo.leaveChosen")}
        <br />
        <br />
        {l("leaveInfo.askComeback")}
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
        type="button"
        className={buttonRecipe({ variant: "primary" }, "w-full")}
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
export const Reason = ({ className, leaveReasons, comeBackReasons, value, onChange }: ReasonProps) => {
  const { l } = usePage();
  const leaveInfo = st.use.leaveInfo();
  const askText = leaveInfo.type === "comeback" ? l("leaveInfo.askComebackReason") : l("leaveInfo.askLeaveReason");
  const defaultComebackReasonKeys = [
    "leaveInfo.comebackReasonEditInfo",
    "leaveInfo.comebackReasonLater",
    "leaveInfo.reasonNone",
  ] as const;
  const defaultLeaveReasonKeys = [
    "leaveInfo.leaveReasonNoIntent",
    "leaveInfo.leaveReasonOtherService",
    "leaveInfo.leaveReasonAds",
    "leaveInfo.leaveReasonTemporary",
    "leaveInfo.reasonNone",
  ] as const;
  const reasons =
    leaveInfo.type === "comeback"
      ? (comeBackReasons ?? defaultComebackReasonKeys.map((key) => l(key)))
      : (leaveReasons ?? defaultLeaveReasonKeys.map((key) => l(key)));
  const [reason, setReason] = useState<string | null>(value);
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
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
        type="button"
        className={buttonRecipe({ variant: "primary" }, "w-full")}
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
  const [satisfaction, setSatisfaction] = useState<number | null>(value);

  const satisfactionKeys = [
    "leaveInfo.satisfactionVerySatisfied",
    "leaveInfo.satisfactionSatisfied",
    "leaveInfo.satisfactionNeutral",
    "leaveInfo.satisfactionUnsatisfied",
    "leaveInfo.satisfactionVeryUnsatisfied",
  ] as const;
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="mb-10 w-full text-xl">{l("leaveInfo.askSatisfaction")}</div>
      <Radio
        className="flex flex-col items-start justify-start gap-5 px-2"
        value={satisfaction}
        onChange={(satisfaction) => {
          if (typeof satisfaction !== "string") setSatisfaction(satisfaction);
        }}
      >
        {/* satisfaction is 1–5; a 0-based index would drop the first option */}
        {satisfactionKeys.map((key, idx) => (
          <Radio.Item className="pl-1 text-start" key={idx} value={idx + 1}>
            {l(key)}
          </Radio.Item>
        ))}
      </Radio>
      <button
        type="button"
        className={buttonRecipe({ variant: "primary" }, "w-full")}
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
  onLeave: () => Promise<void>;
}
export const Voc = ({ className, value, onChange, onLeave }: VocProps) => {
  const { l } = usePage();
  st.tool("leaveService", { confirm: l("leaveInfo.leaveConfirmPermanent") })
    .desc("Close this account for good and submit the leaving survey with it.")
    .exec(async () => {
      await onLeave();
      msg.success("user.leaveSuccess");
    });
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="mb-10 w-full text-xl">{l("leaveInfo.askVoc")}</div>
      <Input.TextArea
        autoFocus
        className="w-full"
        inputClassName="p-2 w-full rounded-md h-[300px] resize-none bg-background"
        value={value ?? ""}
        validate={(value) => true}
        placeholder={l("leaveInfo.vocPlaceholder")}
        onChange={(voc) => {
          onChange(voc);
        }}
      />
      <button
        type="button"
        className={buttonRecipe({ variant: "secondary" }, "w-full")}
        onClick={async () => {
          if (!window.confirm(l("leaveInfo.leaveConfirm"))) return;
          await onLeave();
          msg.success("user.leaveSuccess");
        }}
      >
        {l("leaveInfo.submitAndLeave")}
      </button>
    </div>
  );
};
