import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    ignores: [".next/**", "node_modules/**", "contracts/**", "data/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module" },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
