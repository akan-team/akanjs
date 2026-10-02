import { cn } from "akanjs/client";
import { Friend } from "./Friend";
import { StudioStar } from "./StudioStar";

const slots = [
  { name: "planet", slot: "[--slot:0deg]", phase: "[--orrery-phase:0s]" },
  { name: "rocket", slot: "[--slot:72deg]", phase: "[--orrery-phase:-9.6s]" },
  { name: "moon", slot: "[--slot:144deg]", phase: "[--orrery-phase:-19.2s]" },
  { name: "cloud", slot: "[--slot:216deg]", phase: "[--orrery-phase:-28.8s]" },
  { name: "comet", slot: "[--slot:288deg]", phase: "[--orrery-phase:-38.4s]" },
] as const;

interface OrbitProps {
  className?: string;
}
const Orbit = ({ className }: OrbitProps) => {
  return (
    <div className={cn("orrery-plane absolute inset-0", className)}>
      <div className="orbit-line absolute inset-0 border-2" />
      <div className="orrery-spin absolute inset-0">
        {slots.map((slot) => (
          <div className={cn("absolute inset-0 [rotate:var(--slot)]", slot.slot)} key={slot.name}>
            <div className="orrery-upright absolute top-0 left-1/2 size-0">
              <div className="orrery-depth size-0">
                <div className={cn("orrery-near size-0", slot.phase)}>
                  <div className="absolute -translate-x-1/2 -translate-y-[60%]">
                    <Friend className="size-[15cqw] max-w-none" name={slot.name} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface OrreryProps {
  className?: string;
}
export const Orrery = ({ className }: OrreryProps) => {
  return (
    <div aria-hidden="true" className={cn("@container relative aspect-square", className)}>
      <Orbit className="orrery-back" />
      <StudioStar className="absolute top-[20%] left-[29%] w-[42%]" />
      <Orbit className="orrery-front" />
    </div>
  );
};
