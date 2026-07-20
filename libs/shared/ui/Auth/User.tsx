import { fetch } from "@libs/shared/client";
import { getAccount } from "akanjs/client";
import { Load } from "akanjs/ui";

import { Bridge } from "./Bridge";
import { TokenRefresh } from "./TokenRefresh";

export const User = () => {
  const account = getAccount<{ me?: { id: string }; self?: { id: string } }>();
  return (
    <Load.Page
      of={() => null}
      loader={() => {
        const selfPromise = (async () => {
          try {
            return account.self ? await fetch.getSelf({ crystalize: false }) : null;
          } catch (_e) {
            return null;
          }
        })();
        return Promise.resolve({ selfPromise });
      }}
      render={({ selfPromise }) => (
        <>
          <Bridge selfPromise={selfPromise} />
          <TokenRefresh scope="user" />
        </>
      )}
    />
  );
};
