import { getAccount } from "@akanjs/client";
import { Load } from "@akanjs/ui";
import { fetch } from "@shared/client";

import { Bridge } from "./Bridge";

export const User = () => {
  const account = getAccount<{ me?: { id: string }; self?: { id: string } }>();
  return (
    <Load.Page
      of={() => null}
      loader={() => {
        const selfPromise = (async () => {
          try {
            return account.self ? await fetch.getSelf({ crystalize: false }) : null;
          } catch (e) {
            return null;
          }
        })();
        return Promise.resolve({ selfPromise });
      }}
      render={({ selfPromise }) => <Bridge selfPromise={selfPromise} />}
    />
  );
};
