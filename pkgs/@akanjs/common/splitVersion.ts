/**
 *
 * semantic version 규격에 맞게 major, minor, patch로 나누는 함수
 * https://semver.org/
 * @params version `major.minor.patch` 형식으로 조합된 버전
 */
export const splitVersion = (version: string) => {
  const [major, minor, patch] = version.split(".");
  return { major, minor, patch };
};
