import { getSelf } from "./cookie";

export const signedIn = (unauthorize = "/signin") => {
  getSelf({ unauthorize });
};
