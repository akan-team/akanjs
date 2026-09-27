const gtagSnippet = (id: string) =>
  `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', ${JSON.stringify(id)});`;

interface GtagProps {
  id: string;
}

export const Gtag = ({ id }: GtagProps) => {
  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${id}`} />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: gtag.js reads window.dataLayer and the config call, so the vendor bootstrap has to reach the browser as a raw script */}
      <script dangerouslySetInnerHTML={{ __html: gtagSnippet(id) }} />
    </>
  );
};
