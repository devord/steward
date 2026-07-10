import { defineConfig } from "vite-plus"

export default defineConfig({
  lint: {
    plugins: ["typescript", "import", "react"],
    rules: {
      "no-debugger": "error",
      "no-var": "error",
      "no-eval": "error",
      "prefer-const": "error",
      // Allow `x == null` (idiomatic null-or-undefined check); flag every
      // other loose-equality use.
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-vars": "warn",
      "no-console": "off",
      // Route in-app navigation through ~/components/ui/link, which defaults
      // prefetch to "intent" so route data loads on hover/focus. React
      // Router's raw Link has no prefetch by default.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-router",
              importNames: ["Link", "NavLink"],
              message:
                "Import Link from ~/components/ui/link instead; it defaults prefetch to intent for faster navigation.",
            },
          ],
        },
      ],
      "import/no-duplicates": "error",
      "import/no-self-import": "error",
      "import/no-cycle": "warn",
      "typescript/no-explicit-any": "warn",
      "typescript/no-non-null-assertion": "warn",
      "typescript/no-unused-vars": "warn",
      "typescript/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
    },
    ignorePatterns: [
      "**/node_modules/",
      "**/dist/",
      "**/build/",
      "**/.turbo/",
      "**/.react-router/",
      "**/.vercel/",
      "**/coverage/",
    ],
    overrides: [
      {
        // Test files legitimately cast partial mocks to full types and use
        // `as any` to exercise invalid-input error paths. Production code
        // stays strict.
        files: ["**/*.test.ts", "**/*.spec.ts"],
        rules: {
          "typescript/consistent-type-assertions": "off",
          "typescript/no-explicit-any": "off",
        },
      },
      {
        // The Link wrapper is the one place allowed to reach for React
        // Router's Link — it's what re-exports it with the prefetch default.
        files: ["**/components/ui/link.tsx"],
        rules: {
          "no-restricted-imports": "off",
        },
      },
    ],
  },
  fmt: {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    semi: false,
    singleQuote: false,
    trailingComma: "all",
    bracketSpacing: true,
    arrowParens: "always",
    endOfLine: "lf",
    // react-router skill docs are vendored from the upstream template;
    // don't reformat them so future re-syncs stay diff-clean.
    ignorePatterns: ["**/CHANGELOG.md", ".claude/skills/react-router/**"],
  },
  staged: {
    "*.{js,ts,tsx,json,md,sh}": "vp check --fix",
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  },
})
