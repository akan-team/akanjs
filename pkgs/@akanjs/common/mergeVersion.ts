/**
 *
 * semantic version 규격에 맞게 조합하는 함수
 * https://semver.org/
 * @param major 릴리즈(플랫폼(google,apple,etc...)에 올라가 있는) 버전
 * @param minor 릴리즈(플랫폼(google,apple,etc...)에 올라가 있는) 버전
 * @param patch 코드푸시 (Framework 자체 버전)
 * @returns `major.minor.patch` 형식으로 조합된 버전
 */
export const mergeVersion = (major: number, minor: number, patch: number) => `${major}.${minor}.${patch}`;
