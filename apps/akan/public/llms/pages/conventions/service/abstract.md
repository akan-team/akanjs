# service.abstract.md

- Source: /conventions/service/abstract
- Mirror: /llms/pages/conventions/service/abstract.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- service.abstract.md (#service-abstract)
- The Four Parts (#real-shape)
- Fill In The Scaffold (#scaffold)
- What Counts As A Rule (#what-to-write)

## Content

service.abstract.md

A short markdown file beside a service module. It holds the invariants — rules that must always hold — which the code obeys but cannot explain, and nothing else.

One rule from the oauth module shows the difference:

What the Code Says

`oauth.service.ts` hands this window to `refreshSession`: a refresh token reused within 30 seconds of its rotation is rotated again, not revoked.

What the Abstract Adds

Why. A client that holds the same token twice is not a thief, and treating it as one signs the user out of an app that did nothing wrong.

The second card is the abstract's whole job. The file sits in the module folder; the folder keeps its underscore and the file name drops it: `lib/_oauth/oauth.abstract.md`.

When to touch it

**Before you change the module,** read it first.

**When an invariant, a workflow or public behaviour changes,** update it.

**When only formatting, imports or style change,** leave it alone.

The Four Parts

An abstract has four parts, and the last is optional. All thirty-three abstracts in this workspace open with a title, one sentence and `## Rules`, and so does the scaffold a new service module starts from.

The whole skeleton:

Part

- # <service> Service Abstract: One title line: the module name as the folder spells it, minus the underscore.

- One sentence: What the module owns, stated as fact rather than a promise. No heading above it.

- ## Rules: Two to five bullets, each an invariant a reader could not derive from the code.

- Workflow chain: Optional. One line with no heading: bare arrows between states. — Example: `authorize -> pending -> approved | denied -> code`

A real one: oauth

`libs/shared/lib/_oauth/oauth.abstract.md` is the best one in the workspace. Here it is in full, unedited:

**Eight rules and one chain.** The service file runs to about five hundred lines, so it carries more than the usual two to five.

**No field lists, types or signatures.** A name such as `AccountMiddleware` or `refreshSession` appears only to say who enforces the decision.

**Every rule is a decision.** Left unwritten, the next reader would have to reverse-engineer it from the code.

**More than half guard security.** They stop a plausible change to PKCE, redirect matching, token reuse or revocation from opening a hole.

Fill In The Scaffold

A new service module starts with an abstract already in this shape: its title, a placeholder sentence and two placeholder rules. Every line in angle brackets is a prompt, and none of them survives the first real edit.

What `akan create-service payment` writes:

What each line becomes:

Scaffold

Becomes

- # payment Service Abstract: Written for you from the folder name, minus the underscore. Keep it.

- <One sentence …>: Replaced by what the module owns, stated as fact.

- ## Rules: Stays. Both placeholder bullets become the module's real invariants, two to five in all.

- Workflow chain: Not in the scaffold. Add one last line of arrows if the service moves something through states.

- A field's meaning: Not here: a trailing comment beside the field, in the constant.ts that declares it.

**A line still in angle brackets means nobody has written the abstract yet.** The next reader — a person or an agent — opens this file before changing the module, and a placeholder tells them nothing true about it. Write the sentence and the rules in the same change that adds the first endpoint.

What Counts As A Rule

Use the same test as for code comments: does this sentence carry a fact that is nowhere in the code? A bullet that passes stays true for years; one that fails goes stale the first time a field is renamed.

Worth a bullet

Kind

Example from oauth

- A lifetime or threshold, and its reason: A code lives sixty seconds; an authorization request lives ten minutes.

- A refusal that looks like an oversight: Revocation answers 200 whether or not the token was live, so it cannot probe tokens.

- Why an obvious alternative was rejected: A client holding the same refresh token twice is not a thief.

- A scope boundary enforced call by call: A late reuse revokes that grant's lineage only, never the account's other sessions.

Not worth a bullet

**Field lists, types and method signatures.** The constant and signal files are shorter than a sentence describing them.

**What the root AGENTS.md already tells every module,** such as keeping business behaviour in the service.

**To-dos, roadmaps and related-module lists.** The import graph already shows which modules are related.

Language

Korean is normal in an abstract and common here: `security`, `util`, `localFile` and `shared` are all written in it. What is never normal is a language split inside one file.

## Code Examples

### apps/koyo/lib/_payment/payment.abstract.md

```markdown
# payment Service Abstract

<One sentence: what this module owns, stated as fact.>

## Rules

- <An invariant the code obeys but cannot explain.>
- <Two to five of them.>

<state> -> <state> -> <state>
```

### libs/shared/lib/_oauth/oauth.abstract.md

```markdown
# oauth Service Abstract

Issues, from the same process that serves `/mcp`, the OAuth 2.1 tokens that MCP endpoint accepts: authorization-server
metadata, authorization with PKCE and a consent page, client registration, token exchange and refresh.

## Rules

- Every access token is signed with the app's own secret and names the MCP endpoint as `aud`, so `AccountMiddleware`
  accepts it unchanged and `McpAuth` verifies it through `option.setMcp`. Guards stay the only authorization decision;
  no scope narrows what the token may do.
- An authorization request lives ten minutes, binds to the first signed-in account that opens it, and is decided once.
  A code lives sixty seconds and is consumed on first exchange, whether or not that exchange succeeds.
- PKCE `S256` is the only method. A redirect URI must be registered and match exactly, except that a loopback address
  may vary its port; a private-use scheme is accepted only when configuration names it.
- Refresh tokens rotate on use through `refreshSession`; a token reused within thirty seconds of its rotation is answered with
  a rotation of its own (a client that holds it twice is not a thief), one reused later revokes that grant's lineage only — never
  the account's other sessions. A refresh presented by a client other than the one it was issued to is refused.
- Registration is open (RFC 7591), rate-limited per address and public-client only; a `client_id` that is an HTTPS URL is
  read as a Client ID Metadata Document — resolved first and refused when it points into a private range, never fetched
  from the server's own network — unless configuration turns the feature off.
- A grant is revoked as a whole (RFC 7009 `/oauth/revoke` by the client, or the account's owner disconnecting it): its
  refresh lineage is closed and the lineage id is denylisted for an access token's lifetime, which is how a stateless
  token dies early. Revocation answers 200 whether or not the token was live, so it cannot be used to probe tokens.
- A token this server minted names its client and the MCP resource; a browser session names neither. That difference is
  what `isAgentCall` / `Person` read to keep an act a person may take from being taken on a model's say-so.
- None of these endpoints is published to MCP: they are the protocol and the account's own controls, not tools.

authorize -> pending -> approved | denied -> code -> token -> refresh -> revoked
```

### apps/koyo/lib/_payment/payment.abstract.md

```markdown
# payment Service Abstract

<One sentence: the workflow or integration this service owns, stated as fact.>

## Rules

- <An invariant the code obeys but cannot explain: a lifetime, a refusal, an ordering, and its reason.>
- <Two to five of them. If the service moves something through states, end the file with one arrow line.>
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

