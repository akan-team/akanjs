import { serviceDictionary } from "@akanjs/dictionary";

export const dictionary = serviceDictionary(["en", "ko"]).translate({
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
});
