---
"akanjs": patch
---

Toasts, the agent launcher, the open agent panel and the dev-mode Reconnect screen take their z-index from the same overlay scale as menus, popconfirms, tooltips, modals and approval cards, set as an inline style instead of an arbitrary class, at launcher 80, toast 140, panel 150, Reconnect 200. The launcher, at 150 in 3.0.2, now sits under every menu, modal and toast. An `AgentLauncher` override receives the launcher's layer as a new `style` prop.

Upgrade note: an `AgentLauncher` override that does not apply `style` to its root no longer gets the launcher's z-index; spread `style` there the way `className` already is.
