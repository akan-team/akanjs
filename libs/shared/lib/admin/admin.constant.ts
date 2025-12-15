import { dayjs, enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";
import { validate } from "@util/common";

export class AdminRole extends enumOf("adminRole", ["manager", "admin", "superAdmin"] as const) {}

export class AdminInput extends via((field) => ({
  accountId: field(String, { validate: validate.email, type: "email", example: "hello@naver.com", text: "search" }),
})) {}

export class AdminObject extends via(AdminInput, (field) => ({
  password: field(String, { type: "password", example: "qwer1234", minlength: 8 }).optional(),
  roles: field([AdminRole], { example: ["admin", "superAdmin"] }),
  lastLoginAt: field(Date, { default: () => dayjs(), example: dayjs() }),
})) {}

export class LightAdmin extends via(AdminObject, ["accountId", "roles"] as const, (resolve) => ({})) {
  hasAccess(role: AdminRole["value"]) {
    if (role === "superAdmin") return this.roles.includes("superAdmin");
    if (role === "admin") return this.roles.includes("superAdmin") || this.roles.includes("admin");
    else return false;
  }
}

export class Admin extends via(AdminObject, LightAdmin, (resolve) => ({})) {}

export class AdminInsight extends via(Admin, (field) => ({})) {}
