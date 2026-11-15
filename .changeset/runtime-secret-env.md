---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan build` no longer puts the secret values of `env/env.server.<env>.ts` into the server it builds. The server reads each one from an environment variable when it starts, and says at boot which ones its deployment has not set.

- **What counts as a secret.** A string under a secret-sounding key (password, secret, token, apiKey, privateKey, accessKey, webhook, …), at any depth below it, or a URL with a password in it. It is the rule a desktop profile build already applies and the logger masks by, now also for a key named `aesKey`. Numbers, booleans, `null` and every other string stay in the build as before.
- **Where it is read from.** A variable named after the value's place in the env file, one upper snake case segment per key joined with `__`: `security.sso.google.clientSecret` is read from `SECURITY__SSO__GOOGLE__CLIENT_SECRET`. An array holding a secret is read whole from one variable holding JSON (`discord.tokens` from `DISCORD__TOKENS`). Four settings keep the names the framework already reads: `security.jwtSecret` is `JWT_SECRET`, and `database.postgres.url`, `.password` and `.insightUrl` are `POSTGRES_URL` (or `POSTGRES_URI`), `POSTGRES_PASSWORD` and `POSTGRES_INSIGHT_URL`. In `process.env.MY_VAR ?? "literal"` only the literal is replaced, so your own variable still comes first.
- **What the build writes.** `akan.env.json` and the Dockerfile gain `AKAN_ENV_NAMES`, the names the server reads (never a value), and the build prints them.
- **`akan secret-env <app> [--env <env>]`** lists each variable, its kind, its key in the env file and whether the shell sets it. With `--out <file>` it writes the values from the env file: `--format k8s` (the default) a Kubernetes Secret named by `--name` (default `<app>-env`), `--format dotenv` `NAME=value` lines that Bun's loader reads back unchanged. The file is readable by its user alone; a path under `dist/`, a path git would track, and an existing file without `--force` are refused.
- **At boot** (`AkanApp.start`, before the server is loaded or a replica is spawned) a variable that is not set is one warning naming every such variable. The framework does not stop for them, though whatever reads a value may, as a missing `JWT_SECRET` does. A JSON variable that does not parse is refused with the code `secretEnvInvalid`. A multi-line value that arrives with a backslash and an n in place of its line breaks is warned about by name.
- **What stops a build.** A secret-named key whose value the env file computes or imports rather than writes as a string stops the build before it writes anything, whatever the value's length, naming the app, the env file and the keys. After the bundles are written, the build looks in them for each secret string it left out: a long mixed one that another key of the env, the app's code or a copied file holds as well stops the build by its keys, and a short or plain one is a warning. No message prints a value.
- **Type errors in an env file.** `akan build`, `akan typecheck` and `akan verify` report a TypeScript error in `env/env.server.*.ts` or `env/env.client.*.ts` by file, line, column and code alone, with the source line and TypeScript's message left out because either can quote a value.
- **Lint output.** `akan lint` and `akan verify` report a diagnostic in `env/env.server.*.ts` or `env/env.client.*.ts` by file, line, column and rule, with no code frame, formatter diff or rule message; those files are still linted and formatted, and their errors still fail the run. A lint run that fails now exits with the code of a failed check (3).
- **Your own `process.env` reads stay yours.** A secret-named key the env file reads from `process.env.<NAME>` itself is left as that read: the build does not move it, does not stop at it, and writes no value of it, whether or not the build's shell sets the variable.
- **How the build finds the secrets.** It loads the env file, first with none of the shell's variables, so the list is the same from any shell, and with them when the file cannot load without (`process.env.HOSTS!.split(",")`). A file that loads neither way stops the build with the error's class and its file and line, never its message. Loading has a 60 second limit.
- **Unchanged:** your env files, `akan start`, `akan test`, `--profile` builds, and desktop and mobile builds, whose carried server still bundles its env file as written.

**Upgrading.** This changes how every app deploys. Before you deploy an image built with this version:

1. Run `akan secret-env <app> --env <env>` for each app and environment you deploy. It lists the variables the server now expects. It prints names, never values.
2. Give the server those variables.
   - Kubernetes: `akan secret-env <app> --env <env> --format k8s --name <secret-name> --out <file>`, `kubectl apply -f <file>` in the app's namespace, reference the Secret from the container with `envFrom: [{ secretRef: { name: <secret-name> } }]`, then delete the file.
   - Docker: `docker run -e NAME=value …`. `docker run --env-file` takes each line as written, so of a `--format dotenv` file it reads the values written without quotes and no quoted or multi-line one: pass those with `-e`.
   - `bun main.js` on a host: `bun --env-file=<file> main.js` with the dotenv file, or set the variables in the service's environment. Keep the file outside `dist/apps/<app>`, which the image copies whole.
   - Another platform: set them in its secret settings.
3. Deploy. At start the server logs one warning naming any variable it is missing. The framework does not stop for it, though whatever reads the value may. Version 3.5.0 will refuse to start instead.
4. When the new images are live, rotate those secrets and delete the old image tags. Images built before this version still contain the values.
5. If you cannot change your deployment yet, build with `akan build <app> --inline-secrets`. The image then carries the values as before, and a variable you set still wins. When the env file cannot be loaded, this build warns and bundles the env files as written, reading no variable. Version 3.5.0 removes the flag.
6. If a build stops with "holds … this build cannot leave out", each named key is computed or imported in the env file. Write the string at the key, or write `process.env.<NAME>` there and set that variable in the deployment.
7. If a build stops with "holds secret values the server reads from its process env", a secret string is also somewhere the build keeps as written: the plain key the message names, the app's code, or a copied file. Take it out there, or read it there from the same variable.
8. If a build stops with "could not be evaluated to check it for secrets", the env file throws at the named line when it is loaded. Set the variable it reads there in the build's shell, or give it a fallback.
9. If a build stops at a key "a build would read from the environment variable …", two keys map to one variable name, or the name is one the platform or akan owns (`PWD`, `HOSTNAME`, `AKAN_*`, …). Rename the key, or write `process.env.<NAME>` there yourself.

A key file an env value points at by path (an Apple sign-in key under `private/`) is not an env value and still ships in the image: mount it instead. A key the rule does not recognise (`stripeKey`, a `salt`) stays in the build; write `process.env.<NAME>` for it.
