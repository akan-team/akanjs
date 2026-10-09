"use client";
import { PrimitiveRegistry } from "akanjs/base";
import { usePage } from "akanjs/client";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";
import type { SerializedEndpoint } from "akanjs/signal";
import { type ReactNode, useState } from "react";
import { AiOutlineFileWord } from "react-icons/ai";
import { BiSolidNetworkChart } from "react-icons/bi";
import { Collapse, dictText, docUi, Panel, Segmented } from "../Reference";
import Arg from "./Arg";
import { guardsOf } from "./endpointEntries";
import { ObjectDetail, ObjectType } from "./Object";
import { ResponseExample } from "./Response";
import { signalText } from "./signalText";
import { getGuardBadgeClassName, getWsBadgeClassName } from "./style";

interface ArgSectionProps {
  label: string;
  children: ReactNode;
}
export const ArgSection = ({ label, children }: ArgSectionProps) => (
  <div className="flex flex-col gap-2">
    <div className={docUi.sectionLabel}>{label}</div>
    {children}
  </div>
);

interface EndpointCollapseProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
  open?: boolean;
  badge: ReactNode;
  title: string;
  extraBadge?: ReactNode;
  children: ReactNode;
}
export const EndpointCollapse = ({
  refName,
  endpointKey,
  endpoint,
  open,
  badge,
  title,
  extraBadge,
  children,
}: EndpointCollapseProps) => {
  const { l } = usePage();
  const label = dictText(l, `${refName}.signal.${endpointKey}`);
  const desc = dictText(l, `${refName}.signal.${endpointKey}.desc`);
  return (
    <Collapse
      open={open}
      summary={
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            <span className="break-all font-medium font-mono text-sm">{title}</span>
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              {guardsOf(endpoint).map((guard) => (
                <span className={getGuardBadgeClassName(guard)} key={guard}>
                  {guard}
                </span>
              ))}
              {extraBadge}
            </span>
          </div>
          {label ? <div className="text-foreground/55 text-sm">{label}</div> : null}
        </div>
      }
    >
      {desc ? <p className={docUi.prose}>{desc}</p> : null}
      {children}
    </Collapse>
  );
};

interface EndpointInterfaceProps {
  className?: string;
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
  argSections: { label: string; args: SerializedEndpoint["args"] }[];
  returnsLabel: string;
}
export const EndpointInterface = ({
  className = "flex flex-col gap-4",
  refName,
  endpointKey,
  endpoint,
  argSections,
  returnsLabel,
}: EndpointInterfaceProps) => {
  const returnRef = ConstantRegistry.getModelRef(endpoint.returns.refName, endpoint.returns.modelType);
  return (
    <div className={className}>
      {argSections
        .filter((section) => section.args.length)
        .map((section) => (
          <ArgSection key={section.label} label={section.label}>
            <div className={docUi.tablePanel}>
              <Arg.Table refName={refName} endpointKey={endpointKey} args={section.args} />
            </div>
          </ArgSection>
        ))}
      <div className="grid gap-3 md:grid-cols-2 md:items-start">
        <Panel bodyClassName="max-h-none" label={returnsLabel}>
          <div className="flex flex-col items-start gap-3">
            <ObjectType objRef={returnRef} arrDepth={endpoint.returns.arrDepth ?? 0} />
            {PrimitiveRegistry.has(returnRef) ? null : (
              <ObjectDetail className="w-full border-0 bg-transparent" objRef={returnRef as ConstantCls} />
            )}
          </div>
        </Panel>
        <ResponseExample endpoint={endpoint} />
      </div>
    </div>
  );
};

export interface WsEndpointProps {
  refName: string;
  endpointKey: string;
  endpoint: SerializedEndpoint;
  open?: boolean;
}
export const WsEndpoint = ({ doc, test, ...props }: WsEndpointProps & { doc: ReactNode; test: ReactNode }) => {
  const { l } = usePage();
  const [viewStatus, setViewStatus] = useState<"doc" | "test">("doc");
  const wsViewItems = [
    { key: "doc", label: l.trans(signalText.reference), icon: <AiOutlineFileWord /> },
    { key: "test", label: l.trans(signalText.tryIt), icon: <BiSolidNetworkChart /> },
  ] as const;
  return (
    <EndpointCollapse
      {...props}
      badge={<span className={getWsBadgeClassName(props.endpoint.type)}>{props.endpoint.type}</span>}
      title={props.endpointKey}
    >
      <Segmented items={wsViewItems} onChange={setViewStatus} value={viewStatus} />
      {viewStatus === "doc" ? doc : test}
    </EndpointCollapse>
  );
};

export type Messages = string | boolean | object[] | null;

export const appendMessage = (prev: Messages, data: unknown): Messages =>
  typeof data === "boolean"
    ? data
    : typeof data === "string"
      ? `${prev as string}\n${data}`
      : typeof data === "object"
        ? [...((prev as object[] | null)?.length ? [...(prev as object[])] : []), data as object]
        : (data as string);
