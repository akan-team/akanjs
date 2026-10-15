import { fetch, usePage } from "@libs/shared/client";
import { getApiPrefix } from "akanjs/base";
import { page } from "akanjs/client";
import { buttonRecipe } from "akanjs/ui";

export default page()
  .search("request", String, { desc: "The request of this screen." })
  .render(async ({ request: requestId }) => {
    const { l } = usePage();
    const request = requestId ? await fetch.viewOAuthAuthorizationRequest(requestId).catch(() => null) : null;
    const decisionAction = (decision: "approveOAuthConsent" | "denyOAuthConsent") =>
      `${getApiPrefix()}/${decision}/${requestId ?? ""}`;
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
        <h1 className="font-bold text-2xl text-foreground">{l("oauth.consentTitle")}</h1>
        {request ? (
          <>
            <dl className="grid gap-4 rounded-lg border border-border bg-card p-5 text-sm">
              <div className="grid gap-1">
                <dt className="text-foreground/60">{l("oauth.consentClient")}</dt>
                <dd className="font-medium text-foreground">{request.clientName || request.clientId}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-foreground/60">{l("oauth.consentRedirect")}</dt>
                <dd className="font-mono text-foreground">{request.redirectHost}</dd>
              </div>
            </dl>
            {request.isLoopbackRedirect ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-foreground text-sm">
                {l("oauth.consentLoopbackWarning")}
              </p>
            ) : null}
            <p className="text-foreground/70 text-sm">{l("oauth.consentScope")}</p>
            <div className="flex justify-end gap-3">
              <form method="post" action={decisionAction("denyOAuthConsent")}>
                <button type="submit" className={buttonRecipe({ variant: "outline" })}>
                  {l("oauth.deny")}
                </button>
              </form>
              <form method="post" action={decisionAction("approveOAuthConsent")}>
                <button type="submit" className={buttonRecipe({ variant: "primary" })}>
                  {l("oauth.approve")}
                </button>
              </form>
            </div>
          </>
        ) : (
          <p className="text-foreground/70">{l("oauth.consentUnavailable")}</p>
        )}
      </main>
    );
  });
