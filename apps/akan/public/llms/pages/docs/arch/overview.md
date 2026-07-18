# Architecture Overview

- Source: /docs/arch/overview
- Mirror: /llms/pages/docs/arch/overview.md
- Section: docs
- Category: Architecture
- Priority: P0

## Headings

- Architecture Overview (#architecture-overview)
- One App, Many Surfaces (#many-surfaces)
- The Main Runtime Conversation (#runtime-conversation)
- Architecture Areas (#architecture-areas)
- How To Read The Architecture Docs (#reading-guide)

## Content

Architecture Overview

Akan architecture starts from the product behavior, not from a separate frontend, backend, mobile, and infrastructure checklist. A customer sees a screen, takes an action, business rules decide what should happen, data changes, other clients may be notified, and the same app can be packaged for web, mobile, cloud, or edge environments.

Core Philosophy

Write business behavior first, then let generated helpers reduce API and state glue.

Use one business service layer for many client surfaces: SSR web, CSR web, admin, partner, and mobile.

Choose the deployment shape after the product needs it: local first, then cloud, edge, or hybrid.

One App, Many Surfaces

Akan is designed for products that rarely have only one screen. A store customer page, an admin console, a partner client, a mobile app, and an edge device workflow can present different interfaces while sharing the same rules and data.

Surface Map

SSR pages, CSR pages, admin clients, partner clients, and mobile CSR clients.

Generated fetch, st, Model, and usePage helpers connect screens to business behavior.

Signal receives calls, service decides rules, and document handles stored data.

The same product can run locally, in cloud clusters, near devices at the edge, or inside mobile packages.

The point is not to force every client to look the same. The point is to let different clients reuse the same business truth while presenting the right workflow for each audience.

The Main Runtime Conversation

Most Akan features can be understood as a conversation between the interface and the business service. The interface shows useful content and captures intent. The business service receives a safe request, decides the rule, changes data, and may trigger background or realtime follow-up work.

User sees or acts

SSR helps the first view appear early. Client components handle typing, clicking, filtering, chat, maps, camera, and local state.

Generated helpers call the service surface

fetch calls signal endpoints, st manages client state, Model namespaces keep model usage typed, and usePage handles i18n.

Signal routes intent

Signal is the callable surface for endpoint, slice, and internal work. It applies boundaries before sending valid work to services.

Service decides business behavior

Services coordinate rules, stored data, external APIs, dependency injection, background work, and realtime publication.

Document and runtime complete the loop

Documents define schema, query, sort, methods, and statics. Runtime and infra decide where the work is reached and executed.

Architecture Areas

The detailed architecture pages explain each area more deeply. This overview keeps the map small: each area owns a different kind of decision, and the product becomes clear when those decisions stay in the right place.

UI Architecture

Explains first view, SSR, rendering boundary, client components, st, fetch, generated helpers, i18n, and client targets.

Business Service Architecture

Explains signal, service, document, request/response work, cron/background work, report generation, and realtime scenarios.

Infra Architecture

Explains local, cloud cluster, edge, master, traffic paths, database mode, and growth stages.

Mobile Architecture

Explains CSR web inside Capacitor, multi-client basePath targets, local CSR testing, pageConfig, and Android/iOS packaging.

Styling Foundation

Explains Tailwind CSS, DaisyUI, design system thinking, theme declaration, and font declaration.

How To Read The Architecture Docs

You do not need to read every architecture page before building. Start from the decision you are facing, then move to the page that owns that decision.

I need to design the first screen or client behavior

I need server-side rules, APIs, queue, cron, or realtime work

I need to choose local, cloud, edge, database, or deployment shape

I need to package a CSR client as Android or iOS

I need consistent component style, theme, or font rules

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

