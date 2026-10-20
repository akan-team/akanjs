import { getSelf } from "./cookie";

// Called, never passed: `.guard(signedIn)` would hand the route's arguments to `unauthorize`.
export const signedIn = (unauthorize = "/signin") => {
  getSelf({ unauthorize });
};
