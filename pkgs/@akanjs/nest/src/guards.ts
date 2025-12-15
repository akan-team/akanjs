import { CanActivate, ExecutionContext } from "@nestjs/common";

export class Public implements Guard {
  static name = "Public";
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

export class None implements Guard {
  static name = "None";
  canActivate(context: ExecutionContext): boolean {
    return false;
  }
}

export type Guard = CanActivate;
