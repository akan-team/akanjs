"use client";
import type { ReactFont } from "@akanjs/client";
import { useEffect } from "react";

type FontStyleType =
  | "thin"
  | "extralight"
  | "light"
  | "regular"
  | "medium"
  | "extrabold"
  | "semibold"
  | "bold"
  | "black";

interface FontFaceProps {
  font: ReactFont;
}

const fontStyleMap = {
  thin: 100,
  extralight: 200,
  light: 300,
  regular: 400,
  medium: 500,
  extrabold: 600,
  semibold: 700,
  bold: 800,
  black: 900,
};
const fontWeightMap = {
  100: "thin",
  200: "extralight",
  300: "light",
  400: "regular",
  500: "medium",
  600: "extrabold",
  700: "semibold",
  800: "bold",
  900: "black",
};

export const FontFace = ({ font }: FontFaceProps) => {
  const getWeight = (style: FontStyleType) => {
    const findWeight = font.paths.find((path) => fontWeightMap[path.weight] === style);
    if (!findWeight) {
      const findWeight = font.paths.reduce((prev, curr) => {
        return Math.abs(fontStyleMap[style] - curr.weight) < Math.abs(fontStyleMap[style] - prev.weight) ? curr : prev;
      }, font.paths[0]);
      return findWeight.weight;
    }
    return findWeight.weight;
  };

  useEffect(() => {
    const styles = ["thin", "extralight", "light", "regular", "medium", "extrabold", "semibold", "bold", "black"];

    const fontFace = `:root { --font-${font.name}: ${font.name}} ${styles.map(
      (style: FontStyleType) => `@font-face {
      font-family: '${font.name}';
      src: url('${font.paths.find((path) => getWeight(style) === path.weight)?.src}');
      font-weight: ${getWeight(style)};
      font-style: ${style};
      }`
    )}`;

    const fontText = fontFace.replace(/,/g, " ");

    const style = document.createElement("style");
    // style.type = "text/css"; //! deprecated
    style.appendChild(document.createTextNode(fontText));
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [font.name, font.paths]);
  return null;
};
