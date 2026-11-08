import { via } from "akanjs/constant";

export class VerifiedEmail extends via((field) => ({
  email: field(String),
  isAccountId: field(Boolean, { default: false }),
})) {}
