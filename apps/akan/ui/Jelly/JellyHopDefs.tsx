import { JellyStarPath } from "./jellyStar.util";

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

//? One copy per document: inlined, the 15 KB morph went into the HTML and the RSC flight once per hop star.
export const JellyHopDefs = () => {
  return (
    <svg aria-hidden className="pointer-events-none absolute size-0">
      <defs>
        <path d={restPath} fill="#e30d07" id={JellyStarPath.hopId}>
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
      </defs>
    </svg>
  );
};
