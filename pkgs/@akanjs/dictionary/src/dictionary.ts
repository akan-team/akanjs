import type { BaseEndpoint } from "@akanjs/signal";

import { baseDictionary } from "./base.dictionary";
import { registerServiceTrans } from "./locale";
import { makeTrans } from "./trans";

export const dictionary = { base: registerServiceTrans<"base", BaseEndpoint, typeof baseDictionary>(baseDictionary) };

export const { Revert, translate, msg, getDictionary, getAllDictionary, __Dict_Key__, __Error_Key__ } =
  makeTrans(dictionary);
