import "./styles.css";
import type { Font, LayoutProps } from "akanjs/client";

export const fonts: Font[] = [
  {
    name: "notosans",
    default: true,
    paths: [{ src: "/libs/shared/fonts/NotoSansKR.ttf", weight: 500 }],
  },
];

export const theme = "dark";
export const head = <title>apptest</title>;

export default function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}
