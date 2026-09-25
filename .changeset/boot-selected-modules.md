---
"akanjs": minor
---

feat(server): boot a subset of modules with `modules`

`new AkanApp("./server", { modules: ["article"] })` mounts only the named modules and the ones they reach; every
other module stays out of the container, so its service, signal, routes and scheduled jobs do not exist. Omitted
or empty keeps today's behaviour — every module whose service is enabled. This is what lets one codebase run as
several small processes, such as a batch worker that carries only its own domain.

Dependencies are followed, so you name entry points rather than the whole graph. The closure takes the services
and signals a module injects, and also its cascade edges: a `removeRef` target and a monomorphic `removeWith`
owner both fail `CascadeRunner.seal` when absent, so they are boot requirements the inject graph cannot see. A
polymorphic `refPath` candidate is left out, matching the existing rule that an unmounted one is a mount choice
rather than a typo. What was mounted is named at boot:

```
[DiLifecycle] INFO  Mounting 3 of 12 module(s): article, file, user
```

A name no module registered fails the boot instead of being ignored — a typo would otherwise drop a module
silently, which is the one failure the option exists to prevent. Selection narrows the enabled set rather than
replacing it, so it never turns on a module whose service is `enabled: false`.

The same selection is available as `AKAN_MODULES=article,file` for a deployment that decides the split, and as
`{ modules }` on `AkanServer` for an app that starts the server directly. `AkanApp` hands its own option down to
every child through that variable, since each replica builds its own container.

`DiLifecycle`'s constructor now takes `({ env, modules }, ...libs)` instead of `(env, serverMode, ...libs)`. The
`serverMode` argument was unused — schedule registration takes its own — so it went with the change.
