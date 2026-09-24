import type { ContentIssue } from '~/game/content';

/** The messages for one field of an item, and anything nested inside it —
 *  `effects` gathers `effects[0].amount` too. */
export function problemsAt(issues: readonly ContentIssue[], field: string): string[] {
  return issues
    .filter((issue) => issue.field === field || issue.field?.startsWith(`${field}.`) || issue.field?.startsWith(`${field}[`))
    .map((issue) => issue.message);
}

/** The messages for exactly this field, not what is nested inside it. */
export function problemsOn(issues: readonly ContentIssue[], field: string): string[] {
  return issues.filter((issue) => issue.field === field).map((issue) => issue.message);
}

