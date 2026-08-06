import { cn } from "akanjs/client";
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
        className={cn(
          `size-1.5 rounded-full`,
          !!tooltip && "tooltip",
          conn === "healthy" && "bg-success",
          conn === "healthy" && (connectedClassName ?? ""),
          conn === "unhealthy" && "bg-warning",
          conn === "unhealthy" && (unhealthyClassName ?? ""),
          conn === "disconnected" && "bg-muted",
          conn === "disconnected" && (disconnectedClassName ?? ""),
          className,
        )}
      />
      {conn !== "disconnected" ? (
        <AiOutlineLoading3Quarters
          className={cn(
            "absolute size-3 animate-spin",
            conn === "healthy" && "text-success",
            conn === "unhealthy" && "text-warning",
          )}
        />
      ) : null}
    </div>
  );
};
