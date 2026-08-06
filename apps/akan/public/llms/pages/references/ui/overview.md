# Overview

- Source: /references/ui/overview
- Mirror: /llms/pages/references/ui/overview.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- akanjs/ui (#akanjs-ui)
- Page Map (#page-map)

## Content

Overview

Core

The most common page-building primitives for routing, media, page shells, data loading, and model workflows.

Display

Display and feedback helpers for model lists, relative time labels, loading states, empty states, and tabular UI.

Forms

Form controls and action primitives used by templates, filters, and admin surfaces.

Overlays

Overlay, confirmation, menu, and copy helpers for focused user actions.

System

Application shell helpers, CSR guards, admin signal tools, tab state, and animation wrappers.

Customization

Re-skin any framework component per route with a `page/**/_overrides.tsx` manifest — drop-in replacements, no call-site changes.

akanjs/ui

`akanjs/ui` is the shared UI facet for Akan apps. It provides route-aware links, data loading wrappers, model UI shells, form controls, display helpers, overlays, and system-level app chrome.

This reference is organized by actual app/lib usage frequency. Common components get full pages first; rarely used exports are deferred until they become part of normal application patterns.

Page Map

Open the page that matches the UI layer you are working on. Each detail page uses one `Scroll.Slide` per component with usage examples and props notes.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

