# `akanjs/client/native/contacts`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface Contact {
    id: string;
    name: null | string;
    phones: ContactPhone[];
}

export interface ContactPhone {
    number: string;
    label: null | string;
}

export interface ContactsApi {
    checkPermission(): Promise<{
        contacts: PermissionState;
    }>;
    requestPermission(): Promise<{
        contacts: PermissionState;
    }>;
    getContacts(options?: GetContactsOptions): Promise<{
        contacts: Contact[];
    }>;
}

export interface GetContactsOptions {
    projection?: {
        name?: boolean;
        phones?: boolean;
    };
}

export type PermissionState = "denied" | "granted" | "prompt" | "prompt-with-rationale";

export declare const contacts: import("akanjs/client/native.ts").Plugin<ContactsApi, Record<never, never>>;
```
