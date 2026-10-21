---
"akanjs": patch
---

An MCP App view whose read fails now says what the tool call would have answered, instead of always saying "The page failed to load.". A record removed since the call reads "No screen exists for these arguments.", a read the account may not make reads "This screen is not available to the signed-in account.", and anything else still reads "The page failed to load.". The server's refusals and the view now share these three messages.
