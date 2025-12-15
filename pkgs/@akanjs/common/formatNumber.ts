export const formatNumber = (numString: string) => {
  // 문자열이 아니면 문자열로 변환
  if (typeof numString !== "string") {
    numString = String(numString);
  }

  // 소수점이 있는 경우 처리
  const parts = numString.split(".");
  const integerPart = parts[0].replace(/[^\d]/g, ""); // 정수 부분에서 숫자만 추출
  const decimalPart = parts.length > 1 ? "." + parts[1] : "";

  // 정수 부분에 콤마 추가
  const formattedInteger = Number(integerPart).toLocaleString("ko-KR");

  // 정수 부분과 소수 부분 합치기
  return formattedInteger + decimalPart;
};
