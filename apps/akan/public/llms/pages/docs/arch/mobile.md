# Mobile App Architecture

- Source: /docs/arch/mobile
- Mirror: /llms/pages/docs/arch/mobile.md
- Section: docs
- Category: Architecture
- Priority: P0

## Headings

- Mobile App Architecture (#mobile-overview)
- Mobile Targets (#mobile-targets)
- CSR Runtime (#csr-runtime)
- Native Bridge (#native-bridge)

## Content

Mobile App Architecture

Akan mobile apps are CSR web clients running inside a Capacitor native shell. The product screen is still built with Akan page, UI, state, and service patterns; Capacitor supplies the native project, app identity, store package, and device bridge.

One UI surface

Web and mobile share the same Akan page tree, client router, generated fetch calls, dictionaries, and UI components.

Native shell boundary

Native code owns packaging, signing, app capabilities, plugin linking, and store distribution.

Shared backend

Android, iOS, and web clients call the same Akan services and can share auth, permission, database rules, and app-level domains.

Mobile Targets

A mobile target is one native package built from an Akan app. A single Akan app can publish multiple mobile packages by pointing each target at a different basePath while reusing the same backend modules.

Use targets when packages need different app IDs, display names, entry surfaces, permissions, deep links, or store release tracks.

CSR Runtime

Inside the native shell, Akan uses the CSR router and mobile page frame. Page transitions, safe area, navbar/bottom inset layers, keyboard accessories, and page cache are handled at the client runtime layer instead of requiring a native UI rewrite.

Controls CSR page motion so mobile navigation can feel closer to native apps.

Handles OS system areas such as notches, home indicators, and Android system bars.

Separates app chrome such as navbars, tabs, fixed actions, and keyboard accessories from page content.

Native Bridge

Device capabilities are accessed through Capacitor plugins. Akan keeps the app-level API small: declare the needed native capability, sync/build the native project, then call the matching client hook or plugin wrapper from the CSR app.

Permissions describe which native capabilities a mobile target intends to use.

Native config files such as Firebase config are copied from the app folder into generated native project paths.

Native schemes, universal links, and app links enter the Akan CSR router as normalized routes.

Push delivery uses Firebase/FCM setup, while click routing uses a standard data.url field.

For concrete setup steps, see

Cheatsheet > Development > Mobile

.

## Code Examples

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [
    { domains: { main: ["example.com"] }, basePath: "store" },
    { domains: { main: ["example.com"] }, basePath: "admin" },
  ],
  mobile: {
    appName: "Example App",
    appId: "com.example.app",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      store: { basePath: "store", appName: "Example Store", appId: "com.example.store" },
      admin: { basePath: "admin", appName: "Example Admin", appId: "com.example.admin" },
    },
  },
};

export default config;
```

### page/store/product/[productId].tsx

```ts
import type { PageConfig } from "akanjs/client";
import { Layout } from "akanjs/ui";

export default function Page() {
  return (
    <>
      <Layout.Navbar back>Product detail</Layout.Navbar>
      <div>Product detail</div>
    </>
  );
}

export const pageConfig = {
  transition: "stack",
} satisfies PageConfig;
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

