import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { playwright } from "@vitest/browser-playwright"
import mdx from "fumadocs-mdx/vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // react-grid-layout's react-draggable reads `process.env.DRAGGABLE_DEBUG`
  // at drag start; the client bundle has no `process`, so without this the
  // first drag throws "process is not defined". Replace the read with a
  // literal so it compiles away (in the app build and both test projects).
  define: { "process.env.DRAGGABLE_DEBUG": "false" },
  // The React Router framework plugin expects its react-refresh preamble
  // and full app context; under vitest (unit and browser projects alike)
  // plain Vite's esbuild JSX transform is all the tests need.
  plugins: [mdx(), tailwindcss(), !process.env.VITEST && reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  // Two test projects on a node-vs-browser axis. `unit` covers pure logic
  // and server loaders (GitHub mocked with MSW); `browser` runs
  // *.browser.test.tsx in real Chromium — the grid drag math needs real
  // layout (getBoundingClientRect), which jsdom cannot provide.
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["app/**/*.test.ts"],
          setupFiles: ["./app/mocks/setup-node.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["app/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
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
