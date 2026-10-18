---
"@akanjs/cli": minor
---

`akan code` compacts on its own at a share of the context window you choose, in steps of 10%. `/autocompact 60` sets it for the session and says where compaction now starts (`compacts above 600k of 1000k`), `akan code --compact-at 60` (`-c`) starts with it, and an RPC host sends `{ type: "set_auto_compact", percent: 60 }`. `100`, or no percent, keeps the default, which waits until 32k of the window remain for the reply; a share closer to the edge than that compacts there instead. The choice rides the session frame as `autoCompactAt` and the prompt's lower rule as `compacts at 60%`. A share whose threshold falls under the 20k of recent turns every compaction keeps is refused, and after a `/model` switch to a smaller window it falls back to the default with a warning.
