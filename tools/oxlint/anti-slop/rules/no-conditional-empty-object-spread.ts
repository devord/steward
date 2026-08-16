import { defineRule } from "@oxlint/plugins";
import type { ESTree, SourceCode } from "@oxlint/plugins";

import { constInitializer } from "../shared/resolve-variable.ts";

function unwrapParentheses(node: ESTree.Expression): ESTree.Expression {
	let current = node;
	while (current.type === "ParenthesizedExpression") {
		current = current.expression;
	}
	return current;
}

/**
 * A branch that contributes nothing when spread.
 *
 * `{}` is the obvious one. `undefined` and `null` spread to nothing just the
 * same, and both were legal ways to write the pattern the rule bans.
 */
function isEmptyBranch(node: ESTree.Expression): boolean {
	const expression = unwrapParentheses(node);
	if (expression.type === "ObjectExpression") return expression.properties.length === 0;
	if (expression.type === "Identifier") return expression.name === "undefined";
	// `null` carries the `Literal` discriminant, not a `NullLiteral` one.
	return expression.type === "Literal" && expression.value === null;
}

/**
 * Whether an expression omits a property behind a condition.
 *
 * Three spellings, all the same shape:
 *   `cond ? { a } : {}`   the original
 *   `cond && { a }`       the falsy branch spreads a boolean, a no-op
 *   `cond ? { a } : undefined`
 */
/**
 * A branch that names fields — an object literal with properties in it.
 *
 * Required on the non-empty side, because the rule is about *omitting a
 * field*, not about guarding a spread. `cond ? someObject : {}` defaults an
 * opaque value to empty and the properties beside it are unconditional; only
 * a literal on one side and nothing on the other hides a named field.
 */
function namesFields(node: ESTree.Expression): boolean {
	const expression = unwrapParentheses(node);
	return (
		expression.type === "ObjectExpression" &&
		// At least one *own* key. A literal that only spreads — `{ ...scale }` —
		// names nothing itself, so guarding it omits no field.
		expression.properties.some((property) => property.type !== "SpreadElement")
	);
}

function omitsConditionally(node: ESTree.Expression): boolean {
	const expression = unwrapParentheses(node);
	if (expression.type === "ConditionalExpression") {
		return (
			(isEmptyBranch(expression.alternate) && namesFields(expression.consequent)) ||
			(isEmptyBranch(expression.consequent) && namesFields(expression.alternate))
		);
	}
	return (
		expression.type === "LogicalExpression" &&
		expression.operator === "&&" &&
		namesFields(expression.right)
	);
}

/**
 * The same question, following one hoisted `const`.
 *
 * `const part = cond ? { a } : {}` then `{ ...part }` is the inline pattern
 * with a name attached — and it was the form the rule missed, so an author who
 * hit the error could satisfy it by moving the ternary up one line.
 */
function spreadOmitsConditionally(
	sourceCode: SourceCode,
	argument: ESTree.Expression,
): boolean {
	const expression = unwrapParentheses(argument);
	if (omitsConditionally(expression)) return true;
	if (expression.type !== "Identifier") return false;
	const initializer = constInitializer(sourceCode, expression);
	return initializer !== null && omitsConditionally(initializer);
}

/** Ban conditional empty-object spreads without changing their omission semantics. */
export const noConditionalEmptyObjectSpreadRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow object spreads that conditionally spread nothing to omit fields, inline or through a hoisted const.",
		},
		messages: {
			avoid:
				"This conditional spread hides property omission behind an empty value. Build the object in separate statements and add the property only when present.",
		},
	},
	createOnce(context) {
		return {
			SpreadElement(node) {
				if (node.parent.type !== "ObjectExpression") return;
				if (!spreadOmitsConditionally(context.sourceCode, node.argument)) return;
				context.report({ node, messageId: "avoid" });
			},
		};
	},
});
