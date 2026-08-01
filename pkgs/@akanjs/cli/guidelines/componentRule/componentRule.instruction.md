# Akan Component Rule Guideline

## Purpose
Use this for shared UI rules across module, scalar, app UI, and docs components.

## Ownership
- Accept `className?: string` for reusable components and forward it through `clsx`.
- Use semantic HTML and accessible labels for interactive elements.
- Use `akanjs/ui` and project UI libraries before adding new primitives.
- Keep presentation components small; move page composition to Zone and actions to Util or store.

## Current Akan Patterns
- Unit renders compact repeated display, View renders full detail display, Template renders form fragments, Util renders small controls, Zone composes page sections.
- Server components should stay display-only unless the file convention says otherwise.
- Client components can use store hooks and event handlers where interaction is required.
- Use generated model types from app client or module constants; do not invent duplicate UI-only model shapes.

## Customizing Framework Components (Slot Overrides)
- When a default `akanjs/ui` component (Button, Select, Modal, Table, Input, Radio, DatePicker, Loading, …) is too restrictive for the design, re-skin it per route with a slot override instead of forking, wrapping every call site, or fighting it with `!important`.
- Write the drop-in replacement in `apps/<app>/ui/`, typed against the slot contract — `AkanModalComponent`, or `AkanUiOverrides["<Slot>"]` for any other slot — so it is compile-checked as a real substitute. Compose the framework's headless parts (e.g. `Dialog`) rather than re-implementing focus trapping, portals, or scroll-lock.
- Bind it in a logic-free `page/**/_overrides.tsx` manifest: imports plus a single `export default override({ Slot: BrandComponent })` (from `akanjs/ui`), no `"use client"`.
- Place the manifest at `page/` for an app-wide skin, or inside a route group/segment to scope it; nested manifests merge over ancestors slot-by-slot (closest ancestor wins, unlisted slots keep inheriting).
- Compound components expose one slot per leaf named `<Base><Sub>` (e.g. `InputPassword`, `RadioItem`, `LoadingSpin`); override only the leaves you need.
- See the `references/ui/customize` docs page for the full slot list and examples.

## Codegen Rules
- Do not put business workflow decisions in render code.
- Do not use undocumented UI components or props.
- Do not use hardcoded colors when DaisyUI semantic classes work.
- Do not create broad component abstractions before repeated patterns exist.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
