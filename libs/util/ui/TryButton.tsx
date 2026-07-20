"use client";
import { clsx } from "akanjs/client";
import { Button, Loading } from "akanjs/ui";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";

interface TryButtonProps {
  children: ReactNode;
  wrapperClassName?: string;
  className?: string;
  disabled?: boolean;
  completeOnSuccess?: boolean;
  footer?: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => Promise<void>;
}

export const TryButton = ({
  children,
  wrapperClassName,
  className = "btn-primary",
  disabled,
  completeOnSuccess,
  footer,
  onClick,
}: TryButtonProps) => {
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  return (
    <div className={clsx("flex flex-col gap-2", wrapperClassName)}>
      <Button
        className={clsx("w-full", className)}
        disabled={disabled || loading || completed}
        onClick={async (e) => {
          setErrorMessage("");
          setLoading(true);
          try {
            await onClick?.(e);
            if (completeOnSuccess) setCompleted(true);
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? (
          <Loading.Spin />
        ) : completed ? (
          <>
            <input type="checkbox" className="checkbox checkbox-success checkbox-sm" checked readOnly />
            {children}
          </>
        ) : (
          children
        )}
      </Button>
      {footer}
      {errorMessage ? <div className="text-error text-sm">{errorMessage}</div> : null}
    </div>
  );
};
