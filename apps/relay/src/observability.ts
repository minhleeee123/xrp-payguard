import type { RelayStatus } from "./types.js";

export type EvaluationMetricOutcome = "threshold_ready" | "split" | "unavailable" | "error";
export type EvaluationRejectionReason = "invalid" | "capacity";
export type SubmissionMetricOutcome = "success" | "error";
export type SubmissionRejectionReason = "not_ready";

const EVALUATION_OUTCOMES = ["threshold_ready", "split", "unavailable", "error"] as const;
const EVALUATION_REJECTIONS = ["invalid", "capacity"] as const;
const SUBMISSION_OUTCOMES = ["success", "error"] as const;
const SUBMISSION_REJECTIONS = ["not_ready"] as const;

export interface RelayTelemetrySnapshot {
  activeEvaluations: number;
  evaluations: Readonly<Record<EvaluationMetricOutcome, bigint>>;
  evaluationRejections: Readonly<Record<EvaluationRejectionReason, bigint>>;
  evaluationCoalesced: bigint;
  machineResults: Readonly<{ valid: bigint; failed: bigint }>;
  submissions: Readonly<Record<SubmissionMetricOutcome, bigint>>;
  submissionRejections: Readonly<Record<SubmissionRejectionReason, bigint>>;
  submissionCoalesced: bigint;
}

/**
 * Aggregate-only telemetry. Every label value is a closed enum controlled by
 * this module; callers cannot attach request, account, machine, endpoint,
 * policy, result, or credential data.
 */
export class RelayTelemetry {
  private activeEvaluations = 0;
  private readonly evaluations = zeroRecord(EVALUATION_OUTCOMES);
  private readonly evaluationRejections = zeroRecord(EVALUATION_REJECTIONS);
  private evaluationCoalesced = 0n;
  private readonly machineResults = { valid: 0n, failed: 0n };
  private readonly submissions = zeroRecord(SUBMISSION_OUTCOMES);
  private readonly submissionRejections = zeroRecord(SUBMISSION_REJECTIONS);
  private submissionCoalesced = 0n;

  evaluationStarted(): void {
    this.activeEvaluations += 1;
  }

  evaluationFinished(status: RelayStatus | "ERROR", validMachines: number, failedMachines: number): void {
    if (this.activeEvaluations <= 0) throw new Error("telemetry evaluation lifecycle is unbalanced");
    assertMachineCount(validMachines);
    assertMachineCount(failedMachines);
    if (validMachines + failedMachines !== 3) throw new Error("telemetry machine result count is invalid");
    this.activeEvaluations -= 1;
    this.evaluations[evaluationOutcome(status)] += 1n;
    this.machineResults.valid += BigInt(validMachines);
    this.machineResults.failed += BigInt(failedMachines);
  }

  evaluationRejected(reason: EvaluationRejectionReason): void {
    this.evaluationRejections[reason] += 1n;
  }

  evaluationWasCoalesced(): void {
    this.evaluationCoalesced += 1n;
  }

  submissionFinished(outcome: SubmissionMetricOutcome): void {
    this.submissions[outcome] += 1n;
  }

  submissionRejected(reason: SubmissionRejectionReason): void {
    this.submissionRejections[reason] += 1n;
  }

  submissionWasCoalesced(): void {
    this.submissionCoalesced += 1n;
  }

  snapshot(): RelayTelemetrySnapshot {
    return {
      activeEvaluations: this.activeEvaluations,
      evaluations: { ...this.evaluations },
      evaluationRejections: { ...this.evaluationRejections },
      evaluationCoalesced: this.evaluationCoalesced,
      machineResults: { ...this.machineResults },
      submissions: { ...this.submissions },
      submissionRejections: { ...this.submissionRejections },
      submissionCoalesced: this.submissionCoalesced,
    };
  }

  renderPrometheus(): string {
    const snapshot = this.snapshot();
    const lines = [
      "# HELP payguard_relay_evaluations_active Evaluations currently in progress.",
      "# TYPE payguard_relay_evaluations_active gauge",
      `payguard_relay_evaluations_active ${snapshot.activeEvaluations}`,
      "# HELP payguard_relay_evaluations_total Completed aggregate evaluation outcomes.",
      "# TYPE payguard_relay_evaluations_total counter",
      ...EVALUATION_OUTCOMES.map((outcome) => `payguard_relay_evaluations_total{outcome=\"${outcome}\"} ${snapshot.evaluations[outcome]}`),
      "# HELP payguard_relay_evaluation_rejections_total Evaluations rejected before dispatch.",
      "# TYPE payguard_relay_evaluation_rejections_total counter",
      ...EVALUATION_REJECTIONS.map((reason) => `payguard_relay_evaluation_rejections_total{reason=\"${reason}\"} ${snapshot.evaluationRejections[reason]}`),
      "# HELP payguard_relay_evaluation_coalesced_total Duplicate in-flight evaluations coalesced.",
      "# TYPE payguard_relay_evaluation_coalesced_total counter",
      `payguard_relay_evaluation_coalesced_total ${snapshot.evaluationCoalesced}`,
      "# HELP payguard_relay_machine_results_total Aggregate validated or failed machine results.",
      "# TYPE payguard_relay_machine_results_total counter",
      `payguard_relay_machine_results_total{outcome=\"valid\"} ${snapshot.machineResults.valid}`,
      `payguard_relay_machine_results_total{outcome=\"failed\"} ${snapshot.machineResults.failed}`,
      "# HELP payguard_relay_submissions_total Completed threshold submission attempts.",
      "# TYPE payguard_relay_submissions_total counter",
      ...SUBMISSION_OUTCOMES.map((outcome) => `payguard_relay_submissions_total{outcome=\"${outcome}\"} ${snapshot.submissions[outcome]}`),
      "# HELP payguard_relay_submission_rejections_total Submission calls rejected before a writer.",
      "# TYPE payguard_relay_submission_rejections_total counter",
      ...SUBMISSION_REJECTIONS.map((reason) => `payguard_relay_submission_rejections_total{reason=\"${reason}\"} ${snapshot.submissionRejections[reason]}`),
      "# HELP payguard_relay_submission_coalesced_total Duplicate in-flight submissions coalesced.",
      "# TYPE payguard_relay_submission_coalesced_total counter",
      `payguard_relay_submission_coalesced_total ${snapshot.submissionCoalesced}`,
    ];
    return `${lines.join("\n")}\n`;
  }
}

function zeroRecord<const T extends readonly string[]>(keys: T): Record<T[number], bigint> {
  return Object.fromEntries(keys.map((key) => [key, 0n])) as Record<T[number], bigint>;
}

function evaluationOutcome(status: RelayStatus | "ERROR"): EvaluationMetricOutcome {
  if (status === "THRESHOLD_READY") return "threshold_ready";
  if (status === "SPLIT") return "split";
  if (status === "UNAVAILABLE") return "unavailable";
  return "error";
}

function assertMachineCount(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 3) throw new Error("telemetry machine count is invalid");
}
