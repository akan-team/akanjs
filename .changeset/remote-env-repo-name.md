---
"@akanjs/cli": patch
---

`akan upload-env` and `akan download-env` in SCP mode refuse a repository name the remote shell would misread, before they ask for a server. The remote folder is `~/secrets/<repository name>`, and `ssh` hands `mkdir -p` that path through the server's login shell: a clone in a folder named `my repo` made two folders and then failed the copy, and a `;` in the name would have run what followed it. The name now has to be letters, digits, `.`, `_` and `-`, not starting with `.` or `-`; set `AKAN_PUBLIC_REPO_NAME` in the workspace `.env` to such a name if the folder or origin remote has another.
