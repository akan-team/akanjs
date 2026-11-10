# `akanjs/server/ed25519Key`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class Ed25519Key {
    static parsePublic(value: string, name: string): KeyObject;
    static parsePrivate(value: string, name: string): KeyObject;
    static generate(): {
        privatePem: string;
        publicKey: string;
    };
    static rawPublic(key: KeyObject): string;
}
```
