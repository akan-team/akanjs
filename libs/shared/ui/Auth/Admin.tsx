import { getAccount } from "@akanjs/client";
import { Load } from "@akanjs/ui";
import { fetch } from "@shared/client";

import { Bridge } from "./Bridge";

export const Admin = () => {
  const account = getAccount<{ me?: { id: string }; self?: { id: string } }>();
  return (
    <Load.Page
      of={() => null}
      loader={() => {
        const mePromise = (async () => {
          try {
            return account.me ? await fetch.me({ crystalize: false }) : null;
          } catch (e) {
            return null;
          }
        })();
        return Promise.resolve({ mePromise });
      }}
      render={({ mePromise }) => <Bridge mePromise={mePromise} />}
    />
  );
};
