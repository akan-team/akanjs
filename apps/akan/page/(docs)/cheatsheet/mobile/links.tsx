import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";
import { FaLink } from "react-icons/fa";

export default function Page() {
  const { l } = usePage();
  const ExternalLink = ({ href, label }: { href: string; label: string }) => (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="ml-1 inline-flex size-5 -translate-y-px items-center justify-center rounded-full bg-foreground/50 align-baseline text-white transition-colors hover:bg-foreground/70"
      aria-label={label}
      title={label}
    >
      <FaLink className="size-2.5" />
    </Link>
  );

  return (
    <Scroll>
      <Scroll.Slide id="deep-link-setup" title={l.trans({ en: "Deep Link Setup", ko: "Deep Link Setup" })}>
        <Docs.Title>{l.trans({ en: "Deep Link Setup", ko: "Deep Link Setup" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Deep links open a CSR route from outside the app. Use schemes for app-only URLs and domains for verified HTTPS links. Push notification clicks use the same routing path through data.url.",
              ko: "Deep link는 앱 바깥에서 CSR route를 여는 기능입니다. 앱 전용 URL은 schemes를 쓰고, 검증된 HTTPS 링크는 domains를 씁니다. Push notification 클릭도 data.url을 통해 같은 라우팅 경로를 사용합니다.",
            })}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Think of deep link as the feature, and schemes/domains as the two common ways to implement it. Scheme links such as shop://orders/1 are easy to test and app-only. Domain links such as https://shop.example.com/orders/1 require iOS/Android verification, but they behave like normal web links and are better for sharing, emails, and push notification URLs.",
              ko: "Deep link는 기능 이름이고, scheme과 domain은 그 기능을 구현하는 대표적인 두 방식입니다. shop://orders/1 같은 scheme link는 테스트가 쉽고 앱 전용입니다. https://shop.example.com/orders/1 같은 domain link는 iOS/Android 검증 설정이 필요하지만 일반 웹 링크처럼 동작하므로 공유, 이메일, push notification URL에 더 적합합니다.",
            })}
          </Docs.Alert>
          <Code.Snippet
            title="apps/myapp/akan.config.ts"
            code={`const config: AppConfig = {
  mobile: {
    targets: {
      default: {
        deepLinks: {
          schemes: ["shop"],
          domains: ["shop.example.com"],
          ios: {
            teamId: "TEAMID",
          },
          android: {
            sha256CertFingerprints: [
              "AA:BB:CC:DD:...",
            ],
          },
        },
      },
    },
  },
};`}
          />
          <div className="space-y-1">
            {[
              {
                title: "schemes",
                desc: l.trans({
                  en: "Custom app-only URLs such as shop://orders/1. Easy to test, but not domain-verified.",
                  ko: "shop://orders/1 같은 앱 전용 URL입니다. 테스트하기 쉽지만 도메인 검증 링크는 아닙니다.",
                }),
              },
              {
                title: "domains",
                desc: l.trans({
                  en: "Verified HTTPS links such as https://shop.example.com/orders/1. iOS uses apple-app-site-association; Android uses assetlinks.json.",
                  ko: "https://shop.example.com/orders/1 같은 검증된 HTTPS 링크입니다. iOS는 apple-app-site-association, Android는 assetlinks.json을 사용합니다.",
                }),
                links: [
                  {
                    href: "https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app",
                    label: "Open Apple Universal Links docs",
                  },
                  {
                    href: "https://developer.android.com/training/app-links",
                    label: "Open Android App Links docs",
                  },
                ],
              },
              {
                title: "ios.teamId",
                desc: l.trans({
                  en: "Apple Developer Team ID used for universal link association files.",
                  ko: "universal link association file에 사용하는 Apple Developer Team ID입니다.",
                }),
              },
              {
                title: "android.sha256CertFingerprints",
                desc: l.trans({
                  en: "Signing certificate fingerprints used by Android app links. Debug builds and release builds usually have different fingerprints.",
                  ko: "Android app link 검증에 사용하는 서명 인증서 fingerprint입니다. Debug build와 release build는 보통 fingerprint가 다릅니다.",
                }),
              },
            ].map(({ title, desc, links }) => (
              <div key={title} className="rounded-xl border border-foreground/10 bg-background px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
                {links?.map((link) => (
                  <ExternalLink key={link.href} href={link.href} label={link.label} />
                ))}
              </div>
            ))}
          </div>
          <Code.Snippet
            title="Android debug SHA-256"
            language="bash"
            code={`keytool -list -v \\
  -keystore ~/.android/debug.keystore \\
  -alias androiddebugkey \\
  -storepass android \\
  -keypass android`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
