import { clsx } from "@akanjs/client";

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
            "bg-gray-300": conn === "disconnected",
            [disconnectedClassName ?? ""]: conn === "disconnected",
          },
          className
        )}
      />
      {conn !== "disconnected" ? (
        <span
          className={clsx("loading loading-ring loading-xs absolute", {
            "text-success": conn === "healthy",
            "text-warning": conn === "unhealthy",
          })}
        />
      ) : null}
    </div>
  );
};
