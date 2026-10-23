export const installCommand = "bunx create-akan-workspace@latest";

export const agentPrompt = {
  en: [
    "Set up a new Akan.js workspace for me (https://akanjs.com).",
    "",
    "1. Check that Bun 1.4.4 or newer is installed (`bun --version`). If it isn't, install or upgrade it as https://bun.sh describes.",
    "2. Ask me for a workspace name and a first app name, short and lowercase, unless I wrote them below.",
    "3. In this directory, run `bunx create-akan-workspace@latest <workspace> --app <app>`. It installs the akan CLI globally, creates ./<workspace> and installs its dependencies.",
    "4. Inside ./<workspace>, start the dev server in the background with `akan start <app>` and check that the URL it prints (http://localhost:8282 by default) loads.",
    "5. Tell me it's running, and that I should reopen you inside ./<workspace>: the project's Akan MCP server and AGENTS.md rules load from there.",
  ].join("\n"),
  ko: [
    "Akan.js(https://akanjs.com) 워크스페이스를 새로 만들어 줘.",
    "",
    "1. Bun 1.4.4 이상이 설치돼 있는지 확인해 줘(`bun --version`). 없거나 버전이 낮으면 https://bun.sh 안내대로 설치하거나 업그레이드해 줘.",
    "2. 워크스페이스 이름과 첫 앱 이름을 물어봐 줘. 짧은 영문 소문자로, 아래에 적어 뒀다면 그걸 쓰면 돼.",
    "3. 이 디렉터리에서 `bunx create-akan-workspace@latest <워크스페이스> --app <앱>`을 실행해 줘. akan CLI를 전역으로 설치하고, ./<워크스페이스>를 만들어 의존성까지 설치해.",
    "4. ./<워크스페이스> 안에서 `akan start <앱>`으로 개발 서버를 백그라운드에 띄우고, 출력된 주소(기본 http://localhost:8282)가 열리는지 확인해 줘.",
    "5. 다 되면 알려 주고, ./<워크스페이스> 안에서 너를 다시 열라고 안내해 줘. 프로젝트의 Akan MCP 서버와 AGENTS.md 규칙은 거기서 로드돼.",
  ].join("\n"),
};
