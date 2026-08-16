import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

type TypeAssertionExpression = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

function isTypeAssertionExpression(node: ESTree.Node): node is TypeAssertionExpression {
  return node.type === "TSAsExpression" || node.type === "TSTypeAssertion";
}

/**
 * Wrappers that sit between two assertions without breaking the chain.
 *
 * `x as unknown as T` is the laundering this rule exists to stop, and a single
 * `!` or `satisfies` between the two used to defeat it entirely — the walk
 * stopped at the wrapper with `assertionCount === 1` and reported nothing.
 * None of these three changes the value; they only annotate it.
 */
type ChainWrapper =
  | ESTree.ParenthesizedExpression
  | ESTree.TSNonNullExpression
  | ESTree.TSSatisfiesExpression
  | ESTree.TSInstantiationExpression;

function isChainWrapper(node: ESTree.Node): node is ChainWrapper {
  return (
    node.type === "ParenthesizedExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSInstantiationExpression"
  );
}

function unwrapChainWrappers(expression: ESTree.Expression): ESTree.Expression {
  let current: ESTree.Expression = expression;
  while (isChainWrapper(current)) current = current.expression;
  return current;
}

function isConstAssertion(node: TypeAssertionExpression): boolean {
  const { typeAnnotation } = node;
  return (
    typeAnnotation.type === "TSTypeReference" &&
    typeAnnotation.typeName.type === "Identifier" &&
    typeAnnotation.typeName.name === "const"
  );
}

function isOutermostAssertionInChain(node: TypeAssertionExpression): boolean {
  let current: ESTree.Expression = node;
  let parent = node.parent;

  while (isChainWrapper(parent) && parent.expression === current) {
    current = parent;
    parent = parent.parent;
  }

  return !isTypeAssertionExpression(parent) || parent.expression !== current;
}

function isForbiddenAssertionChain(node: TypeAssertionExpression): boolean {
  let assertionCount = 0;
  let hasNonConstAssertion = false;
  let current: ESTree.Expression = node;

  while (isTypeAssertionExpression(current)) {
    assertionCount += 1;
    hasNonConstAssertion ||= !isConstAssertion(current);
    current = unwrapChainWrappers(current.expression);
  }

  return assertionCount > 1 && hasNonConstAssertion;
}

/** Disallow nested TypeScript type assertions, while permitting chains made only of const assertions. */
export const noChainedTypeAssertionsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow chained TypeScript as and angle-bracket assertions, including parenthesized chains.",
    },
    messages: {
      chained:
        "This assertion chain discards type evidence. Keep the original precise type, or parse untrusted input at its boundary before narrowing it.",
    },
  },
  createOnce(context) {
    const checkTypeAssertion = (node: TypeAssertionExpression) => {
      if (!isOutermostAssertionInChain(node) || !isForbiddenAssertionChain(node)) return;
      context.report({ node, messageId: "chained" });
    };

    return {
      TSAsExpression: checkTypeAssertion,
      TSTypeAssertion: checkTypeAssertion,
    };
  },
});
