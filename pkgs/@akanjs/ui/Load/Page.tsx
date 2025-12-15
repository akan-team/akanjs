import { baseClientEnv } from "@akanjs/base";
import { ReactNode } from "react";

import { PageCSR } from "./PageCSR";

export interface PageProps<Return> {
  of: (props: any) => ReactNode | null;
  loader: () => Promise<Return>;
  render: (data: Return) => ReactNode;
  loading?: () => ReactNode;
  noCache?: boolean;
}
const Page: <Return>(props: PageProps<Return>) => ReactNode =
  baseClientEnv.renderMode === "csr"
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
