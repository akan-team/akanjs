import { createRoot } from "react-dom/client";
import { useDismissDrag } from "./useDismissDrag";

const log: ({ drag: number } | { release: boolean } | { click: true })[] = [];
Object.assign(window, { dragLog: log });

const Sheet = () => {
  const { bind, driver } = useDismissDrag({
    threshold: () => 120,
    flickSpeed: 0.5,
    onDrag: (y) => log.push({ drag: y }),
    onRelease: ({ dismiss }) => log.push({ release: dismiss }),
    gesture: { axis: "y", filterTaps: true },
  });
  return (
    <>
      {driver}
      <div
        {...bind()}
        id="handle"
        onClick={() => log.push({ click: true })}
        style={{ position: "fixed", top: 0, left: 0, width: 300, height: 300, touchAction: "none" }}
      />
    </>
  );
};

createRoot(document.body.appendChild(document.createElement("div"))).render(<Sheet />);
