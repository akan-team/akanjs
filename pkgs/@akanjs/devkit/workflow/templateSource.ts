import { moduleComponentName } from "./modulePaths";

export const insertTemplateField = ({
  content,
  moduleName,
  moduleClassName,
  fieldName,
  component,
}: {
  content: string;
  moduleName: string;
  moduleClassName: string;
  fieldName: string;
  component: "Field.Text" | "Field.Number" | "Field.Date";
}) => {
  if (content.includes(`l("${moduleName}.${fieldName}")`) || content.includes(`.${fieldName}`)) return content;
  const layoutEndIndex = content.indexOf("    </Layout.Template>");
  if (layoutEndIndex < 0) return null;
  const formName = `${moduleName}Form`;
  if (!content.includes(`const ${formName} = st.use.${moduleName}Form();`)) return null;
  const fieldSetter = `st.do.set${moduleComponentName(fieldName)}On${moduleClassName}`;
  const fieldBlock = `      <${component}
        label={l("${moduleName}.${fieldName}")}
        desc={l("${moduleName}.${fieldName}.desc")}
        value={${formName}.${fieldName}}
        onChange={${fieldSetter}}
      />
`;
  return `${content.slice(0, layoutEndIndex)}${fieldBlock}${content.slice(layoutEndIndex)}`;
};
