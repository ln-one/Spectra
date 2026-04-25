"use client";

import { Parser } from "acorn";
import * as walk from "acorn-walk";
import { ANIMATION_DSL_CONTRACT } from "./dslContract";
import type { AnimationCompileError } from "./types";

type NodeLike = {
  type: string;
  loc?: {
    start: { line: number; column: number };
  };
};

type ValidationContext = {
  aliases: Set<string>;
  declared: Set<string>;
  usedPrimitives: Set<string>;
  usedHooks: Set<string>;
  subjectPrimitiveCount: number;
  explanationPrimitiveCount: number;
  errors: AnimationCompileError[];
};

const TRACK_ALLOWED_MODES = new Set(["bars"]);

const ALLOWED_PRIMITIVES = new Set(ANIMATION_DSL_CONTRACT.allowedPrimitives);
const ALLOWED_HOOKS = new Set(ANIMATION_DSL_CONTRACT.allowedHooks);
const ALLOWED_IDENTIFIERS = new Set([
  ...ANIMATION_DSL_CONTRACT.allowedIdentifiers,
  ...ANIMATION_DSL_CONTRACT.allowedPrimitives,
  ...ANIMATION_DSL_CONTRACT.allowedHooks,
]);
const SUBJECT_PRIMITIVES = new Set(ANIMATION_DSL_CONTRACT.subjectPrimitives);
const EXPLANATION_PRIMITIVES = new Set(
  ANIMATION_DSL_CONTRACT.explanationPrimitives
);

type AcornNode = NodeLike & Record<string, unknown>;
type IdentifierNode = AcornNode & { name: string };

function toError(
  node: NodeLike | null,
  message: string,
  ruleId: string
): AnimationCompileError {
  return {
    message,
    line: node?.loc?.start.line,
    column: node?.loc?.start.column,
    ruleId,
    source: "ast",
  };
}

function asIdentifier(value: unknown): IdentifierNode | null {
  return value && typeof value === "object" && (value as AcornNode).type === "Identifier"
    ? ((value as IdentifierNode) ?? null)
    : null;
}

function collectPatternNames(node: unknown, declared: Set<string>) {
  if (!node || typeof node !== "object") return;
  const candidate = node as AcornNode;
  if (candidate.type === "Identifier") {
    declared.add((candidate as IdentifierNode).name);
    return;
  }
  if (candidate.type === "ArrayPattern") {
    const elements = Array.isArray(candidate.elements) ? candidate.elements : [];
    elements.forEach((item) => collectPatternNames(item, declared));
    return;
  }
  if (candidate.type === "ObjectPattern") {
    const properties = Array.isArray(candidate.properties)
      ? candidate.properties
      : [];
    properties.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const property = item as AcornNode;
      if (property.type === "Property") {
        collectPatternNames(property.value, declared);
      } else if (property.type === "RestElement") {
        collectPatternNames(property.argument, declared);
      }
    });
  }
}

function isReactCreateElementCallee(
  callee: unknown,
  aliases: Set<string>
): boolean {
  if (!callee || typeof callee !== "object") return false;
  const node = callee as AcornNode;
  if (node.type === "Identifier") {
    return aliases.has((node as IdentifierNode).name);
  }
  if (node.type !== "MemberExpression") return false;
  const object = asIdentifier(node.object);
  const property = asIdentifier(node.property);
  return object?.name === "React" && property?.name === "createElement";
}

function getElementNameFromCreateElementCall(
  node: AcornNode,
  aliases: Set<string>
): string | null {
  if (node.type !== "CallExpression") return null;
  if (!isReactCreateElementCallee(node.callee, aliases)) return null;
  const args = Array.isArray(node.arguments) ? node.arguments : [];
  const firstArg = args[0];
  const identifier = asIdentifier(firstArg);
  if (!identifier) return null;
  return identifier.name;
}

function getPropertyName(node: AcornNode): string | null {
  if (node.type === "Identifier") return (node as IdentifierNode).name;
  if (node.type === "Literal" && typeof node.value === "string") {
    return String(node.value);
  }
  return null;
}

function validatePrimitiveProps(
  elementName: string,
  propsNode: AcornNode | null,
  context: ValidationContext
) {
  if (!propsNode || propsNode.type !== "ObjectExpression") {
    if (elementName === "Track") {
      context.errors.push(
        toError(propsNode, "Track requires an `items` prop.", "require-track-items")
      );
    }
    return;
  }

  const allowedProps =
    ANIMATION_DSL_CONTRACT.primitiveProps[
      elementName as keyof typeof ANIMATION_DSL_CONTRACT.primitiveProps
    ] ?? [];

  const seen = new Set<string>();
  const properties = Array.isArray(propsNode.properties)
    ? propsNode.properties
    : [];

  for (const rawProperty of properties) {
    if (!rawProperty || typeof rawProperty !== "object") continue;
    const property = rawProperty as AcornNode;
    if (property.type === "SpreadElement") {
      context.errors.push(
        toError(
          property,
          `${elementName} does not allow spread props in runtime code.`,
          "no-spread-props"
        )
      );
      continue;
    }
    if (property.type !== "Property") continue;
    if (property.computed) {
      context.errors.push(
        toError(
          property,
          `${elementName} does not allow computed prop names.`,
          "no-computed-props"
        )
      );
      continue;
    }
    const propName = getPropertyName(property.key as AcornNode);
    if (!propName) continue;
    seen.add(propName);
    if (!allowedProps.includes(propName)) {
      const ruleId =
        elementName === "Caption"
          ? "caption-props-only"
          : `${elementName.toLowerCase()}-props-only`;
      context.errors.push(
        toError(
          property,
          `${elementName} does not support the \`${propName}\` prop.`,
          ruleId
        )
      );
      continue;
    }

    if (
      elementName === "Track" &&
      propName === "mode" &&
      property.value &&
      typeof property.value === "object" &&
      (property.value as AcornNode).type === "Literal"
    ) {
      const literalValue = (property.value as AcornNode).value;
      if (
        typeof literalValue !== "string" ||
        !TRACK_ALLOWED_MODES.has(literalValue)
      ) {
        context.errors.push(
          toError(
            property,
            "Track `mode` must be the string literal `bars`.",
            "track-mode-invalid"
          )
        );
      }
    }
  }

  if (elementName === "Track" && !seen.has("items")) {
    context.errors.push(
      toError(propsNode, "Track requires an `items` prop.", "require-track-items")
    );
  }
}

function validateIdentifierReference(
  node: IdentifierNode,
  parent: AcornNode | undefined,
  context: ValidationContext
) {
  if (!parent) return;

  if (
    (parent.type === "VariableDeclarator" && parent.id === node) ||
    ((parent.type === "FunctionDeclaration" ||
      parent.type === "FunctionExpression" ||
      parent.type === "ArrowFunctionExpression") &&
      (parent.id === node ||
        (Array.isArray(parent.params) && parent.params.includes(node)))) ||
    (parent.type === "Property" &&
      parent.key === node &&
      parent.computed !== true &&
      parent.shorthand !== true) ||
    (parent.type === "MemberExpression" &&
      parent.property === node &&
      parent.computed !== true) ||
    parent.type === "LabeledStatement"
  ) {
    return;
  }

  if (
    context.declared.has(node.name) ||
    context.aliases.has(node.name) ||
    ALLOWED_IDENTIFIERS.has(node.name)
  ) {
    return;
  }

  context.errors.push(
    toError(
      node,
      `Identifier \`${node.name}\` is not part of the runtime DSL contract.`,
      "no-unknown-identifiers"
    )
  );
}

function collectRuntimeMetadata(program: AcornNode): ValidationContext {
  const context: ValidationContext = {
    aliases: new Set<string>(),
    declared: new Set<string>(),
    usedPrimitives: new Set<string>(),
    usedHooks: new Set<string>(),
    subjectPrimitiveCount: 0,
    explanationPrimitiveCount: 0,
    errors: [],
  };

  walk.ancestor(program as never, {
    VariableDeclarator(node: any) {
      collectPatternNames(node.id, context.declared);
      if (!node.init || typeof node.init !== "object") return;
      if (isReactCreateElementCallee(node.init, context.aliases)) {
        const identifier = asIdentifier(node.id);
        if (identifier) {
          context.aliases.add(identifier.name);
        }
      }
      if ((node.init as AcornNode).type === "Identifier") {
        const initIdentifier = node.init as IdentifierNode;
        const identifier = asIdentifier(node.id);
        if (identifier && context.aliases.has(initIdentifier.name)) {
          context.aliases.add(identifier.name);
        }
      }
    },
    FunctionDeclaration(node: any) {
      collectPatternNames(node.id, context.declared);
      const params = Array.isArray(node.params) ? node.params : [];
      params.forEach((item: unknown) => collectPatternNames(item, context.declared));
    },
    FunctionExpression(node: any) {
      collectPatternNames(node.id, context.declared);
      const params = Array.isArray(node.params) ? node.params : [];
      params.forEach((item: unknown) => collectPatternNames(item, context.declared));
    },
    ArrowFunctionExpression(node: any) {
      const params = Array.isArray(node.params) ? node.params : [];
      params.forEach((item: unknown) => collectPatternNames(item, context.declared));
    },
  });

  context.aliases.add("React.createElement");

  walk.ancestor(program as never, {
    Identifier(node: any, ancestors: any[]) {
      validateIdentifierReference(
        node as IdentifierNode,
        ancestors[ancestors.length - 2],
        context
      );
    },
    MemberExpression(node: any) {
      const property = asIdentifier(node.property);
      if (property?.name === "jumpTo") {
        context.errors.push(
          toError(
            property,
            "Unsupported runtime API `jumpTo()` detected.",
            "no-unsupported-runtime-api"
          )
        );
      }
    },
    CallExpression(node: any) {
      const callee = asIdentifier(node.callee);
      if (callee && ALLOWED_HOOKS.has(callee.name as never)) {
        context.usedHooks.add(callee.name);
      }

      const elementName = getElementNameFromCreateElementCall(
        node,
        context.aliases
      );
      if (!elementName || !ALLOWED_PRIMITIVES.has(elementName as never)) {
        return;
      }

      context.usedPrimitives.add(elementName);
      if (SUBJECT_PRIMITIVES.has(elementName as never)) {
        context.subjectPrimitiveCount += 1;
      }
      if (EXPLANATION_PRIMITIVES.has(elementName as never)) {
        context.explanationPrimitiveCount += 1;
      }

      const args = Array.isArray(node.arguments) ? node.arguments : [];
      const propsNode =
        args[1] && typeof args[1] === "object" ? (args[1] as AcornNode) : null;
      validatePrimitiveProps(elementName, propsNode, context);
    },
  });

  return context;
}

export function validateRuntimeAst(
  source: string,
  options?: { expectedUsedPrimitives?: string[] }
): AnimationCompileError[] {
  let program: AcornNode;
  try {
    program = Parser.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    }) as unknown as AcornNode;
  } catch (error) {
    const err = error as Error & { loc?: { line: number; column: number } };
    return [
      {
        message: err.message || "Failed to parse runtime code.",
        line: err.loc?.line,
        column: err.loc?.column,
        ruleId: "parse-error",
        source: "ast",
      },
    ];
  }

  const context = collectRuntimeMetadata(program);
  if (
    context.subjectPrimitiveCount === 0 &&
    context.explanationPrimitiveCount > 0
  ) {
    context.errors.push(
      toError(
        program,
        "Runtime code renders explanation primitives without a visible subject primitive.",
        "no-caption-only-scene"
      )
    );
  }

  if (options?.expectedUsedPrimitives) {
    const expected = [...options.expectedUsedPrimitives].sort();
    const actual = [...new Set([...context.usedPrimitives, ...context.usedHooks])].sort();
    if (
      expected.length !== actual.length ||
      expected.some((value, index) => value !== actual[index])
    ) {
      context.errors.push(
        toError(
          program,
          `used_primitives does not match AST usage. expected=${expected.join(", ")} actual=${actual.join(", ")}`,
          "used-primitives-must-match-ast"
        )
      );
    }
  }

  return context.errors;
}
