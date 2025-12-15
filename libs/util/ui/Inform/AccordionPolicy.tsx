"use client";
import { clsx } from "@akanjs/client";
import * as Accordion from "@radix-ui/react-accordion";
import { BiCheck, BiChevronDown } from "react-icons/bi";

import { LocationPolicy } from "./LocationPolicy";
import { MarketingPolicy } from "./MarketingPolicy";
import { PrivacyPolicy } from "./PrivacyPolicy";
import { ServicePolicy } from "./ServicePolicy";

interface AccordionPolicyProps {
  value: string[];
  onChange: (agreePolicies: string[]) => void;
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
export const AccordionPolicy = ({
  value,
  onChange,
  companyName,
  serviceName,
  startDateStr,
  policy,
}: AccordionPolicyProps) => {
  const addOrSubAgreePoliciesOnUser = (policy: string) => {
    if (value.includes(policy)) onChange(value.filter((policy) => policy !== policy));
    else onChange([...value, policy]);
  };
  return (
    <div>
      <Accordion.Root className="border-base-300 w-full overflow-hidden rounded-xl border-2" collapsible type="single">
        <AccordionItem
          title="이용약관"
          required
          checked={value.includes("termsofservice")}
          onCheck={() => {
            addOrSubAgreePoliciesOnUser("termsofservice");
          }}
        >
          <ServicePolicy companyName={companyName} serviceName={serviceName} startDateStr={startDateStr} />
        </AccordionItem>
        <AccordionItem
          title="개인정보 처리방침"
          required
          checked={value.includes("privacy")}
          onCheck={() => {
            addOrSubAgreePoliciesOnUser("privacy");
          }}
        >
          <PrivacyPolicy companyName={companyName} policy={policy} startDateStr={startDateStr} />
        </AccordionItem>
        <AccordionItem
          title="위치정보 이용약관"
          required
          checked={value.includes("location")}
          onCheck={() => {
            addOrSubAgreePoliciesOnUser("location");
          }}
        >
          <LocationPolicy companyName={companyName} policy={policy} serviceName={serviceName} />
        </AccordionItem>
        <AccordionItem
          title="마케팅 수신 정보 이용 동의"
          checked={value.includes("marketing")}
          onCheck={() => {
            addOrSubAgreePoliciesOnUser("marketing");
          }}
        >
          <MarketingPolicy companyName={companyName} serviceName={serviceName} />
        </AccordionItem>
      </Accordion.Root>
      <div className="mt-4 flex items-center justify-center gap-2 text-sm">
        <input
          id="agreeAll"
          type="checkbox"
          className="checkbox checkbox-primary"
          checked={value.length === 4}
          onChange={(e) => {
            if (e.target.checked) {
              onChange(["termsofservice", "privacy", "location", "marketing"]);
            } else {
              onChange([]);
            }
          }}
        />
        <label htmlFor="agreeAll">모든 약관에 동의합니다.</label>
      </div>
    </div>
  );
};

const AccordionItem = ({
  title,
  required,
  checked,
  onCheck,
  children,
}: {
  title: string;
  required?: boolean;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  children?: React.ReactNode;
}) => {
  return (
    <Accordion.Item
      className="border-base-300 border-b first:rounded-t last:rounded-b last-of-type:border-none"
      value={title}
    >
      <div className="relative flex w-full items-center justify-between gap-2">
        <Accordion.Trigger className="group flex w-full items-center justify-between p-5 text-left">
          <div>
            {title}
            {required && <span className="text-primary text-sm"> (필수)</span>}
          </div>
          <BiChevronDown className="text-2xl transition-transform duration-300 ease-[cubic-bezier(0.87,_0,_0.13,_1)] group-data-[state=open]:rotate-180" />
        </Accordion.Trigger>
        <button
          onClick={() => {
            onCheck(!open);
          }}
          className={clsx(
            "btn btn-sm btn-circle btn-outline mr-2 flex items-center justify-center text-3xl duration-300",
            { "bg-primary text-white": checked, "text-gray-300": !checked }
          )}
        >
          <BiCheck />
        </button>
      </div>
      <Accordion.Content className="data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp bg-base-200 h-52 overflow-y-auto px-5 text-[15px] leading-7">
        <div className="py-5">{children}</div>
      </Accordion.Content>
    </Accordion.Item>
  );
};
