import { Any, type Cls, type PrimitiveScalar } from "akanjs/base";
import { type ConstantModelRef, InputParser, serialize } from "akanjs/constant";
import { canonicalJson, websocketRoomContract } from "../common/websocketContract";
import type { ArgInfo } from "./endpointInfo";

export class RoomKey {
  static idOf(key: string, args: ArgInfo[], values: unknown[]): string {
    return websocketRoomContract.roomOf(
      key,
      args.map((arg, idx) =>
        arg.argRef === Any
          ? websocketRoomContract.jsonTokenOf(values[idx])
          : websocketRoomContract.tokenOf(values[idx]),
      ),
    );
  }

  //? A publisher's arguments take the subscriber's wire round trip, so parser defaults and relation ids line up.
  static idOfPublished(key: string, args: ArgInfo[], values: unknown[]): string {
    return RoomKey.idOf(
      key,
      args,
      args.map((arg, idx) => RoomKey.#asReceived(arg, values[idx])),
    );
  }

  static #asReceived(arg: ArgInfo, value: unknown): unknown {
    try {
      const sent = serialize(arg.argRef as ConstantModelRef | PrimitiveScalar, arg.arrDepth, value, "input", {
        nullable: true,
      });
      const wire: unknown = JSON.parse(JSON.stringify(sent) ?? "null");
      return InputParser.parse(arg.argRef as Cls, arg.arrDepth, wire, {
        key: arg.name,
        nullable: true,
        enum: arg.enum,
      });
    } catch {
      return value;
    }
  }

  //? The query is in the digest: two subscribers whose queries differ never share the room one of them is routed by.
  static liveIdOf(baseId: string, internalArgs: unknown[], query: unknown): string {
    const internal = internalArgs.map((value) => {
      const id = value && typeof value === "object" ? (value as { id?: unknown }).id : undefined;
      return typeof id === "string" ? { id } : (value ?? null);
    });
    return `${baseId}::${RoomKey.digest(canonicalJson({ internal, query: query ?? null }))}`;
  }

  static digest(text: string): string {
    return new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 32);
  }
}
