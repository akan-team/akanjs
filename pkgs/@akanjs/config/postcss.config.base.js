const path = require("path");

const withBase = (config = {}) => ({
  ...config,
  plugins: {
    ...(process.env.USE_AKANJS_PKGS === "true"
      ? {
          "postcss-import": {
            resolve(id) {
              if (id.startsWith("@akanjs/config")) return path.resolve(__dirname, id.replace("@akanjs/config/", ""));
              else if (id.startsWith("@akanjs/ui"))
                return path.resolve(__dirname, "../ui", id.replace("@akanjs/ui/", ""));
              else return id;
            },
          },
        }
      : {}),
    "@tailwindcss/postcss": process.env.AKAN_WORKSPACE_ROOT
      ? { base: path.join(process.env.AKAN_WORKSPACE_ROOT, "./") }
      : {},
    ...(config.plugins ?? {}),
  },
});

module.exports = { withBase };
