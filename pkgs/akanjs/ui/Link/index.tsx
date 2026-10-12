import { getEnv } from "akanjs/base";
import type { HTMLAttributes } from "react";

import { Back, Close, Lang } from "./Action";
import { type CommonLinkProps, CsrLink, SsrLink } from "./Anchor";

export const Link = ({ className, href, disabled = false, children, ...props }: CommonLinkProps) => {
  if (disabled || !href) {
    const { scrollToTop, replace, activeClassName, activeExact, activeMatch, noCache, ...divProps } = props;
    return (
      <div className={className} {...(divProps as unknown as HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }

  if (getEnv().renderMode === "csr")
    return (
      <CsrLink className={className} href={href} {...props}>
        {children}
      </CsrLink>
    );
  return (
    <SsrLink className={className} href={href} {...props}>
      {children}
    </SsrLink>
  );
};
Link.Back = Back;
Link.Close = Close;
Link.Lang = Lang;
