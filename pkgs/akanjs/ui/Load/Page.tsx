import { getEnv } from "akanjs/base";
import type { ReactNode } from "react";

import { PageCSR } from "./PageCSR";

export interface PageProps<Return> {
  /** Route component used by the CSR page wrapper. */
  of: (props: unknown) => ReactNode | null;
  /** Async data loader shared by SSR and CSR rendering. */
  loader: () => Promise<Return>;
  /** Render callback invoked with the loaded data. */
  render: (data: Return) => ReactNode;
  /** Optional loading renderer used while CSR data is pending. */
  loading?: () => ReactNode;
  /** Disable cached CSR loader results when fresh data is required. */
  noCache?: boolean;
}
const Page: <Return>(props: PageProps<Return>) => ReactNode =
  getEnv().renderMode === "csr"
    ? PageCSR
    : <Return,>({ loader, render }: PageProps<Return>) => {
        return new Promise((resolve, reject) => {
          loader()
            .then((data) => {
              resolve(render(data));
            })
            .catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
              if (message === "NEXT_REDIRECT") reject(error);
              else {
                // eslint-disable-next-line no-console
                console.error(error);
                resolve(<div className="text-red-500">{message}</div>);
              }
            });
        });
      };

export default Page;
