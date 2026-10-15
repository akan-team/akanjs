import { RichUrl } from "@libs/shared/common";

export const validateLinkUrl = (url: string) => RichUrl.typedLink(url) !== null;
