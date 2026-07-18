import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"

import { Flow, FlowLoop, FlowPhase, FlowStep } from "./flow.tsx"

/** Component set every docs MDX page renders with. */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Flow,
    FlowStep,
    FlowLoop,
    FlowPhase,
    ...components,
  }
}
