import { serviceDictionary } from "akanjs/dictionary";

export const dictionary = serviceDictionary(["en", "ko"])
  .translate({
    home: ["Home", "홈"],
    info: ["Info", "정보"],
    selectAll: ["Select All", "모두 선택"],
    clearAll: ["Clear All", "모두 해제"],
    back: ["Back", "뒤로가기"],
    next: ["Next", "다음"],
    longitude: ["Longitude", "경도"],
    latitude: ["Latitude", "위도"],
    set: ["Set", "설정"],
    print: ["Print", "인쇄"],
    linkCopied: ["Link copied. Share it wherever you want!", "링크 복사 완료! 원하는 곳에 공유해보세요!"],
    uploadImageClick: ["Click and select image", "클릭하여 업로드 할 이미지를 선택해주세요."],
    uploadImageDrop: ["Drop image here", "업로드 할 이미지를 여기에 놓아주세요."],
    uploadFileClick: ["Click and select file", "클릭하여 업로드 할 파일을 선택해주세요."],
    uploadFileDrop: ["Drop file here", "업로드 할 파일을 여기에 놓아주세요."],
    uploadFilesClick: ["Click and select files", "클릭하여 업로드 할 파일들을 선택해주세요."],
    uploadFilesDrop: ["Drop files here", "업로드 할 파일들을 여기에 놓아주세요."],
  })
  .error({
    arrayWeightLengthMismatch: ["Array and weight length should be equal", "배열과 가중치의 길이가 같아야 합니다"],
    cloudflareDnsRecordsLoadFailed: [
      "Failed to load Cloudflare DNS records: {errors}",
      "Cloudflare DNS 레코드를 불러오지 못했습니다: {errors}",
    ],
    cloudflareDnsRecordCreateFailed: [
      "Failed to create Cloudflare DNS record: {errors}",
      "Cloudflare DNS 레코드를 생성하지 못했습니다: {errors}",
    ],
    cloudflareDnsRecordUpdateFailed: [
      "Failed to update Cloudflare DNS record: {errors}",
      "Cloudflare DNS 레코드를 업데이트하지 못했습니다: {errors}",
    ],
    browserNotInitialized: ["Browser not initialized", "브라우저가 초기화되지 않았습니다"],
    discordGuildNotFound: ["No guild of server in {serverId}", "{serverId} 서버의 길드를 찾을 수 없습니다"],
    discordBotNotFound: ["No bot found for botId: {botId}", "botId {botId}에 해당하는 봇을 찾을 수 없습니다"],
    discordRoleOrUserNotFound: ["No role or user", "역할 또는 사용자를 찾을 수 없습니다"],
    noResponseBody: ["No response body", "응답 본문이 없습니다"],
    filenameRequired: [
      "Filename is required for local path: {localPath}",
      "로컬 경로 {localPath}에 파일 이름이 필요합니다",
    ],
    githubRepositoryCreateFailed: ["Failed to create repository: {reason}", "저장소를 생성하지 못했습니다: {reason}"],
    githubOrganizationRepositoriesListFailed: [
      "Failed to list organization repositories: {reason}",
      "조직 저장소 목록을 불러오지 못했습니다: {reason}",
    ],
    githubInstallationAccessTokenCreateFailed: [
      "Failed to create installation access token: {reason}",
      "설치 액세스 토큰을 생성하지 못했습니다: {reason}",
    ],
    githubInstallationRepositoriesListFailed: [
      "Failed to list installation repositories: {reason}",
      "설치 저장소 목록을 불러오지 못했습니다: {reason}",
    ],
    githubUserInstallationsListFailed: [
      "Failed to list user installations: {reason}",
      "사용자 설치 목록을 불러오지 못했습니다: {reason}",
    ],
    githubRepositoryAppsListFailed: [
      "Failed to list repository apps: {reason}",
      "저장소 앱 목록을 불러오지 못했습니다: {reason}",
    ],
    githubPrivateKeyNotConfigured: [
      "GitHub App private key is not configured",
      "GitHub 앱 개인 키가 설정되지 않았습니다",
    ],
    pushNotificationTargetRequired: [
      "Push notification target token or topic is required.",
      "푸시 알림 대상 토큰 또는 토픽이 필요합니다.",
    ],
    invalidBaseUrlForDelete: [
      "Invalid base URL, unable to delete data",
      "잘못된 기본 URL로 데이터를 삭제할 수 없습니다",
    ],
    cloudFrontNotInitialized: ["CloudFront is not initialized", "CloudFront가 초기화되지 않았습니다"],
    invalidServiceType: ["Invalid service type", "잘못된 서비스 유형입니다"],
    slideProviderRequiresSlide: [
      "SlideProvider requires at least one Slide component",
      "SlideProvider에는 최소 하나의 Slide 컴포넌트가 필요합니다",
    ],
  });
