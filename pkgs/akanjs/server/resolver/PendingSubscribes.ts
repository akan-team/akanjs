interface SocketSubscribes {
  arrived: number;
  running: number;
  leftAt: Map<string, number>;
}

//* An unsubscribe can arrive while that room's subscribe still runs its guards or handler. It finds no room to leave,
//* and the subscribe would then join one its client already let go, so the subscribe asks here before it joins.
//* Calls are numbered in arrival order, so a subscribe sent again after the unsubscribe still joins.
export class PendingSubscribes {
  #bySocket = new WeakMap<Bun.ServerWebSocket<unknown>, SocketSubscribes>();

  arrive(ws: Bun.ServerWebSocket<unknown>, isSubscribe: boolean) {
    const pending = this.#bySocket.get(ws) ?? { arrived: 0, running: 0, leftAt: new Map<string, number>() };
    this.#bySocket.set(ws, pending);
    pending.arrived += 1;
    if (isSubscribe) pending.running += 1;
    return pending.arrived;
  }

  settle(ws: Bun.ServerWebSocket<unknown>) {
    const pending = this.#bySocket.get(ws);
    if (!pending) return;
    pending.running = Math.max(0, pending.running - 1);
    if (!pending.running) pending.leftAt.clear();
  }

  leave(ws: Bun.ServerWebSocket<unknown>, requestRoomId: string, arrival: number) {
    const pending = this.#bySocket.get(ws);
    if (!pending?.running) return;
    pending.leftAt.set(requestRoomId, Math.max(pending.leftAt.get(requestRoomId) ?? 0, arrival));
  }

  isLeft(ws: Bun.ServerWebSocket<unknown>, requestRoomId: string, arrival: number) {
    return (this.#bySocket.get(ws)?.leftAt.get(requestRoomId) ?? 0) > arrival;
  }
}
