import type { cnst } from "@libs/shared/client";
import { usePage } from "@libs/shared/client";
import { cn } from "akanjs/client";
import { RecentTime } from "akanjs/ui";

interface GeneralProps {
  className?: string;
  notification: cnst.Notification;
}

export const General = ({ className, notification }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={cn(className, ``)}>
      <div className="mt-4 mb-0 flex justify-between border-border border-b p-2 text-2xl">
        <h3>
          {l("notification.id")}-{notification.id}
        </h3>
      </div>
      <div className="mt-0 flex justify-between bg-muted p-4 text-xs md:text-base">
        <RecentTime date={notification.createdAt} breakUnit="second" />
      </div>
    </div>
  );
};
