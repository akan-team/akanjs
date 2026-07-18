interface Dict {
  appName: string;
  owner?: string;
  repoName: string;
}
export default function getContent(_scanInfo: null, dict: Dict) {
  const codespacesUrl = `https://codespaces.new/${dict.owner}/${dict.repoName}?quickstart=1`;
  const codespacesBadge = dict.owner
    ? `[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](${codespacesUrl})`
    : "";

  return {
    filename: "README.md",
    content: `${codespacesBadge}
# ${dict.repoName}

This workspace was created with [Akan.js](https://akanjs.com), a Bun-first full-stack TypeScript framework.

Akan lets you write business code once and connect it across web, server, fetch clients, state, database contracts,
and deployment artifacts with strict conventions.

## Quick Start

Install dependencies:

\`\`\`bash
bun install
bun install -g @akanjs/cli
\`\`\`

Start the app:

\`\`\`bash
akan start ${dict.appName} --open
\`\`\`

Build for production:

\`\`\`bash
akan build ${dict.appName}
\`\`\`

## Project Structure

\`\`\`text
apps/${dict.appName}/
|-- akan.config.ts      # app configuration
|-- page/               # route pages
|-- lib/                # app domain modules
|-- ui/                 # app UI components
|-- env/                # runtime environment contracts
\`-- public/             # static assets

libs/                   # shared libraries for multiple apps
pkgs/                   # local packages, if your workspace grows into them
\`\`\`

## Where To Start

- Edit \`apps/${dict.appName}/page/_index.tsx\` to change the first page.
- Edit \`apps/${dict.appName}/akan.config.ts\` when the app needs routes, domains, base paths, or deployment options.
- Add business modules under \`apps/${dict.appName}/lib/\` when your app needs typed domain logic.

## Useful Commands

\`\`\`bash
akan start ${dict.appName}
akan build ${dict.appName}
akan lint ${dict.appName}
\`\`\`

## Learn More

- Akan.js docs: https://akanjs.com/docs
- Package: https://www.npmjs.com/package/akanjs
`,
  };
}
