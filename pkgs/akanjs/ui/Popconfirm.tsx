"use client";
import { useSpring } from "@react-spring/web";
// TODO: 디자인 수정, 테마 적용 안됨
import { clsx, usePage } from "akanjs/client";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useState } from "react";
import { BiMessageRoundedError } from "react-icons/bi";

import { animated } from "./animated";
import { createOverridable } from "./UiOverride";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export interface PopconfirmProps {
  /** Confirmation title. */
  title: string;
  /** Optional detailed confirmation message. */
  description?: ReactNode;
  /** Called when the user confirms. */
  onConfirm?: () => void;
  /** Props forwarded to the OK button. */
  okButtonProps?: ButtonProps;
  /** Props forwarded to the cancel button. */
  cancelButtonProps?: ButtonProps;
  /** Custom OK button text. */
  okText?: string;
  /** Custom cancel button text. */
  cancelText?: string;
  /** Trigger content. */
  children?: ReactNode;
  /** Additional classes for the trigger wrapper. */
  triggerClassName?: string;
  /** Additional classes for the popover arrow/decorator. */
  decoClassName?: string;
}

export const DefaultPopconfirm = ({
  title,
  description,
  onConfirm,
  okButtonProps,
  cancelButtonProps,
  okText,
  cancelText,
  children,
  triggerClassName,
  decoClassName,
}: PopconfirmProps) => {
  const { l } = usePage();
  const [isConfirming, setIsConfirming] = useState(false);

  const popconfirmProps = useSpring({
    opacity: isConfirming ? 1 : 0,
    from: {
      opacity: 0,
    },
  });

  // popconfirm 위치 조정 (x 좌표가 음수인 경우)
  useEffect(() => {
    const popconfirm = document.querySelector(".popconfirm");
    const popconfirmRect = popconfirm?.getBoundingClientRect();
    const popconfirmDeco = document.querySelector(".popconfirm-deco");

    // popconfirmRect.x 가 좌측 화면 밖으로 나가는 경우
    if (popconfirmRect && popconfirmRect.x < 0) {
      popconfirm?.classList.add("left-0", "right-auto");
      popconfirmDeco?.classList.add("left-10", "left-auto");
    }
    // popconfirmRect.x 가 우측 화면 밖으로 나가는 경우
    if (popconfirmRect && popconfirmRect.x + popconfirmRect.width > window.innerWidth) {
      popconfirm?.classList.add("left-auto", "right-0");
    }
  }, [isConfirming]);

  const handleConfirm = () => {
    setIsConfirming(false);
    onConfirm?.();
  };

  const handleCancel = () => {
    setIsConfirming(false);
  };

  return (
    <>
      <div className="relative inline-block">
        <div
          className={clsx("trigger", triggerClassName)}
          onClick={(e) => {
            e.stopPropagation();
            setIsConfirming(true);
          }}
        >
          {children}
        </div>
        {isConfirming && (
          <animated.div
            className="popconfirm absolute -right-2 bottom-0 z-10 translate-y-[106%] rounded-lg border border-base-300 bg-base-100 p-4 shadow-xl"
            style={popconfirmProps}
          >
            <div
              className={clsx(
                "popconfirm-deco absolute -top-2 size-4 rotate-45 rounded-sm border-base-300 border-t border-l bg-base-100",
                { "right-10": !decoClassName },
                decoClassName,
              )}
            ></div>
            <div className="flex gap-1">
              <BiMessageRoundedError className="text-orange-500" />
              <div>
                <p className="mb-2 whitespace-nowrap font-bold">{title}</p>
                <div className="mb-2 whitespace-nowrap">{description}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn btn-xs btn-outline" onClick={handleCancel} {...cancelButtonProps}>
                {cancelText ?? l("base.cancel")}
              </button>
              <button className="btn btn-xs" onClick={handleConfirm} {...okButtonProps}>
                {okText ?? l("base.ok")}
              </button>
            </div>
          </animated.div>
        )}
      </div>
      {isConfirming && (
        <div
          className="absolute top-0 left-0 h-screen w-full"
          onClick={() => {
            setIsConfirming(false);
          }}
        ></div>
      )}
    </>
  );
};

/**
 * Confirmation popover. Resolves to a route-scoped override when a
 * `page/**\/_overrides.tsx` in the route's ancestry declares one, otherwise
 * renders {@link DefaultPopconfirm}.
 */
export const Popconfirm = createOverridable("Popconfirm", DefaultPopconfirm);
