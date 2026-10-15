import { ID } from "akanjs/base";
import { via } from "akanjs/constant";

export class SignupTicket extends via((field) => ({
  userId: field(ID),
  signupToken: field(String), // every later sign-up step and the activation must hand this back
})) {}
