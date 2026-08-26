import { DEMO_PURPOSE, type ConsentRequest, type PlanAction, type ResourceSnapshot } from "./domain.js";

export const EVIDENCE_DISCLAIMER =
  "Demonstration evidence only. EraseGraph does not determine or certify legal compliance.";

export interface PolicyDecision {
  action: PlanAction;
  reason: string;
  ruleId: string;
}

export const RETENTION_RULES = [
  {
    id: "legal-hold",
    retentionClass: "legal_hold",
    action: "retain" as const,
    description: "Preserve records explicitly placed on the configured demo legal hold."
  },
  {
    id: "billing-record",
    retentionClass: "billing_record",
    action: "retain" as const,
    description: "Preserve configured billing records; this is a demo policy, not legal advice."
  },
  {
    id: "consent-proof",
    retentionClass: "consent_proof",
    action: "retain" as const,
    description: "Preserve the minimal consent-history record configured for audit evidence."
  }
] as const;

export function evaluatePolicy(request: ConsentRequest, resource: ResourceSnapshot): PolicyDecision {
  const retentionRule = RETENTION_RULES.find((rule) => rule.retentionClass === resource.retentionClass);
  if (retentionRule !== undefined) {
    return {
      action: retentionRule.action,
      reason: retentionRule.description,
      ruleId: retentionRule.id
    };
  }

  if (!resource.purposes.includes(request.purpose)) {
    return {
      action: "retain",
      reason: `Outside the ${request.purpose} withdrawal scope.`,
      ruleId: "outside-purpose-scope"
    };
  }

  return {
    action: "delete",
    reason: `Directly associated with withdrawn purpose ${DEMO_PURPOSE}; no configured retention exception applies.`,
    ruleId: "purpose-withdrawal-delete"
  };
}

export function retentionPolicyView(request: ConsentRequest): Record<string, unknown> {
  return {
    requestId: request.id,
    purpose: request.purpose,
    enforcement: "server-side",
    rules: RETENTION_RULES,
    defaultTargetPurposeAction: "delete",
    outsidePurposeScopeAction: "retain",
    disclaimer: EVIDENCE_DISCLAIMER
  };
}
