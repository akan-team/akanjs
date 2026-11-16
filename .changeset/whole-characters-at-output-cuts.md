---
"akanjs": patch
---

A page no longer shows a broken character where React's output buffer ends. React writes a page's HTML in 4 KB pieces cut by bytes; when the piece that carried the document's head ended inside a character of more than one byte (Korean, Japanese, an accented letter, an emoji), that character arrived as replacement marks and a stray one closed the document. It depended on where the text fell, so the same page could be right on one request and wrong on the next.
