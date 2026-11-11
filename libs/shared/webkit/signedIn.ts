import { withRedirectQuery } from "@libs/shared/common";
import { getSelf } from "./cookie";

interface SignedInOption {
  path?: string;
  unauthorize?: string;
}

export const signedIn = (option: string | SignedInOption = "/signin") => {
  const { path, unauthorize = "/signin" } = typeof option === "string" ? { unauthorize: option } : option;
  getSelf({
    unauthorize: path && unauthorize !== "notFound" ? withRedirectQuery(unauthorize, { redirect: path }) : unauthorize,
  });
};
