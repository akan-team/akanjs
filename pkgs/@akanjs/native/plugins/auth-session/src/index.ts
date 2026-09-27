import { definePlugin } from "../../../packages/core/src/index.ts";

export { checkStart, isCallback } from "./args.ts";

/**
 * OAuth / OpenID sign-in in the system browser (plugins.md §4.5, like Expo's
 * WebBrowser.openAuthSessionAsync): shows the provider's page and returns the redirect to
 * `callbackScheme` with the result (code, state, error) in its query or fragment. The app then
 * exchanges the code itself (PKCE); this plugin does not parse or validate the result.
 *
 * The callback scheme must be one of the app's deep link schemes (akan-native.config.ts
 * `deepLinks.schemes`): Android and macOS receive the redirect as a deep link, so the app's
 * `urlOpen` listeners see it too there. iOS catches it inside the session.
 *
 * | host    | how                                              | cancel detection                         |
 * |---------|--------------------------------------------------|------------------------------------------|
 * | iOS     | ASWebAuthenticationSession                       | the user closed the sheet                |
 * | Android | Custom Tab + deep link (plain browser if none)   | back in the app without the redirect     |
 * | macOS   | default browser + deep link (TAO Event::Opened)  | none: a new start() or 10 minutes        |
 * | web     | UNSUPPORTED                                      |                                          |
 *
 * The web has no custom-scheme callback to catch: web apps register an https redirect on their
 * own origin and read the result on that route (full-page redirect, or a popup posting to its
 * opener), which depends on the app's routing and is left to the app.
 */
export interface AuthSessionApi {
  /**
   * Resolves with the callback URL. Rejects CANCELLED when the user dismissed the page, came back
   * without finishing (Android), or a newer start() replaced this one; INVALID_ARGS for a bad URL
   * or scheme (Android also when the app does not handle the scheme). `ephemeral` (iOS) signs in
   * without the browser's cookies and skips the "wants to use … to sign in" prompt.
   * The callback that ends a start() is its result only: it does not also reach app.urlOpen, on any
   * platform. A link of the scheme that arrives with no start() waiting (or with another state) is
   * an ordinary deep link.
   */
  start(args: { url: string; callbackScheme: string; ephemeral?: boolean }): Promise<{ url: string }>;
}

export const authSession = definePlugin<AuthSessionApi>("auth-session", { methods: ["start"] });
