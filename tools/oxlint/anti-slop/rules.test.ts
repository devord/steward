import type { Rule } from "@oxlint/plugins"
import { describe, expect, it } from "vitest"

import { noChainedTypeAssertionsRule } from "./rules/no-chained-type-assertions.ts"
import { noConditionalEmptyObjectSpreadRule } from "./rules/no-conditional-empty-object-spread.ts"
import { noForbiddenTermInSymbolNamesRule } from "./rules/no-shape-in-symbol-names.ts"
import { noUnknownTypeAliasesRule } from "./rules/no-unknown-type-aliases.ts"
import { noRuntimeTypeofRule } from "./rules/no-runtime-typeof.ts"
import { requireSafetyCommentForTypeAssertionRule } from "./rules/require-safety-comment-for-type-assertion.ts"

/**
 * Unit tests for the vendored rules — the gate the plugin shipped without.
 *
 * These drive each rule's visitor with synthetic nodes rather than running
 * oxlint over fixtures. `vp lint` owns its own `-c`, so a fixture run cannot
 * be pointed at a config of its own, and fixtures placed where the repo lints
 * them would fail `pnpm check` by design. Calling the visitor is the part
 * worth covering anyway: every bug fixed below was in a tree walk.
 *
 * Each case names the behaviour it pins. A rule that stops reporting what it
 * promises is as broken as one that reports what it should not.
 */

interface Report {
  messageId: string
  data?: Record<string, unknown>
}

/**
 * `defineRule` returns `CreateRule | CreateOnceRule`, so the visitor factory
 * has to be narrowed before it can be called. Every rule here is the
 * `createOnce` kind; a rule that stopped being one should fail loudly.
 */
function visitorsOf(rule: Rule, context: unknown) {
  if (!("createOnce" in rule)) throw new Error("not a createOnce rule")
  return rule.createOnce(context as never)
}

/** The slice of the rule context these three rules actually read. */
function contextFor(options: unknown[], comments: string[] = []) {
  const reports: Report[] = []
  return {
    reports,
    context: {
      options,
      report: (r: Report) => reports.push(r),
      sourceCode: {
        getCommentsBefore: (node: { ownComments?: string[] }) =>
          (node.ownComments ?? comments).map((value) => ({
            value,
            end: 0,
          })),
      },
    },
  }
}

/** Build a parent chain from the root down, returning the deepest node. */
function chain(...nodes: Record<string, unknown>[]) {
  for (let i = 1; i < nodes.length; i++) nodes[i].parent = nodes[i - 1]
  nodes[0].parent = null
  return nodes[nodes.length - 1]
}

describe("no-shape-in-symbol-names", () => {
  const run = (node: Record<string, unknown>, options: unknown[] = [{}]) => {
    const { reports, context } = contextFor(options)
    const visitors = visitorsOf(noForbiddenTermInSymbolNamesRule, context)
    visitors.Identifier?.(node as never)
    return reports
  }

  const ident = (name: string, parent: Record<string, unknown> | null = null) =>
    parent === null
      ? { type: "Identifier", name, parent: null }
      : chain(parent, { type: "Identifier", name })

  it("reports the term as a word", () => {
    expect(run(ident("namedShape"))).toHaveLength(1)
    expect(run(ident("shape"))).toHaveLength(1)
  })

  it("does not report a word that merely contains the term", () => {
    // The upstream rule used `includes("shape")` and rejected both.
    expect(run(ident("reshapeTiles"))).toEqual([])
    expect(run(ident("shapeless"))).toEqual([])
    expect(run(ident("reshape"))).toEqual([])
  })

  it("does not report a name this file cannot rename", () => {
    // `schema.shape` is zod's public API — a declared dependency here.
    const read = ident("shape", { type: "MemberExpression", computed: false })
    const member = read as { parent: { property?: unknown } }
    member.parent.property = read
    expect(run(read)).toEqual([])
  })

  it("still reports a computed member, which is a value not a property", () => {
    const key = ident("myShape", { type: "MemberExpression", computed: true })
    expect(run(key)).toHaveLength(1)
  })

  it("honours the allow option", () => {
    expect(run(ident("shape"), [{ allow: ["shape"] }])).toEqual([])
  })

  it("honours a custom term list", () => {
    expect(run(ident("dataBag"), [{ terms: ["bag"] }])).toHaveLength(1)
    expect(run(ident("namedShape"), [{ terms: ["bag"] }])).toEqual([])
  })
})

describe("require-safety-comment-for-type-assertion", () => {
  const run = (node: Record<string, unknown>) => {
    const { reports, context } = contextFor([])
    const visitors = visitorsOf(requireSafetyCommentForTypeAssertionRule, context)
    visitors.TSAsExpression?.(node as never)
    return reports
  }

  /** `export const x = raw as T`, with the comment above the `export`. */
  const exportedAssertion = (comment: string) => {
    const program = { type: "Program", ownComments: [] }
    const exported = { type: "ExportNamedDeclaration", ownComments: [comment] }
    const declaration = { type: "VariableDeclaration", ownComments: [] }
    const declarator = { type: "VariableDeclarator", ownComments: [] }
    return chain(program, exported, declaration, declarator, {
      type: "TSAsExpression",
      start: 100,
      typeAnnotation: { type: "TSStringKeyword" },
      ownComments: [],
    })
  }

  it("sees a SAFETY comment above an exported declaration", () => {
    // The upstream walk stopped at `VariableDeclaration`, so this comment was
    // invisible and the rule was unsatisfiable for every exported assertion.
    expect(run(exportedAssertion("SAFETY: checked upstream"))).toEqual([])
  })

  it("still reports an exported assertion with no justification", () => {
    expect(run(exportedAssertion("just a note"))).toHaveLength(1)
  })

  it("exempts a const assertion", () => {
    const program = { type: "Program", ownComments: [] }
    const node = chain(program, {
      type: "TSAsExpression",
      start: 10,
      typeAnnotation: {
        type: "TSTypeReference",
        typeName: { type: "Identifier", name: "const" },
      },
      ownComments: [],
    })
    expect(run(node)).toEqual([])
  })
})

describe("no-runtime-typeof", () => {
  const run = (node: Record<string, unknown>, allowInTypeGuards: boolean) => {
    const { reports, context } = contextFor([{ allowInTypeGuards }])
    const visitors = visitorsOf(noRuntimeTypeofRule, context)
    visitors.UnaryExpression?.(node as never)
    return reports
  }

  const predicate = { type: "TSTypePredicate" }

  /** `function f(v): v is T { return xs.every(() => typeof v === "s") }` */
  const insideCallbackInGuard = () =>
    chain(
      { type: "Program" },
      {
        type: "FunctionDeclaration",
        returnType: { typeAnnotation: predicate },
      },
      { type: "ArrowFunctionExpression", returnType: undefined },
      { type: "UnaryExpression", operator: "typeof" },
    )

  it("allows typeof in a callback inside a declared type guard", () => {
    // The upstream walk returned at the innermost function — the arrow, which
    // has no predicate — so every guard that checked inside `.every()` failed.
    expect(run(insideCallbackInGuard(), true)).toEqual([])
  })

  it("still reports typeof outside any guard", () => {
    const node = chain(
      { type: "Program" },
      { type: "FunctionDeclaration", returnType: undefined },
      { type: "UnaryExpression", operator: "typeof" },
    )
    expect(run(node, true)).toHaveLength(1)
  })

  it("reports even inside a guard when the option is off", () => {
    expect(run(insideCallbackInGuard(), false)).toHaveLength(1)
  })
})

describe("no-chained-type-assertions", () => {
  const run = (node: Record<string, unknown>) => {
    const { reports, context } = contextFor([])
    const visitors = visitorsOf(noChainedTypeAssertionsRule, context)
    visitors.TSAsExpression?.(node as never)
    return reports
  }

  const asExpr = (
    inner: Record<string, unknown>,
    name = "string",
  ): Record<string, unknown> => ({
    type: "TSAsExpression",
    expression: inner,
    typeAnnotation: {
      type: "TSTypeReference",
      typeName: { type: "Identifier", name },
    },
  })

  /** `raw as unknown as string`, with a wrapper sitting between the two. */
  const chainWith = (wrapperType: string | null) => {
    const innerAs = asExpr({ type: "Identifier", name: "raw" }, "unknown")
    const middle =
      wrapperType === null
        ? innerAs
        : { type: wrapperType, expression: innerAs }
    return chain({ type: "ExpressionStatement" }, asExpr(middle))
  }

  it("reports a plain chain", () => {
    expect(run(chainWith(null))).toHaveLength(1)
  })

  it("reports a chain broken by a non-null assertion", () => {
    // `(raw as unknown)! as string` — one character used to defeat the rule.
    expect(run(chainWith("TSNonNullExpression"))).toHaveLength(1)
  })

  it("reports a chain broken by satisfies", () => {
    expect(run(chainWith("TSSatisfiesExpression"))).toHaveLength(1)
  })

  it("leaves a single assertion alone", () => {
    const single = chain(
      { type: "ExpressionStatement" },
      asExpr({ type: "Identifier", name: "raw" }),
    )
    expect(run(single)).toEqual([])
  })
})

describe("no-conditional-empty-object-spread", () => {
  const run = (
    argument: Record<string, unknown>,
    initializers: Record<string, Record<string, unknown>> = {},
  ) => {
    const reports: Report[] = []
    const context = {
      options: [],
      report: (r: Report) => reports.push(r),
      sourceCode: {
        // One flat scope holding the consts a case declares, each written once.
        getScope: () => ({
          upper: null,
          set: new Map(
            Object.entries(initializers).map(([name, init]) => [
              name,
              {
                defs: [
                  {
                    type: "Variable",
                    node: {
                      type: "VariableDeclarator",
                      init,
                      parent: { type: "VariableDeclaration", kind: "const" },
                    },
                  },
                ],
                references: [],
              },
            ]),
          ),
        }),
      },
    }
    const visitors = visitorsOf(noConditionalEmptyObjectSpreadRule, context)
    visitors.SpreadElement?.({
      type: "SpreadElement",
      argument,
      parent: { type: "ObjectExpression" },
    } as never)
    return reports
  }

  const obj = { type: "ObjectExpression", properties: [{ type: "Property" }] }
  const empty = { type: "ObjectExpression", properties: [] }

  it("reports the inline ternary against an empty object", () => {
    expect(
      run({ type: "ConditionalExpression", consequent: obj, alternate: empty }),
    ).toHaveLength(1)
  })

  it("reports the undefined and null spellings", () => {
    expect(
      run({
        type: "ConditionalExpression",
        consequent: obj,
        alternate: { type: "Identifier", name: "undefined" },
      }),
    ).toHaveLength(1)
    expect(
      run({
        type: "ConditionalExpression",
        consequent: obj,
        alternate: { type: "Literal", value: null },
      }),
    ).toHaveLength(1)
  })

  it("reports the && spelling, whose falsy branch spreads a boolean", () => {
    expect(
      run({
        type: "LogicalExpression",
        operator: "&&",
        left: { type: "Identifier", name: "flag" },
        right: obj,
      }),
    ).toHaveLength(1)
  })

  it("reports the pattern hoisted into a const", () => {
    // The bypass an author reaches for after hitting the inline error, and the
    // form this repo already carried in add-routine-dialog.tsx.
    expect(
      run(
        { type: "Identifier", name: "part" },
        {
          part: {
            type: "ConditionalExpression",
            consequent: obj,
            alternate: empty,
          },
        },
      ),
    ).toHaveLength(1)
  })

  it("leaves an ordinary spread alone, hoisted or not", () => {
    expect(run(obj)).toEqual([])
    expect(run({ type: "Identifier", name: "base" }, { base: obj })).toEqual([])
  })

  it("leaves a guarded spread alone, which omits no named field", () => {
    // `cond ? someObject : {}` defaults an opaque value to empty; the fields
    // written beside it are unconditional. Reporting it confuses a guard with
    // an omission, and pushes authors to hoist rather than to stop.
    const guarded = {
      type: "ConditionalExpression",
      consequent: { type: "Identifier", name: "assembled" },
      alternate: empty,
    }
    expect(run(guarded)).toEqual([])
    expect(run({ type: "Identifier", name: "base" }, { base: guarded })).toEqual(
      [],
    )
  })
})

describe("the shared unknown resolver", () => {
  const run = (source: Record<string, unknown>) => {
    const { reports, context } = contextFor([])
    const visitors = visitorsOf(noUnknownTypeAliasesRule, context)
    visitors.Program?.(source as never)
    return reports
  }

  const alias = (name: string, annotation: Record<string, unknown>) => ({
    type: "TSTypeAliasDeclaration",
    id: { type: "Identifier", name },
    typeAnnotation: annotation,
    typeParameters: null,
  })

  it("sees through Promise<unknown>", () => {
    // The returns rule always handled this; the alias rule's own copy did not,
    // so the two disagreed about the same type.
    expect(
      run({
        type: "Program",
        body: [
          alias("Bag", {
            type: "TSTypeReference",
            typeName: { type: "Identifier", name: "Promise" },
            typeArguments: { params: [{ type: "TSUnknownKeyword" }] },
          }),
        ],
      }),
    ).toHaveLength(1)
  })

  it("sees an unknown member inside a union", () => {
    expect(
      run({
        type: "Program",
        body: [
          alias("Mixed", {
            type: "TSUnionType",
            types: [{ type: "TSStringKeyword" }, { type: "TSUnknownKeyword" }],
          }),
        ],
      }),
    ).toHaveLength(1)
  })

  it("leaves a concrete alias alone", () => {
    expect(
      run({
        type: "Program",
        body: [alias("Name", { type: "TSStringKeyword" })],
      }),
    ).toEqual([])
  })
})
