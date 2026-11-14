import { lowerlize } from "akanjs/common";

export const titleize = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const koLabels: Record<string, string> = {
  amount: "금액",
  budget: "예산",
  category: "카테고리",
  content: "내용",
  count: "개수",
  createdAt: "생성일",
  date: "날짜",
  description: "설명",
  due: "마감일",
  dueAt: "마감일",
  email: "이메일",
  enabled: "활성화",
  endAt: "종료일",
  id: "ID",
  name: "이름",
  owner: "담당자",
  priority: "우선순위",
  project: "프로젝트",
  rating: "평점",
  startAt: "시작일",
  status: "상태",
  title: "제목",
  updatedAt: "수정일",
};

const splitFieldWords = (fieldName: string) =>
  fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

const koLabelForField = (fieldName: string) => {
  if (koLabels[fieldName]) return koLabels[fieldName];
  const words = splitFieldWords(fieldName);
  const translated = words.map((word) => koLabels[word] ?? koLabels[lowerlize(word)] ?? null);
  return translated.every(Boolean) ? translated.join(" ") : null;
};

export const bilingualLabelForField = (fieldName: string) => {
  const en = titleize(fieldName);
  return { en, ko: koLabelForField(fieldName) ?? en };
};

export const bilingualDescriptionForField = (fieldName: string) => {
  const label = bilingualLabelForField(fieldName);
  return {
    en: `Enter ${label.en.toLowerCase()}.`,
    ko: `${label.ko} 값을 입력합니다.`,
  };
};
