"use client";
//! 디자인 수정, 테마 적용 안됨
import { clsx, usePage } from "@akanjs/client";
import { useSpring } from "@react-spring/web";
import React, { ButtonHTMLAttributes, ReactNode, useEffect, useState } from "react";
import { BiMessageRoundedError } from "react-icons/bi";

import { animated } from "./animated";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

interface PopconfirmProps {
  title: string;
  description?: ReactNode;
  onConfirm?: () => void;
  okButtonProps?: ButtonProps;
  cancelButtonProps?: ButtonProps;
  okText?: string;
  cancelText?: string;
  children?: ReactNode;
  triggerClassName?: string;
  decoClassName?: string;
}

export const Popconfirm = ({
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
            className="popconfirm border-base-300 bg-base-100 absolute -right-2 bottom-0 z-10 translate-y-[106%] rounded-lg border p-4 shadow-xl"
            style={popconfirmProps}
          >
            <div
              className={clsx(
                "bg-base-100 border-base-300 popconfirm-deco absolute -top-2 size-4 rotate-45 rounded-sm border-t border-l",
                { "right-10": !decoClassName },
                decoClassName
              )}
            ></div>
            <div className="flex gap-1">
              <BiMessageRoundedError className="text-orange-500" />
              <div>
                <p className="mb-2 font-bold whitespace-nowrap">{title}</p>
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
