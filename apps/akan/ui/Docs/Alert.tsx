import { clsx } from "akanjs/client";
import { BiCheckCircle, BiErrorCircle, BiInfoCircle, BiStopCircle } from "react-icons/bi";

interface AlertProps {
  children: React.ReactNode;
  type?: "info" | "warning" | "error" | "success";
  className?: string;
  bodyClassName?: string;
}

export const Alert = ({ children, type = "info", className, bodyClassName }: AlertProps) => (
  <div
    role="alert"
    className={clsx(
      "alert alert-dash",
      {
        "bg-info/30": type === "info",
        "bg-warning/30": type === "warning",
        "bg-error/30": type === "error",
        "bg-success/30": type === "success",
      },
      className,
    )}
  >
    <div className="h-full">
      {type === "info" ? (
        <BiInfoCircle className="text-xl" />
      ) : type === "warning" ? (
        <BiStopCircle className="text-xl" />
      ) : type === "error" ? (
        <BiErrorCircle className="text-xl" />
      ) : type === "success" ? (
        <BiCheckCircle className="text-xl" />
      ) : null}
    </div>
    <div className={bodyClassName}>{children}</div>
  </div>
);
