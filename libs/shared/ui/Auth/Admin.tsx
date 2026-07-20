import { fetch } from "@libs/shared/client";
import { getAccount } from "akanjs/client";
import { Load } from "akanjs/ui";

import { Bridge } from "./Bridge";
import { TokenRefresh } from "./TokenRefresh";

export const Admin = () => {
  const account = getAccount<{ me?: { id: string }; self?: { id: string } }>();
  return (
    <Load.Page
      of={() => null}
      loader={() => {
        const mePromise = (async () => {
          try {
            return account.me ? await fetch.me({ crystalize: false }) : null;
          } catch (_e) {
            return null;
          }
        })();
        return Promise.resolve({ mePromise });
      }}
      render={({ mePromise }) => (
        <>
          <Bridge mePromise={mePromise} />
          <TokenRefresh scope="admin" />
        </>
      )}
    />
  );
};
