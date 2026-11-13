---
"akanjs": patch
"@akanjs/cli": patch
---

A toast now shows above a modal the floating `Agent.Chat` opened, and a question from the agent leaves focus and Escape to that modal.

- **Toasts top every overlay but Reconnect.** `overlayZ.toast` moves from 140 to 180, above the agent panel (150), a modal the panel opened (160) and one a card opened (170), so a toast reporting what that modal's controls did is no longer hidden behind it.
- **A question no longer pulls focus out of an overlay.** When `askUser` puts a question up while focus sits in a modal, sheet, menu or popconfirm, focus stays there, so typing meant for the modal no longer lands in the composer and Enter no longer sends it as the answer. Opening the panel still focuses the composer.
- **Escape closes one layer at a time.** With a modal, sheet or popconfirm open from the panel or from a card, Escape in the composer closes that overlay through its own close, `confirmClose` included, and only the next Escape closes the panel. It used to close the panel and the modal together, skipping `confirmClose`.
