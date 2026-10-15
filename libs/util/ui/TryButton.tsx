"use client";
import { usePage } from "@libs/util/client";
import { cn } from "akanjs/client";
import { Button, type ButtonVariants, Loading } from "akanjs/ui";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { AiFillCheckSquare } from "react-icons/ai";

interface TryButtonProps extends ButtonVariants {
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
  className,
  variant = "primary",
  size,
  disabled,
  completeOnSuccess,
  footer,
  onClick,
}: TryButtonProps) => {
  const { l } = usePage();
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  return (
    <div className={cn("flex flex-col gap-2", wrapperClassName)}>
      <Button
        variant={variant}
        size={size}
        className={cn("w-full", className)}
        disabled={disabled || loading || completed}
        onClick={async (e) => {
          setErrorMessage("");
          setLoading(true);
          try {
            await onClick?.(e);
            if (completeOnSuccess) setCompleted(true);
          } catch (error) {
            //? An akan Err carries its dictionary key in `error`; its `message` is that untranslated key.
            const { error: key, data } = error as { error?: unknown; data?: { [key: string]: string | number } };
            setErrorMessage(
              typeof key === "string" ? l._(key, data) : error instanceof Error ? error.message : String(error),
            );
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? (
          <Loading.Spin />
        ) : completed ? (
          <>
            <AiFillCheckSquare className="text-success" />
            {children}
          </>
        ) : (
          children
        )}
      </Button>
      {footer}
      {errorMessage ? <div className="text-destructive text-sm">{errorMessage}</div> : null}
    </div>
  );
};
