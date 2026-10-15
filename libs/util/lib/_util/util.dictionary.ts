import { serviceDictionary } from "akanjs/dictionary";

export const dictionary = serviceDictionary(["en", "ko"])
  .translate({
    home: ["Home", "홈"],
    menu: ["Menu", "메뉴"],
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
    uploadTypeNotAllowed: ["This file type is not allowed", "허용되지 않는 파일 형식입니다."],
    uploadFileName: ["File Name", "파일 이름"],
    uploadFileSize: ["Size", "크기"],
    uploadFileStatus: ["Status", "상태"],
    uploadStatusActive: ["Uploaded", "업로드 완료"],
    uploadStatusUploading: ["Uploading", "업로드 중"],
    uploadStatusFailed: ["Failed", "실패"],
    downloadCroppedImage: ["Download Cropped Image", "자른 이미지 다운로드"],
    signature: ["Signature", "서명"],
    signatureDraw: ["Draw", "그리기"],
    signatureUpload: ["Upload", "업로드"],
    signatureClear: ["Clear", "지우기"],
    signatureImageUnreadable: ["This image could not be read", "이미지를 읽을 수 없습니다."],
  })
  .error({
    jwtSecretRequired: [
      "JWT_SECRET is not configured. Outside local a derived secret can be forged by anyone who knows the app, environment and repo names; set JWT_SECRET or security.jwtSecret, or AKAN_ALLOW_DERIVED_JWT_SECRET=1 to accept the risk",
      "JWT_SECRET 이 설정되지 않았다. local 밖에서 파생 시크릿은 앱·환경·레포 이름을 아는 누구나 위조할 수 있다. JWT_SECRET 또는 security.jwtSecret 을 설정하거나, AKAN_ALLOW_DERIVED_JWT_SECRET=1 로 위험을 감수한다.",
    ],
    discordWebhookFailed: [
      "The Discord webhook failed with status {status}",
      "상태 {status}로 Discord 웹훅 전송에 실패했습니다.",
    ],
    invalidDataUri: ["The data URI is malformed", "data URI 형식이 잘못되었습니다."],
    untrustedUrlRejected: ["This URL cannot be fetched: {reason}", "이 주소는 가져올 수 없습니다: {reason}"],
    untrustedFetchFailed: ["The download failed with status {status}", "상태 {status}로 다운로드에 실패했습니다."],
    untrustedFetchTimedOut: ["The download timed out", "다운로드 시간이 초과되었습니다."],
    responseTooLarge: ["The response is larger than {maxBytes} bytes", "응답이 {maxBytes}바이트를 넘습니다."],
    streamAborted: ["Stream aborted: {localPath}", "전송이 취소되었습니다: {localPath}"],
    streamStalled: [
      "Stream stalled for {seconds}s: {localPath}",
      "{seconds}초 동안 응답이 없어 전송을 중단했습니다: {localPath}",
    ],
    filenameRequired: [
      "Filename is required for local path: {localPath}",
      "로컬 경로 {localPath}에 파일 이름이 필요합니다",
    ],
    githubApiFailed: ["GitHub request failed: {reason}", "GitHub 요청에 실패했습니다: {reason}"],
    githubAccessTokenExchangeFailed: [
      "Failed to sign in with GitHub: {reason}",
      "GitHub 로그인에 실패했습니다: {reason}",
    ],
    githubRepositoryCreateFailed: ["Failed to create repository: {reason}", "저장소를 생성하지 못했습니다: {reason}"],
    githubRepositoryCreateForbidden: [
      "The GitHub App cannot create repositories ({reason}). Grant it the Repository Administration write permission and reconnect GitHub, or use a token that can create private repositories.",
      "GitHub 앱에 저장소 생성 권한이 없습니다({reason}). Repository Administration 쓰기 권한을 준 뒤 GitHub를 다시 연결하거나, 비공개 저장소를 만들 수 있는 토큰을 사용해야 합니다.",
    ],
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
    githubWebhookListFailed: [
      "Failed to list repository webhooks: {reason}",
      "저장소 웹훅 목록을 불러오지 못했습니다: {reason}",
    ],
    githubWebhookRegisterFailed: [
      "Failed to register the repository webhook: {reason}",
      "저장소 웹훅을 등록하지 못했습니다: {reason}",
    ],
    githubWebhookUpdateFailed: [
      "Failed to update the repository webhook: {reason}",
      "저장소 웹훅을 갱신하지 못했습니다: {reason}",
    ],
    githubPrivateKeyNotConfigured: [
      "GitHub App private key is not configured",
      "GitHub 앱 개인 키가 설정되지 않았습니다",
    ],
    invalidBaseUrlForDelete: [
      "Invalid base URL, unable to delete data",
      "잘못된 기본 URL로 데이터를 삭제할 수 없습니다",
    ],
    cloudFrontNotInitialized: ["CloudFront is not initialized", "CloudFront가 초기화되지 않았습니다"],
    adaptorNotConfigured: [
      "{adaptor} is not configured: set `{option}` in the server env",
      "{adaptor} 설정이 없습니다. 서버 env 에 `{option}` 을 지정해야 합니다",
    ],
    invalidServiceType: ["Invalid service type", "잘못된 서비스 유형입니다"],
    slideProviderRequiresSlide: [
      "SlideProvider requires at least one Slide component",
      "SlideProvider에는 최소 하나의 Slide 컴포넌트가 필요합니다",
    ],
  });
