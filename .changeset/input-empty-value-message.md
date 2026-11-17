---
"akanjs": patch
---

`Input` (and `Field.Text` over it) drops its invalid message when the value is emptied, as `Input.TextArea`, `Input.Password` and `Input.Email` already did. A form the store cleared after a successful submit kept showing the length message of the value typed before.
