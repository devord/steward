import type { ESTree } from "@oxlint/plugins";

/**
 * One resolver for the whole `unknown` family.
 *
 * `no-unknown-returns`, `no-unknown-type-aliases` and `no-unknown-parameters`
 * each carried their own copy, and the copies had drifted: only the returns
 * rule understood unions and `Promise<unknown>`, and the parameters rule
 * resolved no aliases at all — so `type Alias = unknown` slipped past two of
 * the three. Sharing one implementation is the fix; the drift was the bug.
 */

export type AliasTable = ReadonlyMap<string, ESTree.TSTypeAliasDeclaration>;

/** The alias an unapplied type reference names, or null. */
export function referencedAliasName(type: ESTree.TSType): string | null {
	if (type.type === "TSParenthesizedType") return referencedAliasName(type.typeAnnotation);
	if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return null;
	return type.typeArguments === null ||
		type.typeArguments === undefined ||
		type.typeArguments.params.length === 0
		? type.typeName.name
		: null;
}

/** Every top-level type alias in a program, exported or not. */
export function collectTypeAliases(
	program: ESTree.Program,
): Map<string, ESTree.TSTypeAliasDeclaration> {
	const aliases = new Map<string, ESTree.TSTypeAliasDeclaration>();
	for (const statement of program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
		if (declaration?.type === "TSTypeAliasDeclaration") {
			aliases.set(declaration.id.name, declaration);
		}
	}
	return aliases;
}

/**
 * Whether a written type is `unknown` once aliases, unions, parentheses and
 * promise wrappers are resolved.
 *
 * `shadowedAliases` names the type parameters in lexical scope: a `T` bound by
 * the enclosing function is not the file's `type T = unknown`.
 */
export function resolvesToUnknown(
	type: ESTree.TSType,
	aliases: AliasTable,
	shadowedAliases: ReadonlySet<string> = new Set(),
	visited: ReadonlySet<string> = new Set(),
): boolean {
	if (type.type === "TSUnknownKeyword") return true;
	if (type.type === "TSParenthesizedType") {
		return resolvesToUnknown(type.typeAnnotation, aliases, shadowedAliases, visited);
	}
	if (type.type === "TSUnionType") {
		return type.types.some((member) =>
			resolvesToUnknown(member, aliases, shadowedAliases, visited),
		);
	}
	if (
		type.type === "TSTypeReference" &&
		type.typeName.type === "Identifier" &&
		(type.typeName.name === "Promise" || type.typeName.name === "PromiseLike")
	) {
		const value = type.typeArguments?.params[0];
		return (
			value !== undefined && resolvesToUnknown(value, aliases, shadowedAliases, visited)
		);
	}
	const name = referencedAliasName(type);
	if (name === null || visited.has(name) || shadowedAliases.has(name)) return false;
	const alias = aliases.get(name);
	if (
		alias === undefined ||
		(alias.typeParameters !== null && alias.typeParameters !== undefined)
	) {
		return false;
	}
	const nextVisited = new Set(visited);
	nextVisited.add(name);
	return resolvesToUnknown(alias.typeAnnotation, aliases, shadowedAliases, nextVisited);
}
