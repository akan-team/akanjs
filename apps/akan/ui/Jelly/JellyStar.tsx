import { cn } from "akanjs/client";
import { useId } from "react";
import { preload } from "react-dom";
import { JellyStarPath } from "./jellyStar.util";

const markSrc = "/jelly/star-mark.webp";
const gummy = { outer: 88.5, inner: 57, sharpness: 1.1 } as const;
const restPath = JellyStarPath.of(gummy);
//? Tips lag behind the body while it spins, then overshoot when it lands: the jelly part of the hop.
const twistPath = [
  restPath,
  restPath,
  JellyStarPath.of({ ...gummy, twist: -14 }),
  JellyStarPath.of({ ...gummy, twist: 7 }),
  restPath,
].join(";");

interface JellyStarProps {
  className?: string;
  motion?: "still" | "breathe" | "hop";
  shadow?: boolean;
  label?: string;
}
export const JellyStar = ({ className, motion = "still", shadow = true, label }: JellyStarProps) => {
  //? useId may contain ':' or '«»', which a url(#…) reference does not match reliably across browsers.
  const id = `jelly${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const isHop = motion === "hop";
  if (!isHop) preload(markSrc, { as: "image" });
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn("size-full overflow-visible", motion === "breathe" && "jelly-breathe", className)}
      role={label ? "img" : undefined}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {isHop ? (
          //? User-unit blurs and offsets hold at any size; lighting primitives take normals per device pixel.
          <filter colorInterpolationFilters="sRGB" height="140%" id={`${id}-gel`} width="140%" x="-20%" y="-20%">
            <feGaussianBlur in="SourceAlpha" result="thick" stdDeviation="9" />
            <feColorMatrix
              in="thick"
              result="glow"
              type="matrix"
              values="0 0 0 0 1  0 0 0 0 0.23  0 0 0 0 0.11  0 0 0 -1.9 1.75"
            />
            <feMorphology in="SourceAlpha" operator="erode" radius="6" result="inset" />
            <feGaussianBlur in="inset" result="sheenBase" stdDeviation="14" />
            <feOffset dx="-10" dy="-13" in="sheenBase" result="sheenShift" />
            <feComposite in="sheenShift" in2="sheenBase" k2="2.6" k3="-2.6" operator="arithmetic" result="lit" />
            <feFlood floodColor="#ff9c92" />
            <feComposite in2="lit" operator="in" result="sheen" />
            <feGaussianBlur in="SourceAlpha" result="edge" stdDeviation="2.5" />
            <feColorMatrix
              in="edge"
              result="rim"
              type="matrix"
              values="0 0 0 0 1  0 0 0 0 0.46  0 0 0 0 0.4  0 0 0 -0.55 0.5"
            />
            <feMerge result="gummy">
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="glow" />
              <feMergeNode in="sheen" />
              <feMergeNode in="rim" />
            </feMerge>
            <feComposite in="gummy" in2="SourceAlpha" operator="in" />
          </filter>
        ) : null}
        <filter height="300%" id={`${id}-shadow`} width="140%" x="-20%" y="-100%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {shadow ? (
        //? jelly-hop-shadow animates `opacity`, which replaces an opacity attribute outright; fill-opacity multiplies.
        <ellipse
          className={isHop ? "jelly-hop-shadow" : undefined}
          cx="100"
          cy="186"
          fill="#000000"
          fillOpacity="0.16"
          filter={`url(#${id}-shadow)`}
          rx="58"
          ry="7"
        />
      ) : null}
      {isHop ? (
        <g filter={`url(#${id}-gel)`}>
          <g className="jelly-hop-body">
            <g className="jelly-hop-spin">
              <path d={restPath} fill="#e30d07">
                <animate
                  attributeName="d"
                  calcMode="spline"
                  dur="1.2s"
                  keySplines="0 0 1 1; 0.4 0 0.2 1; 0.4 0 0.2 1; 0.3 0 0.3 1"
                  keyTimes="0; 0.16; 0.5; 0.8; 1"
                  repeatCount="indefinite"
                  values={twistPath}
                />
              </path>
            </g>
          </g>
        </g>
      ) : (
        //? Lands the render's centre (359.5, 389.5 of 720px) on (100, 106) and its feet (y 676) on the floor at 179.
        <image height="183.46" href={markSrc} width="183.46" x="8.4" y="6.75" />
      )}
    </svg>
  );
};
