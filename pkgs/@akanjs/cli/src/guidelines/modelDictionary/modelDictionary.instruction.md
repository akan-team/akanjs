# Akan.js Model Dictionary Guide (`model.dictionary.ts`)

## 1. Purpose

The `model.dictionary.ts` file serves as a centralized translation management system for your Akan.js applications, providing:

- **Multilingual UI Text**: Labels, buttons, tooltips, and messages
- **Field Translations**: Model field names and descriptions
- **API Documentation**: Endpoint names and parameter descriptions
- **Enum Translations**: Consistent terminology for status values and options
- **Error Messages**: Standardized error text for validation and business logic
- **Filter Query UI**: Search and filter interface elements

This system ensures consistent terminology across all application layers and supports multiple languages.

---

## 2. File Structure

```typescript
import { ModelDictionary, SignalDictionary, baseTrans, getBaseSignalTrans } from "@akanjs/dictionary";

import type { YourModel, YourFilter, YourInsight, YourSummary } from "./your-model.constant";
import type { YourSignal } from "./your-model.signal";

// Core model translations
const modelDictionary = {
  ...baseTrans, // Include base translations (id, createdAt, etc.)
  modelName: ["Model Name", "모델명"],
  modelDesc: ["Model description", "모델 설명"],

  // * ==================== Model ====================  * //
  fieldName: ["Field Label", "필드 라벨"],
  "desc-fieldName": ["Field description", "필드 설명"],
  // * ==================== Model ====================  * //

  // * ==================== Insight ==================== * //
  count: ["Count", "개수"],
  "desc-count": ["Item count in current query", "현재 쿼리 설정에 맞는 항목 수"],
  // * ==================== Insight ==================== * //

  // * ==================== Filter ==================== * //
  "qry-filterName": ["Filter Label", "필터 라벨"],
  "qrydesc-filterName": ["Filter description", "필터 설명"],
  "qarg-filterName-arg": ["Argument Label", "인자 라벨"],
  "qargdesc-filterName-arg": ["Argument description", "인자 설명"],
  // * ==================== Filter ==================== * //

  // * ==================== Etc ==================== * //
  "enum-field-value": ["Enum Label", "열거형 라벨"],
  "enumdesc-field-value": ["Enum description", "열거형 설명"],
  customKey: ["Custom text", "사용자 정의 텍스트"],
  // * ==================== Etc ==================== * //
} satisfies ModelDictionary<YourModel, YourInsight, YourFilter>;

// API endpoint translations
const signalDictionary = {
  ...getBaseSignalTrans("modelName"), // Auto-generate standard API texts

  // * ==================== Endpoint ==================== * //
  "api-customEndpoint": ["Endpoint Label", "엔드포인트 라벨"],
  "apidesc-customEndpoint": ["Endpoint description", "엔드포인트 설명"],
  "arg-customEndpoint-arg": ["Argument Label", "인자 라벨"],
  "argdesc-customEndpoint-arg": ["Argument description", "인자 설명"],
  // * ==================== Endpoint ==================== * //
} satisfies SignalDictionary<YourSignal, YourModel>;

// Combined export
export const yourDictionary = { ...modelDictionary, ...signalDictionary };
```

---

## 3. Translation Key Convention

All translations follow a structured naming pattern:

| Key Type                | Pattern                        | Example                     | Required |
| ----------------------- | ------------------------------ | --------------------------- | -------- |
| **Model Name**          | `modelName`                    | `modelName`                 | ✅       |
| **Model Description**   | `modelDesc`                    | `modelDesc`                 | ✅       |
| **Field Label**         | `fieldName`                    | `email`                     | ✅       |
| **Field Description**   | `desc-fieldName`               | `desc-email`                | ✅       |
| **Enum Value**          | `enum-{field}-{value}`         | `enum-status-active`        | ✅       |
| **Enum Description**    | `enumdesc-{field}-{value}`     | `enumdesc-status-active`    | ✅       |
| **Filter Query**        | `qry-{filterName}`             | `qry-byStatus`              | ✅       |
| **Filter Description**  | `qrydesc-{filterName}`         | `qrydesc-byStatus`          | ✅       |
| **Filter Argument**     | `qarg-{filterName}-{arg}`      | `qarg-byStatus-status`      | ✅       |
| **Filter Arg Desc**     | `qargdesc-{filterName}-{arg}`  | `qargdesc-byStatus-status`  | ✅       |
| **API Endpoint**        | `api-{endpointName}`           | `api-updateUser`            | ✅       |
| **API Description**     | `apidesc-{endpointName}`       | `apidesc-updateUser`        | ✅       |
| **API Argument**        | `arg-{endpointName}-{argName}` | `arg-updateUser-userId`     | ✅       |
| **API Arg Description** | `argdesc-{endpoint}-{arg}`     | `argdesc-updateUser-userId` | ✅       |
| **Custom UI Text**      | `customKey`                    | `deleteConfirm`             | ➖       |

### Translation Array Format

Each translation is an array with entries for each supported language:

```typescript
// [English, Korean]
fieldName: ["Field Name", "필드 이름"],

// With description
"desc-fieldName": ["Field description", "필드 설명"],
```

---

## 4. How to Add Model Translations

### Model Fields

Every model field requires both a label and description:

```typescript
// * ==================== Model ==================== * //
title: ["Title", "제목"],
"desc-title": ["Content title", "콘텐츠 제목"],

description: ["Description", "설명"],
"desc-description": ["Content description", "콘텐츠 설명"],

author: ["Author", "작성자"],
"desc-author": ["Content creator", "콘텐츠 작성자"],
// * ==================== Model ==================== * //
```

### Summary Translations

Summary statistics and aggregated metrics:

```typescript
// * ==================== Summary ==================== * //
totalUsers: ["Total Users", "총 사용자 수"],
"desc-totalUsers": ["Total registered users", "등록된 총 사용자 수"],

activeUsers: ["Active Users", "활성 사용자 수"],
"desc-activeUsers": ["Users active in last 7 days", "최근 7일간 활성 사용자 수"],
// * ==================== Summary ==================== * //
```

### Signal Translations

API endpoint names, descriptions and parameters:

```typescript
// * ==================== Endpoint ==================== * //
"api-fetchRecent": ["Fetch Recent", "최근 데이터 조회"],
"apidesc-fetchRecent": ["Get recently modified items", "최근 수정된 항목 조회"],
"arg-fetchRecent-days": ["Days", "일 수"],
"argdesc-fetchRecent-days": ["Number of days to look back", "조회할 과거 일 수"],
// * ==================== Endpoint ==================== * //
```

### Enum Translations

For dropdown options, status values, and other enumerated types:

```typescript
// * ==================== Etc ==================== * //
"enum-status-active": ["Active", "활성"],
"enumdesc-status-active": ["Item is visible and usable", "항목이 표시되고 사용 가능함"],

"enum-status-inactive": ["Inactive", "비활성"],
"enumdesc-status-inactive": ["Item is hidden but exists", "항목이 숨겨져 있지만 존재함"],

"enum-role-admin": ["Administrator", "관리자"],
"enumdesc-role-admin": ["Full system access", "시스템 전체 접근 권한"],
// * ==================== Etc ==================== * //
```

---

## 5. How to Add Filter Query Translations

Filter queries need labels, descriptions, and argument translations:

```typescript
// * ==================== Filter ==================== * //
"qry-byStatus": ["By Status", "상태별 조회"],
"qrydesc-byStatus": ["Filter items by status", "상태별로 항목 필터링"],
"qarg-byStatus-status": ["Status", "상태"],
"qargdesc-byStatus-status": ["Status value to filter by", "필터링할 상태 값"],

"qry-byCreator": ["By Creator", "작성자별 조회"],
"qrydesc-byCreator": ["Filter items by creator", "작성자별로 항목 필터링"],
"qarg-byCreator-userId": ["User ID", "사용자 ID"],
"qargdesc-byCreator-userId": ["Creator's user ID", "작성자의 사용자 ID"],
// * ==================== Filter ==================== * //
```

For each filter:

1. Define the filter query name (`qry-filterName`)
2. Add a filter description (`qrydesc-filterName`)
3. For each argument:
   - Add argument label (`qarg-filterName-argName`)
   - Add argument description (`qargdesc-filterName-argName`)

---

## 6. Extended Model Patterns

For special models like users, settings, or summaries:

### User Extensions

```typescript
// Extended user-specific fields
const userDictionary = {
  // * ==================== Model ==================== * //
  lastLogin: ["Last Login", "마지막 로그인"],
  "desc-lastLogin": ["User's last login time", "사용자 마지막 로그인 시간"],

  accountStatus: ["Account Status", "계정 상태"],
  "desc-accountStatus": ["Current account status", "현재 계정 상태"],
  // * ==================== Model ==================== * //

  // * ==================== Etc ==================== * //
  "enum-accountStatus-active": ["Active", "활성"],
  "enumdesc-accountStatus-active": ["Account is usable", "계정이 사용 가능함"],

  "enum-accountStatus-suspended": ["Suspended", "정지됨"],
  "enumdesc-accountStatus-suspended": ["Account is temporarily disabled", "계정이 일시적으로 비활성화됨"],
  // * ==================== Etc ==================== * //
} satisfies ExtendModelDictionary<User>;
```

### Settings Model

```typescript
// Settings-specific translations
const settingDictionary = {
  // * ==================== Model ==================== * //
  darkMode: ["Dark Mode", "다크 모드"],
  "desc-darkMode": ["Enable dark theme", "다크 테마 사용"],

  notificationLevel: ["Notification Level", "알림 수준"],
  "desc-notificationLevel": ["Control notification frequency", "알림 빈도 제어"],
  // * ==================== Model ==================== * //

  // * ==================== Etc ==================== * //
  "enum-notificationLevel-all": ["All", "모두"],
  "enumdesc-notificationLevel-all": ["Receive all notifications", "모든 알림 수신"],

  "enum-notificationLevel-important": ["Important Only", "중요한 것만"],
  "enumdesc-notificationLevel-important": ["Only receive important alerts", "중요한 알림만 수신"],
  // * ==================== Etc ==================== * //
} satisfies ExtendModelDictionary<Setting>;
```

---

## 7. Validation Rules and Checklist

### Automated Validation

Run in development to check dictionary completeness:

```bash
akan dict:check
```

This validates:

1. All model fields have matching descriptions
2. All enum values have translations
3. All API arguments have descriptions
4. All filter arguments have descriptions
5. No orphaned/unused translations

### Manual Checklist

Before committing your dictionary, verify:

- [ ] Section comments (`// * ==================== * //`) are maintained
- [ ] All model fields have matching `desc-` entries
- [ ] All enums have both value and description entries
- [ ] All filters have proper query, description, argument, and argument description entries
- [ ] All API endpoints have proper endpoint, description, argument, and argument description entries
- [ ] Translation arrays follow consistent language order (English first, Korean second)
- [ ] Signal arguments match backend definitions
- [ ] Filter arguments match model definitions
- [ ] Enum values match model definitions

---

## 8. Common Mistakes and How to Fix

| Mistake                       | Symptom                           | Fix                                            |
| ----------------------------- | --------------------------------- | ---------------------------------------------- |
| Missing field description     | Dictionary validation errors      | Add `"desc-fieldName"` entry                   |
| Missing enum description      | Tooltips show keys not values     | Add `"enumdesc-field-value"` entry             |
| Missing filter arg desc       | Filter UI shows raw keys          | Add `"qargdesc-filter-arg"` entry              |
| Missing API arg desc          | API docs show raw parameter names | Add `"argdesc-endpoint-arg"` entry             |
| Inconsistent section comments | Hard to navigate code             | Use standard `// * ===== * //` format          |
| Orphaned translations         | Validation warnings               | Remove unused keys or add missing fields       |
| Translation array order       | Incorrect language display        | Maintain consistent order: `[English, Korean]` |

### Example Fixes:

```typescript
// INCORRECT - Missing description
title: ["Title", "제목"],

// CORRECT
title: ["Title", "제목"],
"desc-title": ["Item title", "항목 제목"],

// INCORRECT - Missing enum description
"enum-status-active": ["Active", "활성"],

// CORRECT
"enum-status-active": ["Active", "활성"],
"enumdesc-status-active": ["Item is visible and usable", "항목이 표시되고 사용 가능함"],
```

---

## 9. Required Imports

Always include these imports in your dictionary file:

```typescript
// Dictionary system imports
import {
  ModelDictionary,
  SignalDictionary,
  ExtendModelDictionary, // For extended models
  baseTrans, // Common translations
  getBaseSignalTrans, // Auto-generated API translations
} from "@akanjs/dictionary";

// Model type imports
import type { YourModel, YourFilter, YourInsight } from "./your-model.constant";
import type { YourSignal } from "./your-model.signal";
import type { YourSummary } from "./your-model.summary"; // If using summary
```

---

## 10. Full Example of model.dictionary.ts

```typescript
import { ModelDictionary, SignalDictionary, baseTrans, getBaseSignalTrans } from "@akanjs/dictionary";

import type { Post, PostFilter, PostInsight } from "./post.constant";
import type { PostSignal } from "./post.signal";

const modelDictionary = {
  ...baseTrans,
  modelName: ["Post", "게시물"],
  modelDesc: ["Blog or forum post content", "블로그 또는 포럼 게시물 콘텐츠"],

  // * ==================== Model ==================== * //
  title: ["Title", "제목"],
  "desc-title": ["Post headline", "게시물 제목"],

  content: ["Content", "내용"],
  "desc-content": ["Post body text", "게시물 본문 텍스트"],

  author: ["Author", "작성자"],
  "desc-author": ["Post creator", "게시물 작성자"],

  category: ["Category", "카테고리"],
  "desc-category": ["Content classification", "콘텐츠 분류"],

  tags: ["Tags", "태그"],
  "desc-tags": ["Content labels", "콘텐츠 라벨"],

  viewCount: ["Views", "조회수"],
  "desc-viewCount": ["Number of post views", "게시물 조회 수"],

  commentCount: ["Comments", "댓글수"],
  "desc-commentCount": ["Number of comments", "댓글 수"],
  // * ==================== Model ==================== * //

  // * ==================== Insight ==================== * //
  count: ["Count", "개수"],
  "desc-count": ["Post count in current query", "현재 쿼리의 게시물 수"],

  avgViewCount: ["Average Views", "평균 조회수"],
  "desc-avgViewCount": ["Average view count per post", "게시물당 평균 조회 수"],
  // * ==================== Insight ==================== * //

  // * ==================== Filter ==================== * //
  "qry-byAuthor": ["By Author", "작성자별 조회"],
  "qrydesc-byAuthor": ["Filter posts by author", "작성자별로 게시물 필터링"],
  "qarg-byAuthor-authorId": ["Author ID", "작성자 ID"],
  "qargdesc-byAuthor-authorId": ["Author's user ID", "작성자의 사용자 ID"],

  "qry-byCategory": ["By Category", "카테고리별 조회"],
  "qrydesc-byCategory": ["Filter posts by category", "카테고리별로 게시물 필터링"],
  "qarg-byCategory-categoryId": ["Category ID", "카테고리 ID"],
  "qargdesc-byCategory-categoryId": ["Category identifier", "카테고리 식별자"],

  "qry-byTags": ["By Tags", "태그별 조회"],
  "qrydesc-byTags": ["Filter posts by tags", "태그별로 게시물 필터링"],
  "qarg-byTags-tags": ["Tags", "태그"],
  "qargdesc-byTags-tags": ["List of tag values", "태그 값 목록"],
  // * ==================== Filter ==================== * //

  // * ==================== Etc ==================== * //
  "enum-status-draft": ["Draft", "초안"],
  "enumdesc-status-draft": ["Not yet published", "아직 게시되지 않음"],

  "enum-status-published": ["Published", "게시됨"],
  "enumdesc-status-published": ["Publicly available", "공개적으로 사용 가능"],

  "enum-status-archived": ["Archived", "보관됨"],
  "enumdesc-status-archived": ["No longer active but preserved", "더 이상 활성화되지 않지만 보존됨"],

  deleteConfirm: ["Delete this post?", "이 게시물을 삭제하시겠습니까?"],
  publishConfirm: ["Publish this post?", "이 게시물을 게시하시겠습니까?"],
  // * ==================== Etc ==================== * //
} satisfies ModelDictionary<Post, PostInsight, PostFilter>;

const signalDictionary = {
  ...getBaseSignalTrans("post"),

  // * ==================== Endpoint ==================== * //
  "api-publishPost": ["Publish Post", "게시물 게시"],
  "apidesc-publishPost": ["Change post status to published", "게시물 상태를 게시됨으로 변경"],
  "arg-publishPost-postId": ["Post ID", "게시물 ID"],
  "argdesc-publishPost-postId": ["Target post identifier", "대상 게시물 식별자"],

  "api-featurePost": ["Feature Post", "게시물 주목"],
  "apidesc-featurePost": ["Mark post as featured", "게시물을 주목 대상으로 표시"],
  "arg-featurePost-postId": ["Post ID", "게시물 ID"],
  "argdesc-featurePost-postId": ["Target post identifier", "대상 게시물 식별자"],

  "api-getPopularPosts": ["Get Popular Posts", "인기 게시물 가져오기"],
  "apidesc-getPopularPosts": ["Retrieve most viewed posts", "가장 많이 본 게시물 검색"],
  "arg-getPopularPosts-limit": ["Limit", "제한"],
  "argdesc-getPopularPosts-limit": ["Maximum number of results", "최대 결과 수"],
  // * ==================== Endpoint ==================== * //
} satisfies SignalDictionary<PostSignal, Post>;

export const postDictionary = { ...modelDictionary, ...signalDictionary };
```

---

## 11. Extended Model Example

For models that extend base functionality, like user settings:

```typescript
import { ExtendModelDictionary, SignalDictionary } from "@akanjs/dictionary";
import type { UserSetting } from "./userSetting.constant";
import type { UserSettingSignal } from "./userSetting.signal";

const userSettingDictionary = {
  // * ==================== Model ==================== * //
  notificationEnabled: ["Enable Notifications", "알림 활성화"],
  "desc-notificationEnabled": ["Toggle all notifications", "모든 알림 토글"],

  emailFrequency: ["Email Frequency", "이메일 빈도"],
  "desc-emailFrequency": ["How often to send emails", "이메일 발송 빈도"],

  theme: ["Theme", "테마"],
  "desc-theme": ["UI color scheme", "UI 색상 구성표"],

  language: ["Language", "언어"],
  "desc-language": ["Interface language", "인터페이스 언어"],
  // * ==================== Model ==================== * //

  // * ==================== Etc ==================== * //
  "enum-emailFrequency-never": ["Never", "안 함"],
  "enumdesc-emailFrequency-never": ["Don't send emails", "이메일 발송 안 함"],

  "enum-emailFrequency-daily": ["Daily", "매일"],
  "enumdesc-emailFrequency-daily": ["Send digest once a day", "하루에 한 번 다이제스트 발송"],

  "enum-emailFrequency-weekly": ["Weekly", "주간"],
  "enumdesc-emailFrequency-weekly": ["Send digest once a week", "일주일에 한 번 다이제스트 발송"],

  "enum-theme-light": ["Light", "라이트"],
  "enumdesc-theme-light": ["Bright color scheme", "밝은 색상 구성표"],

  "enum-theme-dark": ["Dark", "다크"],
  "enumdesc-theme-dark": ["Dark color scheme", "어두운 색상 구성표"],

  "enum-theme-system": ["System", "시스템"],
  "enumdesc-theme-system": ["Follow system settings", "시스템 설정 따름"],

  "enum-language-en": ["English", "영어"],
  "enumdesc-language-en": ["English language", "영어"],

  "enum-language-ko": ["Korean", "한국어"],
  "enumdesc-language-ko": ["Korean language", "한국어"],
  // * ==================== Etc ==================== * //

  // * ==================== Endpoint ==================== * //
  "api-saveUserPreferences": ["Save Preferences", "환경설정 저장"],
  "apidesc-saveUserPreferences": ["Update user settings", "사용자 설정 업데이트"],
  "arg-saveUserPreferences-settings": ["Settings", "설정"],
  "argdesc-saveUserPreferences-settings": ["New settings values", "새 설정 값"],
  // * ==================== Endpoint ==================== * //
} satisfies ExtendModelDictionary<UserSetting> & SignalDictionary<UserSettingSignal, UserSetting>;

export const settingDictionary = userSettingDictionary;
```

---

## 12. Best Practices

1. **Section Organization**: Maintain the standard section comments for code readability

   ```typescript
   // * ==================== Model ==================== * //
   // Field translations here
   // * ==================== Model ==================== * //
   ```

2. **Complete Descriptions**: Every field must have a matching description

   ```typescript
   title: ["Title", "제목"],
   "desc-title": ["Content title", "콘텐츠 제목"],
   ```

3. **Consistent Language Order**: Always use the same order in translation arrays

   ```typescript
   // [English, Korean]
   fieldName: ["Field Label", "필드 라벨"],
   ```

4. **Group Related Items**: Keep related translations together by type and function

5. **Reuse Base Translations**: Always include `baseTrans` and `getBaseSignalTrans`

6. **Use Type Safety**: Always use the `satisfies` keyword with proper types

7. **Validate Dictionary**: Run `akan dict:check` before committing changes

8. **Consistent Casing**:
   - Model field names: camelCase
   - Enum values: camelCase
   - Custom keys: camelCase

9. **Documentation Comments**: Add comments for complex or non-obvious translations

10. **No Duplicate Keys**: Don't define the same key multiple times in different places
