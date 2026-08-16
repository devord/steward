import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

/**
 * The variable an identifier reference binds to, or null when it is free.
 *
 * Extracted because three rules carried their own byte-identical copy, and a
 * fix to one of them reached none of the others.
 */
export function resolveVariable(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

/**
 * The initializer of a `const` that is written exactly once, or null.
 *
 * Used to see through a hoisted binding: a pattern moved into a named const
 * one line above is the same pattern, and a rule that only inspects the
 * inline form teaches authors to hoist it rather than to stop writing it.
 */
export function constInitializer(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
): ESTree.Expression | null {
	const variable = resolveVariable(sourceCode, identifier);
	if (variable === null || variable.defs.length !== 1) return null;
	if (variable.references.some((reference) => reference.isWrite() && !reference.init)) {
		return null;
	}
	const [definition] = variable.defs;
	if (definition === undefined || definition.type !== "Variable") return null;
	const declarator = definition.node;
	if (declarator.type !== "VariableDeclarator") return null;
	if (declarator.parent.type !== "VariableDeclaration") return null;
	if (declarator.parent.kind !== "const") return null;
	return declarator.init;
}
