---
"akanjs": minor
"@akanjs/cli": patch
---

A modal opened from inside the floating `Agent.Chat` now stacks above the panel, and the panel's header takes a node for its title and names its parts.

- **Overlays opened from the floating panel stack above it.** A `Modal`, `BottomSheet`, `Popconfirm`, `Dropdown`, `Select` or `Tooltip` rendered anywhere inside the panel, the `header` slot included, portals into a layer just above the panel (`overlayZ.agentPanelOverlay`, 160). It used to land under the panel, whose z-index (150) tops a page's modals (120). One the page opens still stays under the panel. An `inline` chat hands down whichever portal it sits in, as before, so a modal around it still hosts what it opens.
- **`title` takes a `ReactNode`**, so a mark can go before the name. A new `label` names the panel for screen readers when `title` is not plain text; without either, the name is `l("base.agent")`, and a string `title` names the panel as before.
- **The header's parts carry `data-slot` hooks**: `agent-header` on the bar, `agent-title` on the title and `agent-running` on the dot shown while a turn runs. Restyle one through them, for example `panelClassName="[&_[data-slot=agent-running]]:bg-accent"`, rather than through the markup's shape.
- **The header rule is `border-border`**, as other framework surfaces draw their rules, instead of `border-foreground/5`.

**Upgrading.** An `AgentChat` override that types `title` as `string` must take `ReactNode`. A modal an app mounted beside the Chat and opened from the panel's `header` still opens under the panel; mount it inside `header` to bring it above.
