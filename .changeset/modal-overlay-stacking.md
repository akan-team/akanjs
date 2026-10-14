---
"akanjs": patch
---

A modal stacks above every overlay already on the page (`overlayZ.modal`, 120), and a dropdown, select, popconfirm or nested modal opened inside one lands in the modal's own root, above its panel, instead of under it on `<body>`. Toasts move to 140 so they stay above modals. A dropdown now closes when an item whose own trigger stops the click is chosen, and a popconfirm opened from a dropdown item leaves the menu open. A click into a text field, select or combobox inside a dropdown's menu no longer closes it. Upgrade note: an app element that relied on a z-index between 10 and 120 to sit above a modal now stays under it.
