import { Remote } from "@libs/shared/client";
import { page } from "akanjs/client";

export default page()
  .search("state", String, { desc: "The value this app sent with the sign-in, which the other server repeats." })
  .search("code", String, { desc: "The authorization code the other server answered with." })
  .search("iss", String, { desc: "The authorization server that answered." })
  .search("error", String, { desc: "What the other server answered instead of a code." })
  .render(({ state, code, iss, error }) => (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <Remote.Zone.Callback
        className="text-center text-foreground"
        state={state ?? ""}
        code={code ?? ""}
        iss={iss ?? null}
        error={error ?? null}
      />
    </main>
  ));
