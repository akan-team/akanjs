import { client } from "./client";

export const baseFetch = Object.assign(global.fetch, {
  client,
  clone: function (option: { jwt?: string | null } = {}) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return {
      ...this,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      client: this.client.clone(option),
    };
  },
});
