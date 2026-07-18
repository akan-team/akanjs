# UI Architecture

- Source: /docs/arch/frontend
- Mirror: /llms/pages/docs/arch/frontend.md
- Section: docs
- Category: Architecture
- Priority: P0

## Headings

- UI Architecture (#ui-overview)
- What Is Server-Side Rendering? (#server-side-rendering)
- Rendering Boundary (#rendering-boundary)
- Page Composition Pattern (#page-composition)
- Client State With st (#client-state-st)
- Server Calls With fetch (#server-calls-fetch)
- Generated Helpers Summary (#generated-client)
- i18n (#i18n)
- Client Targets (#client-targets)

## Content

UI Architecture

Akan UI is the user-facing interface layer of the app. When a customer opens a product page, a manager edits stock, or a partner checks orders from another client, the interface decides what appears immediately, what becomes interactive, and how user actions reach the backend.

Fast first screen

Server-rendered pages can show catalog, article, or dashboard content before the browser becomes interactive.

Interactive work

Client components handle forms, filters, stock changes, realtime dashboards, and browser/device APIs.

Generated helpers

Generated fetch, store, and model namespaces reduce hand-written API and state glue.

Many client surfaces

Customer web, admin console, partner site, and mobile apps can share backend logic while showing different screens.

What Is Server-Side Rendering?

Server-side rendering means the server prepares the first visible HTML before the browser finishes loading the full app. Users can see useful content earlier, even before every button, input, and realtime feature becomes interactive.

The server prepares

The server reads route, params, language, and initial data, then prepares the page users will see first.

The browser shows

The browser can paint meaningful content quickly, so users are not staring at an empty app shell.

The client activates

After the first view appears, client components attach event handlers for typing, clicking, filtering, and live updates.

SSR Timeline

The important point is that viewing and interacting do not have to happen at the exact same moment.

Server

Prepare first HTML from route, params, language, and initial data.

Browser View

Paint useful content quickly so the user can understand the page.

Client Areas

Activate forms, filters, modals, realtime updates, st, and fetch actions.

Business Example

On a shopping page, customers should see product names, prices, and the first list quickly. The add-to-cart button, stock filter, and recommendation carousel can become interactive after the first view is already visible.

SSR is not the opposite of client-side UI. It is the first step of the experience: show useful content early, then let client components handle the parts that need interaction.

Rendering Boundary

Before deciding server-side or client-side, think about two moments in the user experience: when the user can see useful content, and when the user can interact with it.

How quickly users can see meaningful content. A customer should see product names, prices, article text, or reservation details before every button becomes interactive.

How quickly users can type, click, filter, open modals, or receive realtime updates. These actions need browser-side state and event handlers.

Why Both Sides Exist

Server-side first content

Good for content users should understand immediately: catalog lists, article pages, pricing, profile summaries, and policy text.

Client-side working areas

Good for parts that must react to the user: stock forms, filters, chat input, dashboards, maps, camera, or local device APIs.

A Simpler Way To Decide

Start with what the user should see first, then add browser-side work only where the user actually interacts.

Show stable content

Render product names, article text, prices, summaries, and first lists on the server.

Wrap working areas

Use "use client" only around forms, filters, modals, realtime status, or device/browser APIs.

Connect actions

Use st for client state and fetch when the action needs a business answer from the server.

Start with a readable screen

If users should immediately see product names, prices, articles, or summaries, keep that part server-rendered.

Add client only for work

Use a client component when users type, click, open modals, filter lists, or keep a screen changing after load.

Put use client at the boundary

Do not turn the whole page into a client page by default. Put "use client" on the smallest component that needs interaction.

Mix them per screen area

A product page can be mostly server-rendered while only the filter, cart button, or stock form runs in the browser.

How To Split One Screen

Think of a screen as stable information plus working areas. Keep stable information server-rendered, then wrap only the working areas with a client component.

Stable information

Use this for content users should see right away: title, price, summary, first list, policy text, or article body.

Working area

Use "use client" here for forms, filters, modals, live status, stock actions, or anything that needs browser-side state.

Product catalog

Render the title and first products on the server so customers see content quickly.

Stock editor

Use a client component because the manager changes form values and clicks actions.

Live dashboard

Use client state and realtime updates because the screen keeps changing after load.

Page Composition Pattern

A typical business screen combines a server-rendered shell with client-side areas. A product listing page may render the title and first data on the server, then hand the list area to a client zone for pagination, filtering, realtime updates, or user actions.

Example model

A single model creates a predictable UI stack from page entry points to backend calls.

Business screens and URL-level entry points.

Reusable screen parts for display, forms, actions, and client zones.

Client-side state for lists, forms, selected records, and modals.

Generated calls that connect UI actions to backend signals.

signals, services, database

Typical Model Screen Flow

A model usually starts from a list screen. Users create a new record, open a detail page, then move to an edit page when they need to change existing data.

Index pages are optimized for discovery: search, scan, paginate, and choose an item.

New and edit pages focus on controlled input through Edit components and submit actions.

View pages present one record clearly, then expose follow-up actions like edit or related utilities.

Product listing

Show the page title and first products quickly, then let the client zone handle filtering, pagination, and updates.

Admin stock page

Render product summary on the server, then use a client form to add stock through generated fetch or store helpers.

Client State With st

After the page and components are clear, decide what state the browser owns. Use st for working state such as form values, selected rows, loading flags, filters, and derived labels.

Declare writable state that can change while the user works, such as stockDraft and saving.

Declare values computed from writable state, such as canSubmitStock from stockDraft and saving.

Read and update state inside store actions before and after business work.

Components subscribe to fields with st.use.*, and model forms use generated setters such as setNameOnProduct.

Use local component state for tiny UI-only details such as focus, hover, or a one-off input draft. Use st when several components share the value, when an action needs it, or when it should survive across a screen flow.

Server Calls With fetch

Use fetch after the component has collected enough state and the action needs a server-side business decision. The server declares a signal endpoint, Akan generates the client function, and the store action calls it.

Call fetch directly

Good for simple initial data or one-off reads where the component does not need to coordinate much state.

Wrap fetch in a store action

Good for forms and business actions because the action can read state, call fetch, then update loading, auth, list, or form state.

Keep business rules in the service. The client store should collect form state, call fetch, and update UI state; it should not duplicate password, permission, stock, or payment rules.

Generated Helpers Summary

Akan exposes app-specific helpers from @apps/<app>/client. After you understand the screen shape, st, and fetch, these helpers become the daily entry points for UI work.

How They Work Together

A page usually uses usePage for route and language context, Model.* for the domain UI pieces, st for browser-side state, and fetch when a user action needs a server-side business answer.

Reads and updates client state through generated hooks and actions.

Calls generated endpoints or prepares initial data for pages and zones.

Gives each domain a predictable place for Unit, View, Edit, Zone, and Util components.

Provides language, params, and page context for business screens.

You do not need to introduce all helpers at once. Start from the page and component, then add st only when state is shared, and add fetch only when the action needs a business response from the server.

i18n

Akan pages usually read the language helper from usePage, then render dictionary keys with l("model.dictKey"). This keeps UI text close to each domain dictionary instead of scattering raw strings through components.

Declare text once

Dictionary files hold the English and Korean text for a domain.

Use keys in UI

Components render l("user.signWithGoogle") instead of hard-coded text.

Share across clients

Customer, admin, partner, and mobile screens can reuse the same business vocabulary.

Client Targets

The same company may have a customer web site, an admin console, a partner portal, and a mobile field app. Akan UI architecture treats these as different client surfaces that can share backend logic while presenting different screens.

Web SSR

Use for public pages, landing pages, docs, product catalogs, and content that should appear quickly or be indexed well.

Web CSR

Use for app-like screens where most value comes after login: admin consoles, editors, realtime dashboards, and internal tools.

Multi-client web

Use when customer, admin, and partner screens need different routes, layouts, and permissions while sharing the same business services.

Mobile target

Use for field apps, mobile webviews, or device-oriented screens that still talk to the same generated fetch and business services.

Client target is a product decision before it is an infrastructure decision. First decide who uses the screen and what they need to do; Runtime And Infra explains where that client is deployed and routed.

Final Practical Checklist

Start with server-rendered pages when users should see meaningful content quickly.

Use client components only where interaction, state, realtime behavior, or browser/device APIs are needed.

Keep domain UI close to model modules, and use ui/ for app-wide reusable visual components.

Let generated fetch and st handle server communication and client state before writing custom API glue.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

