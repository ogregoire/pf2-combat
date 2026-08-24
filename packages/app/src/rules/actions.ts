export interface ActionPoolInput {
  slowed: number;
  stunned: number;
  quickened: boolean;
}

export interface ActionPool {
  total: number;
  lost: number;
  reasons: string[];
}

const BASE = 3;

/**
 * Stunned and slowed do not stack — the larger removes actions and the other
 * is absorbed by it. Quickened grants one extra action.
 */
export function actionPool(input: ActionPoolInput): ActionPool {
  const reasons: string[] = [];
  const lost = Math.max(input.slowed, input.stunned, 0);

  if (lost > 0) {
    reasons.push(
      input.stunned >= input.slowed
        ? `stunned ${input.stunned}`
        : `slowed ${input.slowed}`,
    );
  }
  if (input.quickened) reasons.push("quickened");

  const total = Math.max(0, BASE + (input.quickened ? 1 : 0) - lost);
  return { total, lost, reasons };
}
