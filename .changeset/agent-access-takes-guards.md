---
"akanjs": patch
---

feat!: `setAgentAccess` takes guard classes, not a policy function

Who may spend the LLM key through the `runAgentTurn` relay is an authorization decision, and this codebase spells
those as guard classes everywhere else. `AgentRelayAccess` now forwards to the guards an app names instead of
calling a bespoke `(context) => boolean` — so the relay reuses the same `srvkit/guards.ts` classes an endpoint's
own `guards: [...]` array takes, rather than making the app restate `!!context.get("account")` in a shape nothing
else in the framework understands.

```ts
// before
option.setAgentAccess((context) => !!context.get("account"));
// after
option.setAgentAccess(SignedIn);
option.setAgentAccess([SignedIn, NotBanned]); // ANDed, as an endpoint's own array is
```

`null` still clears what a library set, and with nothing named the call is still refused like `None`. The
`AgentRelayPolicy` type is gone. `AgentRelayAccess.scope` became a getter reporting whatever its delegates need,
so a resource-scoped guard cannot be evaluated argument-free by a catalogue that believed the old static
`"account"`. Guard instances are now cached by `guardOf` in `signal/guard.ts`, which `SignalContext` uses too —
one instance per class, built on first use rather than at registration.
