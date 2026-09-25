import { describe, expect, test } from "bun:test";
import { websocketBinaryFrameContract } from "./websocketBinaryFrame";

describe("websocketBinaryFrameContract", () => {
  test("round-trips a room and its payload", () => {
    const payload = new Uint8Array([2, 148, 1, 2, 63]);
    const frame = websocketBinaryFrameContract.encode({ roomId: "streamReceived-ch1", payload });
    const decoded = websocketBinaryFrameContract.decode(frame);

    expect(decoded?.roomId).toBe("streamReceived-ch1");
    expect([...(decoded?.payload ?? [])]).toEqual([2, 148, 1, 2, 63]);
  });

  test("measures the room in bytes rather than characters", () => {
    const decoded = websocketBinaryFrameContract.decode(
      websocketBinaryFrameContract.encode({ roomId: "드론-①", payload: new Uint8Array([7]) }),
    );

    expect(decoded?.roomId).toBe("드론-①");
    expect([...(decoded?.payload ?? [])]).toEqual([7]);
  });

  test("carries an empty payload, which a zero-length publish is", () => {
    const decoded = websocketBinaryFrameContract.decode(
      websocketBinaryFrameContract.encode({ roomId: "room", payload: new Uint8Array(0) }),
    );

    expect(decoded?.roomId).toBe("room");
    expect(decoded?.payload.length).toBe(0);
  });

  test("decodes an ArrayBuffer, which is what a browser socket delivers", () => {
    const frame = websocketBinaryFrameContract.encode({ roomId: "room", payload: new Uint8Array([1, 2]) });
    const buffer = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as ArrayBuffer;

    expect(websocketBinaryFrameContract.decode(buffer)?.roomId).toBe("room");
  });

  test("returns null for bytes that are not a frame, rather than a room named from noise", () => {
    expect(websocketBinaryFrameContract.decode(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
    expect(websocketBinaryFrameContract.decode(new Uint8Array([0xab, 0x02, 0, 1, 65]))).toBeNull();
    expect(websocketBinaryFrameContract.decode(new Uint8Array([0xab]))).toBeNull();
  });

  test("returns null when the room is truncated mid-frame", () => {
    expect(websocketBinaryFrameContract.decode(new Uint8Array([0xab, 0x01, 0x00, 0x08, 65, 66]))).toBeNull();
  });

  test("refuses a room too long for its length header", () => {
    expect(() =>
      websocketBinaryFrameContract.encode({ roomId: "x".repeat(70_000), payload: new Uint8Array(1) }),
    ).toThrow("too long to frame");
  });
});
