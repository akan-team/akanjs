import { clsx, cn } from "akanjs/client";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

interface ConnectStatusProps {
  className?: string;
  connection: boolean | "healthy" | "unhealthy" | "disconnected" | undefined | null;
  connectedClassName?: string;
  unhealthyClassName?: string;
  disconnectedClassName?: string;
  tooltip?: string;
}
export const ConnectStatus = ({
  className,
  connection,
  tooltip,
  connectedClassName,
  unhealthyClassName,
  disconnectedClassName,
}: ConnectStatusProps) => {
  const conn = connection === true ? "healthy" : connection === false ? "disconnected" : (connection ?? "disconnected");
  return (
    <div className="relative grid place-items-center">
      <div
        data-tip={tooltip}
        className={clsx(
          `size-1.5 rounded-full`,
          {
            tooltip: !!tooltip,
            "bg-success": conn === "healthy",
            [connectedClassName ?? ""]: conn === "healthy",
            "bg-warning": conn === "unhealthy",
            [unhealthyClassName ?? ""]: conn === "unhealthy",
            "bg-muted": conn === "disconnected",
            [disconnectedClassName ?? ""]: conn === "disconnected",
          },
          className,
        )}
      />
      {conn !== "disconnected" ? (
        <AiOutlineLoading3Quarters
          className={cn("absolute size-3 animate-spin", {
            "text-success": conn === "healthy",
            "text-warning": conn === "unhealthy",
          })}
        />
      ) : null}
    </div>
  );
};
