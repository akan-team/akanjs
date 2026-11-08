import { describe, expect, test } from "bun:test";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AiFillCheckCircle,
  AiOutlineCheckCircle,
  AiOutlineClose,
  AiOutlineExclamationCircle,
  AiOutlineInfoCircle,
  AiOutlineLoading3Quarters,
  AiOutlineWarning,
} from "react-icons/ai";
import { TbPlugConnected, TbPlugConnectedX } from "react-icons/tb";
import { Icon } from "./Icon";

const counterparts: [keyof typeof Icon, ComponentType<{ className?: string }>][] = [
  ["CheckCircleFill", AiFillCheckCircle],
  ["CheckCircle", AiOutlineCheckCircle],
  ["Close", AiOutlineClose],
  ["ExclamationCircle", AiOutlineExclamationCircle],
  ["InfoCircle", AiOutlineInfoCircle],
  ["Loading", AiOutlineLoading3Quarters],
  ["Warning", AiOutlineWarning],
  ["PlugConnected", TbPlugConnected],
  ["PlugConnectedX", TbPlugConnectedX],
];

describe("Icon", () => {
  test.each(counterparts)("%s draws what react-icons draws", (name, ReactIcon) => {
    const Drawn = Icon[name];
    expect(renderToStaticMarkup(<Drawn className="animate-spin" />)).toBe(
      renderToStaticMarkup(<ReactIcon className="animate-spin" />),
    );
  });
});
