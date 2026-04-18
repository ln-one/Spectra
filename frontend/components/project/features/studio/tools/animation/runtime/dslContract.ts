"use client";

import contractData from "./dsl-contract.json";

type PrimitiveName = keyof typeof contractData.primitive_props;
type HookName = keyof typeof contractData.hook_return_shape;

export interface AnimationDslContract {
  allowedPrimitives: readonly PrimitiveName[];
  allowedHooks: readonly HookName[];
  allowedIdentifiers: readonly string[];
  subjectPrimitives: readonly PrimitiveName[];
  explanationPrimitives: readonly PrimitiveName[];
  primitiveProps: Record<PrimitiveName, readonly string[]>;
  primitivePropSchema: Partial<
    Record<
      PrimitiveName,
      {
        required?: readonly string[];
        allowed?: readonly string[];
        enum_props?: Record<string, readonly string[]>;
        track_item_allowed_props?: readonly string[];
        track_item_required_props?: readonly string[];
        track_item_accent_enum?: readonly string[];
      }
    >
  >;
  hookReturnShape: Record<HookName, readonly string[]>;
  algorithmDemoDefaults: {
    preferredPrimitives: readonly string[];
    disallowedPatterns: readonly string[];
  };
  planSchemaFragments: {
    algorithm_demo: {
      fixed_subject_kind: string;
      fixed_track_mode: string;
      fixed_caption_mode: string;
      fixed_bindings: string;
      track_item_allowed_props: readonly string[];
    };
  };
}

export const ANIMATION_DSL_CONTRACT: AnimationDslContract = {
  allowedPrimitives:
    contractData.allowed_primitives as AnimationDslContract["allowedPrimitives"],
  allowedHooks:
    contractData.allowed_hooks as AnimationDslContract["allowedHooks"],
  allowedIdentifiers: contractData.allowed_identifiers,
  subjectPrimitives:
    contractData.subject_primitives as AnimationDslContract["subjectPrimitives"],
  explanationPrimitives:
    contractData.explanation_primitives as AnimationDslContract["explanationPrimitives"],
  primitiveProps: contractData.primitive_props,
  primitivePropSchema: contractData.primitive_prop_schema,
  hookReturnShape: contractData.hook_return_shape,
  algorithmDemoDefaults: {
    preferredPrimitives:
      contractData.algorithm_demo_defaults.preferred_primitives,
    disallowedPatterns:
      contractData.algorithm_demo_defaults.disallowed_patterns,
  },
  planSchemaFragments: contractData.plan_schema_fragments,
};

export type AnimationPrimitiveName = PrimitiveName;
export type AnimationHookName = HookName;
