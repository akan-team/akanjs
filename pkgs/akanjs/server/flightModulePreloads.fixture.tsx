import { registerClientReference, renderToReadableStream } from "react-server-dom-webpack/server.node";

const clientManifest = JSON.parse(process.argv[2] ?? "{}");
const reference = (key: string) => {
  const [id = "", name = ""] = key.split("#");
  return registerClientReference(
    () => {
      throw new Error(`${name} is a client component`);
    },
    id,
    name,
  ) as (props: { title?: string }) => null;
};
const Card = reference("apps/demo/ui/Card.tsx#Card");
const Badge = reference("apps/demo/ui/Badge.tsx#Badge");

const stream = await renderToReadableStream(
  <main>
    <Card title="/_akan/client/menu-c3.js" />
    <p>/_akan/client/menu-c3.js</p>
    <Badge />
    <Card title="again" />
  </main>,
  clientManifest,
);
process.stdout.write(await new Response(stream).text());
