import { capitalize } from "@akanjs/common";
import type { AppConfigResult, LibConfigResult } from "@akanjs/config";
import { type FileContent, Prompter } from "@akanjs/devkit";

import * as prompt from "./module.prompt";

interface ModuleRequestProps {
  sysType: "app" | "lib";
  sysName: string;
  config: LibConfigResult | AppConfigResult;
  modelName: string;
}
export class ModuleRequest extends Prompter {
  sysType: "app" | "lib";
  sysName: string;
  config: LibConfigResult | AppConfigResult;
  modelName: string;
  constructor(options: ModuleRequestProps) {
    super();
    this.sysType = options.sysType;
    this.sysName = options.sysName;
    this.config = options.config;
    this.modelName = options.modelName;
  }
  async requestModelConstant({
    modelDesc,
    modelSchemaDesign,
    boilerplate,
    exampleFiles,
  }: {
    modelDesc: string;
    modelSchemaDesign: string;
    boilerplate: string;
    exampleFiles: FileContent[];
  }) {
    return this.makeTsFileUpdatePrompt({
      context: `
1. <model>.constant.ts 파일에 대한 개요
${await this.getDocumentation("modelConstant")}

2. <model>.constant.ts 파일의 Enum 작성법
${await this.getDocumentation("enumConstant")}

3. <model>.constant.ts 파일의 Field 작성법
${await this.getDocumentation("fieldDecorator")}

4. 현재 프로젝트 내 다른 constant.ts 파일들에 대한 예시
${exampleFiles
  .map(
    (constant) => `
Example file: ${constant.filePath}
\`\`\`
${constant.content}
\`\`\`
`
  )
  .join("\n")}
`,
      request: `
위 내용들을 바탕으로 파싱하기 쉽게 아래에 보일러플레이트에 맞게 정리해서 줘

Application name: ${this.sysName}
Model name: ${this.modelName}
Model description: ${modelDesc}
Model schema design: ${modelSchemaDesign}

Target filename: ${this.modelName}.constant.ts
\`\`\`typescript
// File: lib/${this.modelName}/${this.modelName}.constant.ts
${boilerplate}
\`\`\`

만약, ${this.modelName}.constant.ts 파일 외에 다른 스칼라 모델을 추가로 작성해야한다면, 다음과 같은 형식으로 추가로 작성해줘
\`\`\`typescript
// File: lib/__scalar/otherModel/otherModel.constant.ts
...파일 내용
\`\`\`
`,
    });
  }
}

interface RequestProps {
  sysName: string;
  modelName: string;
  ModelName?: string;
  boilerplate: string;
  properties?: { key: string; source: string }[];
  exampleFiles: FileContent[];
}

interface RequestDictionaryProps extends RequestProps {
  constant: string;
  modelDesc: string;
  modelSchemaDesign: string;
}

export const requestDictionary = ({
  sysName,
  modelName,
  constant,
  modelDesc,
  modelSchemaDesign,
  boilerplate,
  exampleFiles,
}: RequestDictionaryProps) => ` 


		-${modelName}의 스키마 정의.
		\`\`\`
		${constant}
		\`\`\`

	 역할부여 
	 - Akan.js 사내 프레임워크 기반 유창한 번역가.
 
		엄격한 주의사항
		 - 모든 문장은 문법적으로 올바르게 작성
		 - 보일러플레이트내 signalDictionary 부분은 그대로 유지
		
		요청사항
		- 아래 제공할 보일러플레이트에 맞춰 번역본 소스코드 제공

		

		Application name: ${sysName}
		Model name: ${modelName}
		Model description: ${modelDesc}
		Model schema design: ${modelSchemaDesign}

		Target filename: ${modelName}.dictionary.ts
		\`\`\`
		${boilerplate}
		\`\`\`
`;

interface RequestTemplateProps extends RequestProps {
  constant: string;
  properties: { key: string; source: string }[];
}

export const requestTemplate = ({
  sysName,
  modelName,
  ModelName,
  boilerplate,
  constant,
  properties,
  exampleFiles,
}: RequestTemplateProps) => `
		${prompt.componentDefaultDescription({
      sysName,
      modelName,
      ModelName: ModelName ?? capitalize(modelName),
      exampleFiles,
      constant,
      properties,
    })}
	 역할부여 
	 - Akan.js 사내 프레임워크 기반 Typescript 시니어 프론트엔드 개발자.
 
	 코딩 규칙
		 - 라이브러리 사용
		 - 아이콘: react-icons 라이브러리 사용
		 - CSS: tailwind, DaisyUI(card/hero 같은 복잡한 컴포넌트 사용 X) 사용
		 - Ui Component: @util/ui 라이브러리 사용
		 - 조건부 클래스: clsx 라이브러리 사용
	 코드 스타일
		 - 색상: 하드코딩(bg-red) 대신 테마 색상(bg-primary) 사용
		 - 조건부 렌더링: field && <div>... 대신 field ? <div>... : null 사용
		 - 모델 접근: 구조분해할당 대신 ${modelName}.field 형식으로 접근
		 - 타입 안전: ${modelName}.constant.ts의 스키마 참조하여 에러 방지
	 필드 접근 전: 스키마의 실제 필드 리스트 작성 및 검토 필수
	 
	 엄격한 주의사항
		 - UI 킷은 문서에 명시된 컴포넌트만 사용
		 - 컴포넌트 사용 전 문서 확인 및 props 정확히 검증
		 - 명시된 룰 외 임의 추상화 금지
		 - dayjs 라이브러리는 @akanjs/base에서 래핑하여 제공하고 있음.

		요청사항
		- 아래 제공할 기본 템플릿 코드에 추가로 컴포넌트 개발
		- ${ModelName}.Template.tsx 코드 작성
		- 컴포넌트 이름은 모델 이름은 스키마에 기반한 기능에 초점을 두고 작성
		- 아래 제공할 보일러플레이트에 있는 General 컴포넌트 1개를 제외한 디자인 컴포넌트 4개 개발 
		- 추상화 해야하는 경우가 있을 경우엔 문서를 다시 참고하고 설명된 내에서 해결해야함.
		- 보일러플레이트에 맞게 정리해서 제공
	- 
	
	Application name: ${sysName}
	Model name: ${modelName}
	Target filename: ${ModelName}.Template.tsx
		\`\`\`
		${boilerplate}
		\`\`\`
	
	 
	`;
interface RequestViewProps extends RequestProps {
  constant: string;
  properties: { key: string; source: string }[];
}

export const requestView = ({
  sysName,
  modelName,
  ModelName,
  boilerplate,
  constant,
  properties,
  exampleFiles,
}: RequestViewProps) => `
	 ${prompt.componentDefaultDescription({
     sysName,
     modelName,
     ModelName: ModelName ?? capitalize(modelName),
     exampleFiles,
     constant,
     properties,
   })}

	 역할부여 
	 - Akan.js 사내 프레임워크 기반 Typescript 시니어 프론트엔드 개발자.
 
	 코딩 규칙
		 - 라이브러리 사용
		 - 아이콘: react-icons 라이브러리 사용
		 - CSS: tailwind, DaisyUI(card/hero 같은 복잡한 컴포넌트 사용 X) 사용
		 - Ui Component: @util/ui 라이브러리 사용
		 - 조건부 클래스: clsx 라이브러리 사용
	 코드 스타일
		 - 색상: 하드코딩(bg-red) 대신 테마 색상(bg-primary) 사용
		 - 조건부 렌더링: field && <div>... 대신 field ? <div>... : null 사용
		 - 모델 접근: 구조분해할당 대신 ${modelName}.field 형식으로 접근
		 - 타입 안전: ${modelName}.constant.ts의 스키마 참조하여 에러 방지
	 필드 접근 전: 스키마의 실제 필드 리스트 작성 및 검토 필수
	 
	 엄격한 주의사항
		 - UI 킷은 문서에 명시된 컴포넌트만 사용
		 - 컴포넌트 사용 전 문서 확인 및 props 정확히 검증
		 - 명시된 룰 외 임의 추상화 금지
		 - dayjs 라이브러리는 @akanjs/base에서 래핑하여 제공하고 있음.
		 - util/ui 이외에 명시되있지 않은 컴포넌트 절대 사용 금지. 

		요청사항
		- 아래 제공할 기본 템플릿 코드에 추가로 컴포넌트 개발
		- ${ModelName}.View.tsx 코드 작성
		- 컴포넌트 이름에 ${ModelName}은 생략하며, 디자인 중점의 이름으로 작성
		- 아래 제공할 보일러플레이트에 있는 General 컴포넌트 1개를 제외한 디자인 컴포넌트 4개 개발 
		- 추상화 해야하는 경우가 있을 경우엔 문서를 다시 참고하고 설명된 내에서 해결해야함.
		- 보일러플레이트에 맞게 정리해서 제공
   		- UI 킷은 문서에 명시된 컴포넌트만 사용
		
	
	Application name: ${sysName}
	Model name: ${modelName}
	
	Target filename: ${ModelName}.View.tsx
		\`\`\`
		${boilerplate}
		\`\`\`
	
	 
	`;

interface RequestUnitProps extends RequestProps {
  constant: string;
  properties: { key: string; source: string }[];
}

export const requestUnit = ({
  sysName,
  modelName,
  ModelName,
  constant,
  properties,
  boilerplate,
  exampleFiles,
}: RequestUnitProps) => `
	 ${prompt.componentDefaultDescription({
     sysName,
     modelName,
     ModelName: ModelName ?? capitalize(modelName),
     exampleFiles,
     constant,
     properties,
   })}

		역할부여 
	 - Akan.js 사내 프레임워크 기반 Typescript 시니어 프론트엔드 개발자.
 
	 코딩 규칙
		 - 라이브러리 사용
		 - 아이콘: react-icons 라이브러리 사용
		 - CSS: tailwind, DaisyUI(card/hero 같은 복잡한 컴포넌트 사용 X) 사용
		 - Ui Component: @util/ui 라이브러리 사용
		 - 조건부 클래스: clsx 라이브러리 사용
	 코드 스타일
		 - 색상: 하드코딩(bg-red) 대신 테마 색상(bg-primary) 사용
		 - 조건부 렌더링: field && <div>... 대신 field ? <div>... : null 사용
		 - 모델 접근: 구조분해할당 대신 ${modelName}.field 형식으로 접근
		 - 타입 안전: ${modelName}.constant.ts의 스키마 참조하여 에러 방지
	 필드 접근 전: 스키마의 실제 필드 리스트 작성 및 검토 필수
	 
	 엄격한 주의사항
		 - UI 킷은 문서에 명시된 컴포넌트만 사용
		 - 컴포넌트 사용 전 문서 확인 및 props 정확히 검증
		 - 명시된 룰 외 임의 추상화 금지
		 - dayjs 라이브러리는 @akanjs/base에서 래핑하여 제공하고 있음.
	
		요청사항
		- 아래 제공할 기본 템플릿 코드에 추가로 컴포넌트 개발
		- ${ModelName}.Unit.tsx 코드 작성
		- 컴포넌트 이름에 ${ModelName}은 생략하며, 디자인 중점의 이름으로 작성
		- 예시파일 컴포넌트의 기반하여 일반적으로 사용 가능한 컴포넌트 1개와 디자인적 요소가 포함된 컴포넌트 3개 개발
		- 추상화 해야하는 경우가 있을 경우엔 문서를 다시 참고하고 설명된 내에서 해결해야함.
		- 보일러플레이트에 맞게 정리해서 제공
	
	
	Application name: ${sysName}
	Model name: ${modelName}
	
	Target filename: ${ModelName}.Unit.tsx
		\`\`\`
		${boilerplate}
		\`\`\`
	
	 
	`;
