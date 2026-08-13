import { defineRule } from '@oxlint/plugins';
import type { ESTree, SourceCode, Variable } from '@oxlint/plugins';

type Parameter = ESTree.ParamPattern;
type ParameterOwner =
	| ESTree.ArrowFunctionExpression
	| ESTree.Function
	| ESTree.TSCallSignatureDeclaration
	| ESTree.TSConstructSignatureDeclaration
	| ESTree.TSConstructorType
	| ESTree.TSFunctionType
	| ESTree.TSMethodSignature;

type ConcreteParameterOwner =
	| ESTree.ArrowFunctionExpression
	| ESTree.FunctionDeclaration
	| ESTree.FunctionExpression;

const VALIBOT_DECODERS = new Set(['is', 'parse', 'parseAsync', 'safeParse', 'safeParseAsync']);

interface ValibotImports {
	readonly namespaces: ReadonlySet<string>;
	readonly decoders: ReadonlySet<string>;
}

function parameterAnnotation(parameter: Parameter): ESTree.TSTypeAnnotation | null | undefined {
	if (parameter.type === 'TSParameterProperty') {
		return parameterAnnotation(parameter.parameter);
	}
	if (parameter.type === 'RestElement') {
		return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
	}
	if (parameter.type === 'AssignmentPattern') {
		return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
	}
	return parameter.typeAnnotation;
}

function parameterName(parameter: Parameter, sourceText: string): string {
	if (parameter.type === 'TSParameterProperty') {
		return parameterName(parameter.parameter, sourceText);
	}
	if (parameter.type === 'AssignmentPattern') {
		return parameterName(parameter.left, sourceText);
	}
	if (parameter.type === 'RestElement') {
		return parameterName(parameter.argument, sourceText);
	}
	return parameter.type === 'Identifier'
		? parameter.name
		: sourceText.replace(/\s*:\s*unknown\s*$/u, '');
}

function collectValibotImports(program: ESTree.Program): ValibotImports {
	const namespaces = new Set<string>();
	const decoders = new Set<string>();

	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration' || statement.source.value !== 'valibot') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type === 'ImportNamespaceSpecifier') {
				namespaces.add(specifier.local.name);
				continue;
			}
			if (specifier.type !== 'ImportSpecifier') continue;
			const imported =
				specifier.imported.type === 'Identifier'
					? specifier.imported.name
					: String(specifier.imported.value);
			if (VALIBOT_DECODERS.has(imported)) decoders.add(specifier.local.name);
		}
	}

	return { namespaces, decoders };
}

function concreteOwner(node: ParameterOwner): ConcreteParameterOwner | null {
	return node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression'
		? node
		: null;
}

function enclosingFunction(node: ESTree.Node): ConcreteParameterOwner | null {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== 'Program') {
		if (
			current.type === 'ArrowFunctionExpression' ||
			current.type === 'FunctionDeclaration' ||
			current.type === 'FunctionExpression'
		) {
			return current;
		}
		current = current.parent;
	}
	return null;
}

function parameterVariable(
	sourceCode: SourceCode,
	owner: ConcreteParameterOwner,
	parameter: Parameter
): Variable | null {
	if (parameter.type !== 'Identifier') return null;
	return (
		sourceCode.scopeManager
			.getDeclaredVariables(owner)
			.find(
				(variable) =>
					variable.name === parameter.name &&
					variable.defs.some(
						(definition) => definition.type === 'Parameter' && definition.name === parameter
					)
			) ?? null
	);
}

function staticMemberName(expression: ESTree.Expression): string | null {
	if (expression.type !== 'MemberExpression') return null;
	if (!expression.computed && expression.property.type === 'Identifier') {
		return expression.property.name;
	}
	return expression.computed && expression.property.type === 'Literal'
		? String(expression.property.value)
		: null;
}

function isRecognisedDecoder(
	callee: ESTree.Expression,
	imports: ValibotImports
): { readonly kind: 'project' | 'valibot'; readonly name: string } | null {
	if (callee.type === 'Identifier') {
		if (imports.decoders.has(callee.name)) return { kind: 'valibot', name: callee.name };
		return /^parse[A-Z]/u.test(callee.name) ? { kind: 'project', name: callee.name } : null;
	}
	if (
		callee.type === 'MemberExpression' &&
		callee.object.type === 'Identifier' &&
		imports.namespaces.has(callee.object.name)
	) {
		const name = staticMemberName(callee);
		return name !== null && VALIBOT_DECODERS.has(name) ? { kind: 'valibot', name } : null;
	}
	return null;
}

function isDecoderInput(identifier: ESTree.IdentifierReference, imports: ValibotImports): boolean {
	const call = identifier.parent;
	if (call.type !== 'CallExpression') return false;
	const decoder = isRecognisedDecoder(call.callee, imports);
	if (decoder === null) return false;
	const inputIndex = decoder.kind === 'valibot' ? 1 : 0;
	return call.arguments[inputIndex] === identifier;
}

function parsesBeforeUse(
	sourceCode: SourceCode,
	owner: ConcreteParameterOwner,
	parameter: Parameter,
	imports: ValibotImports
): boolean {
	const variable = parameterVariable(sourceCode, owner, parameter);
	if (variable === null) return false;
	const firstRead = variable.references
		.filter((reference) => reference.isRead() && enclosingFunction(reference.identifier) === owner)
		.sort((left, right) => left.identifier.start - right.identifier.start)[0];
	return firstRead !== undefined && isDecoderInput(firstRead.identifier, imports);
}

/** Disallow unknown inputs unless their first use decodes the boundary value. */
export const noUnknownParametersRule = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow explicitly unknown function parameters except `cause` and inputs decoded before any other use.'
		},
		messages: {
			unknownParameter:
				'Parameter `{{parameter}}` leaves input unparsed. Accept a named domain type; run the expected schema or parser at the I/O boundary before calling this function.'
		}
	},
	createOnce(context) {
		let imports: ValibotImports = { namespaces: new Set(), decoders: new Set() };
		const checkParameters = (node: ParameterOwner) => {
			for (const parameter of node.params) {
				const annotation = parameterAnnotation(parameter);
				if (annotation?.typeAnnotation.type !== 'TSUnknownKeyword') continue;
				const name = parameterName(parameter, context.sourceCode.getText(parameter));
				if (name === 'cause') continue;
				const owner = concreteOwner(node);
				if (owner !== null && parsesBeforeUse(context.sourceCode, owner, parameter, imports)) {
					continue;
				}
				context.report({
					node: annotation.typeAnnotation,
					messageId: 'unknownParameter',
					data: { parameter: name }
				});
			}
		};

		return {
			Program(program) {
				imports = collectValibotImports(program);
			},
			ArrowFunctionExpression: checkParameters,
			FunctionDeclaration: checkParameters,
			FunctionExpression: checkParameters,
			TSCallSignatureDeclaration: checkParameters,
			TSConstructSignatureDeclaration: checkParameters,
			TSConstructorType: checkParameters,
			TSDeclareFunction: checkParameters,
			TSEmptyBodyFunctionExpression: checkParameters,
			TSFunctionType: checkParameters,
			TSMethodSignature: checkParameters
		};
	}
});
