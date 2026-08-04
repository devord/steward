import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { playwright } from "@vitest/browser-playwright"
import mdx from "fumadocs-mdx/vite"
import { defineConfig } from "vitest/config"

import {
  mouseDrag,
  mouseRelease,
  touchDrag,
} from "./app/mocks/pointer-commands.ts"

// Source maps are built only when there is somewhere to send them: the
// production deploy job holds SENTRY_AUTH_TOKEN and nothing else does, so a
// local `pnpm build` and a preview build stay map-free. `hidden` emits the
// maps without a `sourceMappingURL` comment — sentry-cli links them by debug
// ID instead, and the CI step deletes them before upload so they never ship
// (ADR-0058).
const sourcemap = process.env.SENTRY_AUTH_TOKEN ? ("hidden" as const) : false

// The Sentry release: the deploy commit, baked in so it matches what the
// source maps were uploaded under — only the build knows that, so a runtime
// variable could disagree. Empty outside CI ⇒ events carry no release, which
// is the honest answer for a build nobody uploaded. Forced empty under
// vitest: GitHub Actions always sets GITHUB_SHA, and a release that exists
// only in CI is a test that only fails there.
const release =
  process.env.VITEST || !process.env.GITHUB_SHA ? "" : process.env.GITHUB_SHA

export default defineConfig({
  define: {
    // react-grid-layout's react-draggable reads `process.env.DRAGGABLE_DEBUG`
    // at drag start; the client bundle has no `process`, so without this the
    // first drag throws "process is not defined". Replace the read with a
    // literal so it compiles away (in the app build and both test projects).
    "process.env.DRAGGABLE_DEBUG": "false",
    "process.env.SENTRY_RELEASE": JSON.stringify(release),
  },
  // Vite 8 builds the client and SSR environments separately and the
  // top-level `build.sourcemap` does not reliably reach the per-environment
  // client build — set it on both, or sentry-cli finds maps for only one
  // half of every stack trace.
  build: { sourcemap },
  environments: {
    client: { build: { sourcemap } },
    ssr: { build: { sourcemap } },
  },
  // The React Router framework plugin expects its react-refresh preamble
  // and full app context; under vitest (unit and browser projects alike)
  // plain Vite's esbuild JSX transform is all the tests need.
  plugins: [mdx(), tailwindcss(), !process.env.VITEST && reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  // Two test projects on a node-vs-browser axis. `unit` covers pure logic
  // and server loaders (GitHub mocked with MSW); `browser` runs
  // *.browser.test.{ts,tsx} in real Chromium — the grid drag math needs real
  // layout (getBoundingClientRect), which jsdom cannot provide, and the
  // artifact fit pass needs a real iframe it can measure and mutate.
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // `.browser.` files belong to the other project — a browser
          // test need not contain JSX, so match on the infix, not .tsx.
          include: ["app/**/*.test.ts"],
          exclude: ["app/**/*.browser.test.ts"],
          setupFiles: ["./app/mocks/setup-node.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["app/**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            // Real stepped mouse/touch input — see pointer-commands.ts for
            // why `userEvent.dragAndDrop` isn't enough for a grid gesture.
            commands: { mouseDrag, mouseRelease, touchDrag },
            instances: [
              {
                browser: "chromium",
                // Wider than the 1100px breakpoint: pointer drag only
                // arms on the 4-column desktop grid.
                viewport: { width: 1280, height: 900 },
              },
            ],
          },
        },
      },
    ],
  },
})
