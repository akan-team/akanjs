// webpack config에서 alias로 사용하는 파일, null처리로 CSR폰트를 할당할 수 있음.
// 각 사용하는 폰트마다 여기에 추가해줘야함.
export const createFont = (data: any) => null;
export default createFont;
export const Nanum_Gothic_Coding = createFont;
export const Noto_Sans_KR = createFont;
export const Inter = createFont;
export const Roboto = createFont;
