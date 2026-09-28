import { definePlugin } from "../../../packages/core/src/index.ts";

/** "prompt-with-rationale" is Android's: asked and refused once, so the app should explain before asking again. */
export type PermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

export interface ContactPhone {
  /** As the address book stores it: no normalization, so "010-1234-5678" and "+82 10 1234 5678" both occur. */
  number: string;
  /** The label shown in the system Contacts app ("mobile", "home", a custom one), localized; null when unlabeled. */
  label: string | null;
}

export interface Contact {
  /** Stable for this contact on this device only. */
  id: string;
  /** The display name the system Contacts app shows; null when not projected or the contact has none. */
  name: string | null;
  /** Empty when not projected. */
  phones: ContactPhone[];
}

/** What to read for each contact. Both default to true; leave out what the screen does not need. */
export interface GetContactsOptions {
  projection?: { name?: boolean; phones?: boolean };
}

/**
 * Reads the device's address book (iOS Contacts, Android ContactsContract); there is no web or desktop
 * implementation, so every call there rejects with UNSUPPORTED.
 * - "granted" on iOS 18 also covers limited access: getContacts returns only the contacts the user shared.
 * - getContacts asks for permission first when it was never asked, and rejects with PERMISSION_DENIED when
 *   denied. INTERNAL when NSContactsUsageDescription is missing (iOS kills an app that asks without it).
 */
export interface ContactsApi {
  checkPermission(): Promise<{ contacts: PermissionState }>;
  /** Shows the system prompt when the state is "prompt" or "prompt-with-rationale"; otherwise returns the state. */
  requestPermission(): Promise<{ contacts: PermissionState }>;
  getContacts(options?: GetContactsOptions): Promise<{ contacts: Contact[] }>;
}

export const contacts = definePlugin<ContactsApi>("contacts", {
  methods: ["checkPermission", "requestPermission", "getContacts"],
});
