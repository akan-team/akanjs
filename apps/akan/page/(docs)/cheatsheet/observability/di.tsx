import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Dependency Injection", ko: "의존성 주입" })}>
        <Docs.Title>{l.trans({ en: "Dependency Injection", ko: "의존성 주입" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Dependency injection means a service receives what it needs instead of creating everything by itself. This keeps business code small and makes external systems easier to replace.",
              ko: "의존성 주입은 service가 필요한 것을 직접 만들지 않고 받아서 쓰는 방식입니다. 이렇게 하면 비즈니스 코드는 작아지고, 외부 시스템도 쉽게 교체할 수 있습니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`use` receives values registered in app or library options.",
                ko: "`use`는 app 또는 library option에 등록한 값을 받습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`adapt` and `plug` are good for replaceable tools such as storage, cache, or message APIs.",
                ko: "`adapt`와 `plug`는 storage, cache, message API처럼 교체 가능한 도구에 좋습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`service` connects one service to another service.",
                ko: "`service`는 service끼리 연결합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`env` reads runtime configuration without passing it through every function.",
                ko: "`env`는 런타임 설정을 모든 함수에 넘기지 않고 읽게 해줍니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="use" title={l.trans({ en: "Register With use", ko: "use로 등록하기" })}>
        <Docs.Title>{l.trans({ en: "Register With use", ko: "use로 등록하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`AkanOption.use()` is a simple place to prepare global values. Put API clients, generated secrets, host values, and shared settings there.",
              ko: "`AkanOption.use()`는 글로벌 값을 준비하는 단순한 자리입니다. API client, 생성된 secret, host 값, 공통 설정을 여기에 둡니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Option registers values", ko: "Option에서 값 등록" })}
          code={`export const option = new AkanOption<AppEnv>().use((env) => ({
  mailApi: env.mail ? new MailApi(env.mail) : null,
  storageApi: env.storage ? new CloudStorage(env.storage) : new LocalStorage(),
  appHost: env.operationMode === "local" ? "localhost" : env.hostname,
}));`}
        />
        <Code.Snippet
          title={l.trans({ en: "Service receives values", ko: "Service에서 값 받기" })}
          code={`export class ArticleService extends serve(db.article, ({ use }) => ({
  mailApi: use<MailApi>(),
  storageApi: use<StorageApi>(),
  appHost: use<string>(),
})) {
  async sendPublishedMail(articleId: string) {
    await this.mailApi.send(\`\${this.appHost}/article/\${articleId}\`);
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="adaptor" title={l.trans({ en: "Adapt And Plug", ko: "adapt와 plug" })}>
        <Docs.Title>{l.trans({ en: "Adapt And Plug", ko: "adapt와 plug" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use an adaptor when a tool has behavior and can be replaced later. The service only asks for the role it needs.",
              ko: "도구가 동작을 가지고 있고 나중에 교체될 수 있다면 adaptor를 사용하세요. Service는 필요한 역할만 요청하면 됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Declare adaptor", ko: "Adaptor 선언" })}
          code={`export class ImageStorage extends adapt("imageStorage", ({ env }) => ({
  bucket: env((env: AppEnv) => env.imageBucket),
})) {
  async upload(file: File) {
    return await uploadToBucket(this.bucket, file);
  }
}`}
        />
        <Code.Snippet
          title={l.trans({ en: "Plug adaptor into service", ko: "Service에 plug하기" })}
          code={`export class ArticleService extends serve(db.article, ({ plug }) => ({
  imageStorage: plug(ImageStorage),
})) {
  async setCover(articleId: string, file: File) {
    const url = await this.imageStorage.upload(file);
    return await this.articleModel.update(articleId, { cover: url });
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="service" title={l.trans({ en: "Inject Services", ko: "Service 주입" })}>
        <Docs.Title>{l.trans({ en: "Inject Services", ko: "Service 주입" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `service()` when one service needs another service's business method. This is clearer than importing and creating the other service yourself.",
              ko: "한 service가 다른 service의 업무 method가 필요할 때 `service()`를 사용합니다. 직접 import해서 생성하는 것보다 흐름이 명확합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Service to service", ko: "Service끼리 연결" })}
          code={`export class ArticleService extends serve(db.article, ({ service }) => ({
  fileService: service<srv.FileService>(),
  notificationService: service<srv.NotificationService>(),
})) {
  async publish(articleId: string) {
    const article = await this.articleModel.update(articleId, { status: "published" });
    await this.notificationService.notify("articlePublished", article.id);
    return article;
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="env" title={l.trans({ en: "Read Environment", ko: "환경값 읽기" })}>
        <Docs.Title>{l.trans({ en: "Read Environment", ko: "환경값 읽기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`env()` is useful when the service needs runtime identity such as app name, operation mode, hostname, or a feature flag.",
              ko: "`env()`는 service가 app name, operation mode, hostname, feature flag 같은 런타임 정보를 알아야 할 때 유용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Environment value", ko: "환경값 사용" })}
          code={`export class ArticleService extends serve(db.article, ({ env }) => ({
  publicUrl: env((env: AppEnv) =>
    env.operationMode === "local" ? "http://localhost:8282" : \`https://\${env.hostname}\`,
  ),
})) {
  getShareUrl(articleId: string) {
    return \`\${this.publicUrl}/article/\${articleId}\`;
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Do not create external clients inside every method. Register them once with `use` or `adapt`.",
                ko: "외부 client를 method마다 만들지 마세요. `use` 또는 `adapt`로 한 번 등록하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use `service()` for business collaboration, and `plug()` for replaceable infrastructure.",
                ko: "업무 협력은 `service()`, 교체 가능한 인프라는 `plug()`를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Keep secrets in env/options and inject prepared clients, not raw credentials, when possible.",
                ko: "가능하면 secret은 env/options에 두고 raw credential보다 준비된 client를 주입하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "If a value is shared across many services, `AkanOption.use()` is usually the cleanest home.",
                ko: "여러 service가 공유하는 값은 보통 `AkanOption.use()`에 두는 것이 가장 깔끔합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
