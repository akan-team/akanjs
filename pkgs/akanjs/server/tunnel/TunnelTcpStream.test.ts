import { describe, expect, test } from "bun:test";
import net from "node:net";
import type { TunnelDataFromAgent, TunnelOpenFrame } from "akanjs/common";
import { TunnelTcpStream } from "./TunnelTcpStream";

const serveBytes = (total: number) => {
  const payload = new Uint8Array(total).fill(7);
  const pump = (socket: Bun.Socket<{ offset: number }>) => {
    while (socket.data.offset < total) {
      const written = socket.write(payload.subarray(socket.data.offset));
      if (written <= 0) return;
      socket.data.offset += written;
    }
    socket.end();
  };
  return Bun.listen<{ offset: number }>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open: (socket) => {
        socket.data = { offset: 0 };
        pump(socket);
      },
      drain: pump,
      data: () => undefined,
    },
  });
};

const halfCloseOrigin = (onConnection: (socket: net.Socket) => void) =>
  new Promise<net.Server>((resolve) => {
    const server = net.createServer({ allowHalfOpen: true }, onConnection);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

const openTo = (server: net.Server): TunnelOpenFrame => ({
  type: "open",
  streamId: "s1",
  kind: "tcp",
  hostname: "tunnel.test",
  port: (server.address() as net.AddressInfo).port,
});

const textOf = (data: Uint8Array) => new TextDecoder().decode(data);

describe("TunnelTcpStream", () => {
  test("waits for each payload to drain before reading more, and ends after the last one", async () => {
    const total = 2 * 1024 * 1024;
    const server = serveBytes(total);
    const events: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    let forwarded = 0;
    const stream: TunnelTcpStream = new TunnelTcpStream(
      { type: "open", streamId: "s1", kind: "tcp", hostname: "tunnel.test", port: server.port },
      {
        sendFrame: (frame: TunnelDataFromAgent) => {
          events.push(frame.type);
          if (frame.type === "end") stream.end();
        },
        sendPayload: async (data) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await Bun.sleep(1);
          forwarded += data.byteLength;
          events.push("payload");
          inFlight -= 1;
        },
        closeSocket: () => undefined,
      },
      "127.0.0.1",
      [server.port],
    );
    try {
      await stream.run();
      expect(maxInFlight).toBe(1);
      expect(forwarded).toBe(total);
      expect(events[0]).toBe("head");
      expect(events.at(-1)).toBe("end");
      expect(events.filter((event) => event === "end").length).toBe(1);
    } finally {
      server.stop(true);
    }
  }, 20_000);

  test("hands the gateway's end to the origin as a half-close and still carries the reply", async () => {
    const origin = await halfCloseOrigin((socket) => {
      let got = "";
      socket.on("data", (data) => {
        got += data;
      });
      socket.on("end", () => socket.end(`reply:${got}`));
    });
    const events: string[] = [];
    let socketCloses = 0;
    const stream: TunnelTcpStream = new TunnelTcpStream(
      openTo(origin),
      {
        sendFrame: (frame) => {
          events.push(frame.type);
          if (frame.type !== "head") return;
          setTimeout(() => {
            stream.push(new TextEncoder().encode("request"));
            stream.end();
          }, 0);
        },
        sendPayload: async (data) => {
          events.push(`payload:${textOf(data)}`);
        },
        closeSocket: () => {
          socketCloses += 1;
        },
      },
      "127.0.0.1",
      [(origin.address() as net.AddressInfo).port],
    );
    try {
      await stream.run();
      expect(events).toEqual(["head", "payload:reply:request", "end"]);
      expect(socketCloses).toBe(1);
    } finally {
      origin.close();
    }
  }, 20_000);

  test("keeps carrying the gateway's bytes to an origin that ended its own side first", async () => {
    let originRead: (got: string) => void = () => undefined;
    const read = new Promise<string>((resolve) => {
      originRead = resolve;
    });
    const origin = await halfCloseOrigin((socket) => {
      let got = "";
      socket.end("hello");
      socket.on("data", (data) => {
        got += data;
      });
      socket.on("end", () => originRead(got));
    });
    const events: string[] = [];
    const stream: TunnelTcpStream = new TunnelTcpStream(
      openTo(origin),
      {
        sendFrame: (frame) => {
          events.push(frame.type);
          if (frame.type !== "end") return;
          setTimeout(() => {
            stream.push(new TextEncoder().encode("after"));
            stream.end();
          }, 0);
        },
        sendPayload: async (data) => {
          events.push(`payload:${textOf(data)}`);
        },
        closeSocket: () => undefined,
      },
      "127.0.0.1",
      [(origin.address() as net.AddressInfo).port],
    );
    try {
      await stream.run();
      expect(events).toEqual(["head", "payload:hello", "end"]);
      expect(await read).toBe("after");
    } finally {
      origin.close();
    }
  }, 20_000);

  test("refuses a port it was not given without dialing it", async () => {
    let dialed = 0;
    const origin = await halfCloseOrigin(() => {
      dialed += 1;
    });
    const frames: TunnelDataFromAgent[] = [];
    let socketCloses = 0;
    const stream = new TunnelTcpStream(
      openTo(origin),
      {
        sendFrame: (frame) => void frames.push(frame),
        sendPayload: async () => undefined,
        closeSocket: () => {
          socketCloses += 1;
        },
      },
      "127.0.0.1",
      [1],
    );
    try {
      await stream.run();
      await Bun.sleep(20);
      expect(frames).toEqual([
        expect.objectContaining({ type: "reset", code: "protocol", message: expect.stringContaining("not shared") }),
      ]);
      expect(socketCloses).toBe(1);
      expect(dialed).toBe(0);
    } finally {
      origin.close();
    }
  });
});
