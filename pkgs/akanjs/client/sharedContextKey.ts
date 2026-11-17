/** Where `sharedContext` keeps a framework context on `globalThis`, readable by a module the server loads too. */
export const sharedContextKey = (name: string) => Symbol.for(`akanjs.context.${name}`);
