import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

const nextConfig = nextPlugin.configs["core-web-vitals"];
const hooksConfig = reactHooks.configs.flat.recommended;

export default [
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    ...nextConfig,
    plugins: {
      ...nextConfig.plugins,
      ...hooksConfig.plugins,
    },
    rules: {
      ...nextConfig.rules,
      ...Object.fromEntries(
        Object.keys(hooksConfig.rules).map(k => [k, "warn"])
      ),
    },
  },
];
