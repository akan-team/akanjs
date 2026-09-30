import { cn } from "akanjs/client";

const outerCubePath =
  "M89.9 109.8L37.6 78.4M89.9 109.8L83.4 192.0M89.9 109.8L162.1 68.0M37.6 78.4L9.2 166.5M37.6 78.4L97.7 8.0M83.4 192.0L9.2 166.5M83.4 192.0L190.8 186.2M9.2 166.5L87.8 131.5M162.1 68.0L97.7 8.0M162.1 68.0L190.8 186.2M97.7 8.0L87.8 131.5M190.8 186.2L87.8 131.5";
const innerCubePath =
  "M114.7 121.3L82.7 101.7M114.7 121.3L115.7 175.6M114.7 121.3L165.7 99.1M82.7 101.7L76.4 158.6M82.7 101.7L130.5 70.2M115.7 175.6L76.4 158.6M115.7 175.6L181.1 166.9M76.4 158.6L137.2 140.9M165.7 99.1L130.5 70.2M165.7 99.1L181.1 166.9M130.5 70.2L137.2 140.9M181.1 166.9L137.2 140.9";
const bridgePath =
  "M114.7 121.3L89.9 109.8M82.7 101.7L37.6 78.4M115.7 175.6L83.4 192.0M76.4 158.6L9.2 166.5M165.7 99.1L162.1 68.0M130.5 70.2L97.7 8.0M181.1 166.9L190.8 186.2M137.2 140.9L87.8 131.5";
const vertices = [
  [114.7, 121.3],
  [89.9, 109.8],
  [82.7, 101.7],
  [37.6, 78.4],
  [115.7, 175.6],
  [83.4, 192.0],
  [76.4, 158.6],
  [9.2, 166.5],
  [165.7, 99.1],
  [162.1, 68.0],
  [130.5, 70.2],
  [97.7, 8.0],
  [181.1, 166.9],
  [190.8, 186.2],
  [137.2, 140.9],
  [87.8, 131.5],
] as const;

interface TesseractProps {
  className?: string;
}
export const Tesseract = ({ className }: TesseractProps) => {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
      className={cn("text-primary", className)}
    >
      <path d={bridgePath} strokeWidth={0.6} strokeDasharray="2 3" opacity={0.5} />
      <path d={innerCubePath} strokeWidth={0.8} opacity={0.6} />
      <path d={outerCubePath} strokeWidth={1.2} />
      {vertices.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.6} fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
};
