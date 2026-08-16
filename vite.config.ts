import { defineConfig } from "vite-plus"

export default defineConfig({
  lint: {
    plugins: ["typescript", "import", "react"],
    jsPlugins: [
      { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    ],
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
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      // `typeof` is allowed only inside a declared type guard (`v is T`).
      // That is the discipline the rule asks for: every representation check
      // sits in one named predicate that hands back a domain type, instead of
      // being scattered inline across the walkers that consume it.
      "anti-slop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
    },
    ignorePatterns: [
      "**/node_modules/",
      "**/dist/",
      "**/build/",
      "**/.turbo/",
      "**/.react-router/",
      "**/.vercel/",
      "**/coverage/",
      // Transient harness worktree copies of the repo — never lint them.
      "**/.claude/worktrees/",
      // Committed build output of @steward/artifact-kit (ADR-0050). It lives
      // in the skill tree rather than a dist/ because that is how it travels
      // to a routine run, but it is generated and minified all the same.
      ".claude/skills/widget-artifact/kit/kit.css",
      ".claude/skills/widget-artifact/kit/render.mjs",
      ".claude/skills/widget-artifact/kit/throughput.js",
      // Config other agent harnesses generate into the repo. `.claude/` is
      // deliberately absent: this repo *owns* the skill scripts under
      // `.claude/skills/`, so they stay linted like the rest of the source.
      ".agent/**",
      ".agents/**",
      ".codex/**",
      ".continue/**",
      ".cursor/**",
      ".gemini/**",
      ".opencode/**",
      ".pi/**",
      ".roo/**",
      ".windsurf/**",
      // The anti-slop plugin is vendored from the install-anti-slop skill.
      // It is Oxlint's own input, not repo source, and it does not follow
      // this repo's style (tabs, its own import conventions).
      "tools/oxlint/anti-slop/**",
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
    // Transient harness worktree copies of the repo are excluded wholesale.
    ignorePatterns: [
      "**/CHANGELOG.md",
      ".claude/skills/react-router/**",
      "**/.claude/worktrees/**",
      // Generated, minified artifact-kit output (ADR-0050). Beyond being
      // pointless to format, running the formatter over the 240 KB minified
      // bundle aborts it outright.
      ".claude/skills/widget-artifact/kit/kit.css",
      ".claude/skills/widget-artifact/kit/render.mjs",
      ".claude/skills/widget-artifact/kit/throughput.js",
      // The built-ins' picker previews (ADR-0037), likewise generated — by
      // `scripts/gen-template-previews.ts`, from the same renderer. Formatting
      // them would put the formatter and CI's drift check in a loop: the
      // generator emits the renderer's exact bytes, the formatter rewrites
      // them, and the next `git status` reports output nobody edited.
      "docs/samples/**",
      // Same two exclusions as `lint.ignorePatterns`: assets other agent
      // harnesses install, and the vendored anti-slop plugin. Reformatting
      // the plugin would only make the next skill re-install a fake diff.
      ".agent/**",
      ".agents/**",
      ".codex/**",
      ".continue/**",
      ".cursor/**",
      ".gemini/**",
      ".opencode/**",
      ".pi/**",
      ".roo/**",
      ".windsurf/**",
      "tools/oxlint/anti-slop/**",
    ],
  },
  staged: {
    "*.{js,ts,tsx,json,md,sh}": "vp check --fix",
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  },
})
