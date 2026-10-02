import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import { Friend, type FriendProps } from "./Friend";

const castOrder = ["planet", "rocket", "moon", "cloud", "comet"] as const;

const floatClass: { [key in FriendProps["name"]]: string } = {
  planet: "[--float-delay:-0.4s] [--float-duration:6.2s]",
  rocket: "[--float-delay:-2.2s] [--float-duration:5.2s] [--float-tilt:7deg]",
  moon: "[--float-delay:-3.6s] [--float-duration:7s] [--float-tilt:-5deg]",
  cloud: "[--float-delay:-1.4s] [--float-duration:8s] [--float-rise:0.6rem]",
  comet: "[--float-delay:-4.8s] [--float-duration:4.6s] [--float-tilt:9deg]",
} as const;

interface JellyCastProps {
  className?: string;
  friendClassName?: string;
  showRole?: boolean;
}
export const JellyCast = ({ className, friendClassName, showRole = true }: JellyCastProps) => {
  const { l } = usePage();
  const roles: { [key in FriendProps["name"]]: string } = {
    planet: l.trans({ en: "Web", ko: "웹" }),
    rocket: l.trans({ en: "App", ko: "앱" }),
    moon: l.trans({ en: "Server · DB", ko: "서버 · DB" }),
    cloud: l.trans({ en: "Infra", ko: "인프라" }),
    comet: l.trans({ en: "Agent", ko: "에이전트" }),
  };
  return (
    <ul className={cn("flex items-end gap-2 sm:gap-4", className)}>
      {castOrder.map((name) => (
        <li className="group flex flex-col items-center gap-2" key={name}>
          <span className={cn("jelly-float block", floatClass[name])}>
            <span className="group-hover:jelly-wobble block">
              <Friend className={friendClassName} name={name} />
            </span>
          </span>
          {showRole ? (
            <span className="whitespace-nowrap rounded-full bg-foreground/6 px-2.5 py-0.5 font-bold text-[11px] text-foreground/60">
              {roles[name]}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
};
