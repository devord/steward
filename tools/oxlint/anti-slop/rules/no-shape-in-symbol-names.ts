import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const DEFAULT_TERMS = ["shape"];

/**
 * Split an identifier into its words so a term matches as a *word*, not as a
 * substring. `reshapeTiles` and `shapeless` are not shape-named symbols, and
 * the upstream rule rejected both.
 */
function words(name: string): string[] {
	return name
		.replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
		.split(/[^A-Za-z0-9]+|\s+/u)
		.filter(Boolean)
		.map((word) => word.toLowerCase());
}

function namesForbiddenTerm(name: string, terms: readonly string[]): string | null {
	const parts = words(name);
	return terms.find((term) => parts.includes(term)) ?? null;
}

/**
 * A name this file does not own, so the author cannot rename it.
 *
 * Two cases, and both are reads rather than declarations: a non-computed
 * member read (`schema.shape` — zod's public API) and the tail of a qualified
 * type name (`z.shape`). The upstream rule reported every `Identifier`, which
 * made any third-party member named `*shape*` an unfixable error.
 */
function isBorrowedName(node: ESTree.Node): boolean {
	const parent = node.parent;
	if (parent === null) return false;
	if (parent.type === "MemberExpression")
		return parent.property === node && !parent.computed;
	if (parent.type === "TSQualifiedName") return parent.right === node;
	if (parent.type === "ImportSpecifier") return parent.imported === node;
	return false;
}

/** Ban a forbidden term as a *word* in every symbol name this file declares. */
export const noForbiddenTermInSymbolNamesRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				'Disallow structural terms such as "shape" as words in declared symbol names.',
		},
		messages: {
			forbiddenSymbolName:
				'Rename symbol "{{name}}" for its domain role; "{{term}}" describes structure rather than ownership.',
		},
		schema: [
			{
				type: "object",
				properties: {
					terms: { type: "array", items: { type: "string" } },
					allow: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{}],
	},
	createOnce(context) {
		const option = context.options?.[0];
		const settings =
			typeof option === "object" && option !== null && !Array.isArray(option)
				? option
				: {};
		const terms = Array.isArray(settings.terms)
			? settings.terms.map((term) => String(term).toLowerCase())
			: DEFAULT_TERMS;
		const allow = new Set(
			(Array.isArray(settings.allow) ? settings.allow : []).map((name) =>
				String(name),
			),
		);

		const reportForbiddenSymbolName = (
			node: ESTree.Node & { name: string },
		) => {
			if (allow.has(node.name) || isBorrowedName(node)) return;
			const term = namesForbiddenTerm(node.name, terms);
			if (term === null) return;
			context.report({
				node,
				messageId: "forbiddenSymbolName",
				data: { name: node.name, term },
			});
		};

		return {
			Identifier: reportForbiddenSymbolName,
			PrivateIdentifier: reportForbiddenSymbolName,
			JSXIdentifier: reportForbiddenSymbolName,
		};
	},
});
