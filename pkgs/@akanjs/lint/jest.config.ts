/* eslint-disable */
export default {
  displayName: "eslint-rules",
  // preset: "../../pkgs/@akanjs/config/jest.preset.js",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
  moduleFileExtensions: ["ts", "js", "html"],
  coverageDirectory: "../../../coverage/pkgs/@akanjs/lint",
};
