import type { ReactNode } from "react";

//? React hoists a `<title>` a view renders into the head beside the route's own, so a not-found view's head tags are
//? handed to the document head instead, which can take them only while the shell still waits for that view.
export class FallbackHead {
  static Settled = async ({
    head,
    until,
    render,
  }: {
    head: FallbackHead;
    until: Promise<unknown>;
    render: (tags: ReactNode[] | null) => ReactNode | Promise<ReactNode>;
  }) => {
    await until;
    head.#written = true;
    return await render(head.#tags);
  };

  #tags: ReactNode[] | null = null;
  #written: boolean = false;

  offer(tags: ReactNode[]): boolean {
    if (this.#written) return false;
    this.#tags = tags;
    return true;
  }
}
