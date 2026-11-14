import { websocketBinaryFrameContract } from "akanjs/common";
import type { WebsocketPublishData, WebsocketResyncData } from "akanjs/signal";
import type { BinaryPubsub } from "../binaryPubsub";
import type { LocalPublish } from "../types";
import type { RoomReplay } from "./roomReplay";

export interface LocalRoomsOptions {
  servers: (Bun.Server<never> | null)[];
  replay: RoomReplay;
  binary: BinaryPubsub;
  subscribed: (roomId: string) => boolean;
  coalesces: (roomId: string) => boolean;
}

export const localRoomsOf = ({ servers, replay, binary, subscribed, coalesces }: LocalRoomsOptions) => {
  const send = (roomId: string, frame: string) => {
    for (const server of servers) server?.publish(roomId, frame);
  };
  const publish: LocalPublish = (roomId, data) => {
    if (data instanceof Uint8Array) {
      replay.unnumbered(roomId);
      const frame = websocketBinaryFrameContract.encode({ roomId, payload: data });
      binary.publish(roomId, frame, { coalesce: coalesces(roomId) });
      return;
    }
    const publishData: WebsocketPublishData = { type: "pub", roomId, data };
    send(roomId, replay.frameOf(publishData, subscribed(roomId)));
  };
  const resync = (roomId: string) => {
    const resyncData: WebsocketResyncData = { type: "resync", roomId };
    send(roomId, replay.frameOf(resyncData, subscribed(roomId)));
  };
  return { publish, resync };
};
