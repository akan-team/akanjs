"use client";
import {
  createLinkMatcherWithRegExp,
  AutoLinkPlugin as LexicalAutoLinkPlugin,
} from "@lexical/react/LexicalAutoLinkPlugin";
import { RichUrl } from "@libs/shared/common";

const urlHostChars = "-a-zA-Z0-9@:%._+~#=";
const urlPathChars = "-a-zA-Z0-9()@:%_+.~#?&/=";
const urlPattern = new RegExp(
  String.raw`((https?:\/\/(www\.)?)|(www\.))[${urlHostChars}]{1,256}\.[a-zA-Z0-9()]{1,6}\b([${urlPathChars}]*)`,
);
const emailPattern =
  /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;

const matchers = [
  createLinkMatcherWithRegExp(urlPattern, (text) => {
    const absolute = text.startsWith("http") ? text : `https://${text}`;
    // urlPattern only matches http(s)/www, so this resolves in practice; fall back defensively.
    return RichUrl.external(absolute) ?? absolute;
  }),
  createLinkMatcherWithRegExp(emailPattern, (text) => `mailto:${text}`),
];

/** Auto-detects URLs / emails as the user types and wraps them in safe links. */
export const AutoLinkPlugin = () => <LexicalAutoLinkPlugin matchers={matchers} />;
