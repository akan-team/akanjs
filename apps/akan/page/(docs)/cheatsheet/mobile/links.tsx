import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, ExternalLink, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const linkKinds = [
    {
      key: "schemes",
      title: l.trans({ en: "Scheme link", ko: "scheme 링크" }),
      example: "shop://orders/1",
      desc: l.trans({
        en: "An app-only link. It needs no verification, so it is the easy one to test during development.",
        ko: "앱 전용 링크입니다. 검증이 필요 없어 개발 중에 테스트하기 쉽습니다.",
      }),
    },
    {
      key: "domains",
      title: l.trans({ en: "Domain link", ko: "domain 링크" }),
      example: "https://shop.example.com/orders/1",
      desc: l.trans({
        en: "Works like a normal web link but needs iOS and Android verification. Best for sharing, email and push URLs.",
        ko: "일반 웹 링크처럼 동작하지만 iOS·Android 검증이 필요합니다. 공유, 이메일, 푸시 알림 URL에 더 적합합니다.",
      }),
    },
  ];

  const landingItems = [
    {
      name: "shop://orders/1",
      desc: l.trans({
        en: "Scheme link. `orders` becomes the first path segment, so it opens `/orders/1`.",
        ko: "scheme 링크입니다. `orders`가 경로의 첫 부분이 되어 `/orders/1`을 엽니다.",
      }),
    },
    {
      name: "https://shop.example.com/orders/1",
      desc: l.trans({
        en: "Domain link. The path is used as is and opens `/orders/1`.",
        ko: "domain 링크입니다. 경로를 그대로 써서 `/orders/1`을 엽니다.",
      }),
    },
    {
      name: 'data.url = "/orders/1"',
      desc: l.trans({
        en: "A tapped push notification. It opens `/orders/1` the same way.",
        ko: "푸시 알림을 누른 경우입니다. 같은 방식으로 `/orders/1`을 엽니다.",
      }),
    },
  ];

  const fieldItems = [
    {
      key: "deepLinks.schemes",
      type: "string[]",
      desc: l.trans({
        en: "App-only URL schemes, such as `shop` in `shop://orders/1`.",
        ko: "`shop://orders/1`의 `shop`처럼 앱 전용 URL scheme입니다.",
      }),
      example: 'deepLinks: { schemes: ["shop"] }',
    },
    {
      key: "deepLinks.domains",
      type: "string[]",
      desc: l.trans({
        en: "Hosts whose HTTPS links open the app once iOS and Android verify them.",
        ko: "HTTPS 링크를 앱으로 여는 호스트입니다. iOS와 Android가 검증한 뒤에 동작합니다.",
      }),
      example: 'deepLinks: { domains: ["shop.example.com"] }',
    },
    {
      key: "ios.teamId",
      type: "string",
      desc: l.trans({
        en: "Your Apple Developer Team ID. iOS uses it to verify `domains`.",
        ko: "Apple Developer Team ID입니다. iOS가 `domains`를 검증할 때 씁니다.",
      }),
      example: 'ios: { teamId: "TEAMID" }',
    },
    {
      key: "android.sha256CertFingerprints",
      type: "string[]",
      desc: l.trans({
        en: "SHA-256 fingerprints of the certificates that sign the app. Android uses them to verify `domains`.",
        ko: "앱을 서명한 인증서의 SHA-256 fingerprint입니다. Android가 `domains`를 검증할 때 씁니다.",
      }),
      example: 'android: { sha256CertFingerprints: ["AA:BB:CC:DD:..."] }',
    },
  ];

  const platformColumns = [
    { key: "ios", label: "iOS" },
    { key: "android", label: "Android" },
  ];
  const fieldGroups = [
    {
      label: l.trans({ en: "Scheme links", ko: "scheme 링크" }),
      rows: [{ name: "deepLinks.schemes", marks: { ios: true, android: true } }],
    },
    {
      label: l.trans({ en: "Domain links", ko: "domain 링크" }),
      rows: [
        { name: "deepLinks.domains", marks: { ios: true, android: true } },
        { name: "ios.teamId", marks: { ios: true } },
        {
          name: (
            <>
              android.
              <wbr />
              sha256CertFingerprints
            </>
          ),
          marks: { android: true },
        },
      ],
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="deep-link-setup" title={l.trans({ en: "Deep Link Setup", ko: "딥 링크 설정" })}>
        <Docs.Title>{l.trans({ en: "Deep Link Setup", ko: "딥 링크 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A deep link opens a specific screen of the app from a URL outside it, such as a link in a message or a
                  tapped push notification. You set it up once, in the <code>native</code> section of{" "}
                  <code>akan.config.ts</code>: <code>deepLinks</code> names the links, and <code>ios</code> and{" "}
                  <code>android</code> hold what verifies a domain.
                </span>
              ),
              ko: (
                <span>
                  딥 링크는 앱 바깥의 URL로 앱 안의 특정 화면을 바로 여는 기능입니다. 메시지 속 링크나 푸시 알림을
                  누르면 해당 화면이 열립니다. 설정은 <code>akan.config.ts</code>의 <code>native</code> 섹션에서
                  끝납니다. <code>deepLinks</code>가 링크를 정하고, <code>ios</code>와 <code>android</code>가 도메인을
                  검증할 값을 가집니다.
                </span>
              ),
            })}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Two Kinds Of Link", ko: "링크 방식 두 가지" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Deep link is the feature; <code>schemes</code> and <code>domains</code> are the two usual ways to
                  build it. You can declare both:
                </span>
              ),
              ko: (
                <span>
                  딥 링크는 기능 이름이고, <code>schemes</code>와 <code>domains</code>는 그것을 구현하는 대표적인 두
                  방식입니다. 둘을 함께 선언해도 됩니다:
                </span>
              ),
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {linkKinds.map((kind) => (
              <div key={kind.key} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {kind.title} · <code>{kind.key}</code>
                </div>
                <code className={chip}>{kind.example}</code>
                <div className="mt-2 text-foreground/70 text-sm">{kind.desc}</div>
              </div>
            ))}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Declare It", ko: "설정하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Write <code>deepLinks</code> in <code>native</code>, and the values that verify a domain in its{" "}
                  <code>ios</code> and <code>android</code> sections:
                </span>
              ),
              ko: (
                <span>
                  <code>native</code>에 <code>deepLinks</code>를 적고, 도메인을 검증할 값은 그 안의 <code>ios</code>와{" "}
                  <code>android</code> 섹션에 적습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  native: {
    deepLinks: {
      schemes: ["shop"],
      domains: ["shop.example.com"],
    },
    ios: { teamId: "TEAMID" },
    android: { sha256CertFingerprints: ["AA:BB:CC:DD:..."] },
  },
};

export default config;`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every target takes them.</strong> A target that sets <code>schemes</code> or{" "}
                    <code>domains</code> replaces that list; it does not add to it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 target이 이 값을 받습니다.</strong> target이 <code>schemes</code>나{" "}
                    <code>domains</code>를 적으면 그 목록을 바꾸며, 이어 붙이지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Hosts only in <code>domains</code>.
                    </strong>{" "}
                    Write <code>shop.example.com</code>; an <code>https://</code> or a path you add is dropped.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>domains</code>에는 호스트만.
                    </strong>{" "}
                    <code>shop.example.com</code>처럼 적습니다. <code>https://</code>나 경로는 붙여도 무시됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>ios.teamId</code> and <code>android.sha256CertFingerprints</code> serve <code>domains</code>
                      .
                    </strong>{" "}
                    If you only use scheme links, leave both out.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>ios.teamId</code>·<code>android.sha256CertFingerprints</code>는 <code>domains</code>
                      용입니다.
                    </strong>{" "}
                    scheme 링크만 쓴다면 둘 다 생략합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Rerun the app to apply.</strong> After a change, run <code>akan start-ios</code> or{" "}
                    <code>akan start-android</code> again.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>앱을 다시 실행해야 적용됩니다.</strong> 설정을 바꾼 뒤에는 <code>akan start-ios</code>나{" "}
                    <code>akan start-android</code>를 다시 실행합니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Where A Link Lands", ko: "링크가 여는 화면" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A scheme link, a domain link and a push notification's <code>data.url</code> all open the same CSR
                  route:
                </span>
              ),
              ko: (
                <span>
                  scheme 링크, domain 링크, 푸시 알림의 <code>data.url</code>은 모두 같은 CSR route를 엽니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Incoming link", ko: "들어온 링크" })}
            descLabel={l.trans({ en: "What it opens", ko: "여는 화면" })}
            items={landingItems}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  <strong>Back works after a cold start.</strong> When a link launches the app, the parent screen or the
                  start screen is stacked first, so back stays inside the app.
                </span>
              ),
              ko: (
                <span>
                  <strong>꺼진 앱에서 열려도 뒤로 가기가 됩니다.</strong> 링크로 앱이 켜지면 상위 화면이나 시작 화면을
                  먼저 쌓아, 뒤로 가기가 앱 안에서 동작합니다.
                </span>
              ),
            })}
          </div>
          <Docs.LinkGrid
            items={[
              {
                href: "/cheatsheet/mobile/setup#native-config",
                title: l.trans({ en: "Native Config", ko: "native 설정" }),
                desc: l.trans({
                  en: "Targets and the rest of the `native` block.",
                  ko: "target과 `native` 블록의 나머지 설정.",
                }),
              },
              {
                href: "/cheatsheet/mobile/push#client-registration",
                title: l.trans({ en: "Push Notifications", ko: "푸시 알림" }),
                desc: l.trans({
                  en: "Sending a `url` so a tap lands on a screen.",
                  ko: "알림을 누르면 화면이 열리도록 `url`을 보내는 법.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="deep-link-fields" title={l.trans({ en: "Link Fields", ko: "링크 필드" })}>
        <Docs.Title>{l.trans({ en: "Link Fields", ko: "링크 필드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Every field is optional. Each platform reads only what it needs, so declare only what your link style requires:",
              ko: "모든 필드는 선택입니다. 플랫폼마다 필요한 값만 읽으므로, 고른 링크 방식에 필요한 것만 적으면 됩니다:",
            })}
          </div>
          <Docs.OptionTable items={fieldItems} />

          <Docs.SubSubTitle>
            {l.trans({ en: "What Each Link Style Needs", ko: "링크 방식별로 필요한 필드" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Scheme links need one field. Domain links need three, and each platform reads its own part:",
              ko: "scheme 링크는 필드 하나면 되고, domain 링크는 세 개가 필요합니다. 플랫폼은 그중 자기 몫만 읽습니다:",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Field", ko: "필드" })}
            columns={platformColumns}
            groups={fieldGroups}
            markLabel={l.trans({ en: "Read by this platform", ko: "이 플랫폼이 읽음" })}
            emptyLabel={l.trans({ en: "Not read", ko: "읽지 않음" })}
          />

          <Docs.SubSubTitle>{l.trans({ en: "Domain Verification", ko: "도메인 검증" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A domain link opens the app only after the platform confirms that the app belongs to the domain. It checks a file served from that domain:",
              ko: "domain 링크는 그 도메인이 이 앱의 것임을 플랫폼이 확인한 뒤에야 앱으로 열립니다. 확인은 도메인이 내려주는 파일로 합니다:",
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The Akan server serves both files.</strong> It answers{" "}
                    <code>/.well-known/apple-app-site-association</code> and <code>/.well-known/assetlinks.json</code>{" "}
                    from these fields, so point the domain at your app's server and redeploy it after a change.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>두 파일은 Akan 서버가 응답합니다.</strong> 이 필드로{" "}
                    <code>/.well-known/apple-app-site-association</code>과 <code>/.well-known/assetlinks.json</code>을
                    만들어 주므로, 도메인이 앱 서버를 가리키게 하고 필드를 바꾸면 서버도 다시 배포합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>iOS checks the Team ID and appId.</strong> The file lists <code>{"<teamId>.<appId>"}</code>{" "}
                    from <code>ios.teamId</code> and the target's <code>appId</code>, so both must be your real values.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>iOS는 Team ID와 appId를 봅니다.</strong> 파일에 <code>ios.teamId</code>와 target의{" "}
                    <code>appId</code>로 만든 <code>{"<teamId>.<appId>"}</code>가 들어가므로 둘 다 실제 값이어야 합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Android checks the signing certificate.</strong> Debug and release builds are signed by
                    different keys, so list both fingerprints.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Android는 서명 인증서를 봅니다.</strong> debug 빌드와 release 빌드는 서로 다른 키로
                    서명되므로 fingerprint를 둘 다 적습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A debug build verifies only against a non-main server.</strong> Its package ends in{" "}
                    <code>.debug</code>, which <code>assetlinks.json</code> lists only when <code>AKAN_PUBLIC_ENV</code>{" "}
                    is not <code>main</code>. The debug key's SHA-256 must also be in{" "}
                    <code>sha256CertFingerprints</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>debug 빌드는 main이 아닌 서버에서만 검증됩니다.</strong> debug 빌드의 패키지 이름은{" "}
                    <code>.debug</code>로 끝나는데, <code>assetlinks.json</code>은 <code>AKAN_PUBLIC_ENV</code>가{" "}
                    <code>main</code>이 아닐 때만 이 이름을 넣습니다. debug 키의 SHA-256도{" "}
                    <code>sha256CertFingerprints</code>에 있어야 합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div className={panelRecipe({ radius: "lg", padding: "sm" }, "my-4")}>
            <div className="mb-2 font-semibold text-primary">
              {l.trans({ en: "Platform Docs", ko: "플랫폼 공식 문서" })}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-foreground/70 text-sm">
              <li>
                iOS — Universal Links
                <ExternalLink
                  href="https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app"
                  label={l.trans({ en: "Open Apple Universal Links docs", ko: "Apple Universal Links 문서 열기" })}
                />
              </li>
              <li>
                Android — App Links
                <ExternalLink
                  href="https://developer.android.com/training/app-links"
                  label={l.trans({ en: "Open Android App Links docs", ko: "Android App Links 문서 열기" })}
                />
              </li>
            </ul>
          </div>

          <Docs.SubSubTitle>
            {l.trans({ en: "Getting The Android Fingerprint", ko: "Android fingerprint 구하기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Read it from the keystore that signs the build. Debug builds are signed with the runtime's own debug keystore, created by the first Android build:",
              ko: "빌드를 서명하는 keystore에서 읽습니다. debug 빌드는 첫 Android 빌드가 만든 런타임 전용 debug keystore로 서명합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`keytool -list -v \\
  -keystore ~/.akan/native/debug.keystore \\
  -alias androiddebugkey \\
  -storepass android`}
          />
          <div>
            {l.trans({
              en: "Release builds are signed with the upload key akan release-android reads from the environment:",
              ko: "release 빌드는 akan release-android가 환경 변수에서 읽는 upload key로 서명합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`keytool -list -v \\
  -keystore "$MYAPP_RELEASE_STORE_FILE" \\
  -alias "$MYAPP_RELEASE_KEY_ALIAS"`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>With Play App Signing, add Google's key too.</strong> Play re-signs what you upload, so the
                    installed app carries the app signing key: copy its SHA-256 from Play Console (Setup, App signing)
                    and list it next to the upload and debug ones.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Play App Signing을 쓰면 Google의 키도 적습니다.</strong> Play가 업로드한 빌드를 다시
                    서명하므로 설치된 앱은 앱 서명 키를 씁니다. Play Console(설정 › 앱 서명)에서 SHA-256을 복사해 upload
                    key, debug key 옆에 적습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A domain link that fails verification opens in the browser, not the app.</strong> The
                  fingerprint of the key that signed the installed build must be in the list.
                </span>
              ),
              ko: (
                <span>
                  <strong>검증에 실패한 domain 링크는 앱이 아니라 브라우저에서 열립니다.</strong> 지금 설치된 빌드를
                  서명한 키의 fingerprint가 목록에 있어야 합니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
