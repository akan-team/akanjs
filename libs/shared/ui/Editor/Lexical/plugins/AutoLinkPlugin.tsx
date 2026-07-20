"use client";
import {
  createLinkMatcherWithRegExp,
  AutoLinkPlugin as LexicalAutoLinkPlugin,
} from "@lexical/react/LexicalAutoLinkPlugin";

import { safeExternalUrl } from "../url";

const URL_REGEX =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/;
const EMAIL_REGEX =
  /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;

const MATCHERS = [
  createLinkMatcherWithRegExp(URL_REGEX, (text) => {
    const absolute = text.startsWith("http") ? text : `https://${text}`;
    // URL_REGEX only matches http(s)/www, so this resolves in practice; fall back defensively.
    return safeExternalUrl(absolute) ?? absolute;
  }),
  createLinkMatcherWithRegExp(EMAIL_REGEX, (text) => `mailto:${text}`),
];

/** Auto-detects URLs / emails as the user types and wraps them in safe links. */
export const AutoLinkPlugin = () => <LexicalAutoLinkPlugin matchers={MATCHERS} />;
