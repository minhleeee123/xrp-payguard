import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  array,
  exact,
  nonEmpty,
  parsePlanVerifyCLI,
  publicOnly,
  readJson,
  record,
  timestamp,
} from "./candidate-public.mjs";

export const USER_TASKS = [
  "create-and-freeze-policy",
  "recognize-public-versus-private-data",
  "submit-allow-request",
  "understand-deny-and-fail-closed",
  "stop-resume-and-revoke-policy",
  "trace-redemption-status",
];

export function validateUserValidationTemplate(value) {
  const template = record(value, "user validation template");
  exact(template.schemaVersion, 1, "schemaVersion");
  exact(template.kind, "payguard-user-validation-aggregate-template", "kind");
  exact(template.status, "planned", "status");
  exact(template.verified, false, "verified");
  const cohorts = record(template.minimumCohorts, "minimumCohorts");
  exact(cohorts.xrplUsers, 5, "minimumCohorts.xrplUsers");
  exact(cohorts.treasuryOrDaoUsers, 5, "minimumCohorts.treasuryOrDaoUsers");
  exact(cohorts.paymentRecipientsOrExecutors, 5, "minimumCohorts.paymentRecipientsOrExecutors");
  assertExactSet(array(template.requiredTasks, "requiredTasks"), USER_TASKS, "requiredTasks");
  if (array(template.forbiddenPublicFields, "forbiddenPublicFields").length < 6) throw new Error("forbiddenPublicFields is incomplete");
  publicOnly(template, "user validation template");
  return { status: "planned", verified: false, tasks: USER_TASKS.length };
}

function assertExactSet(actual, expected, label) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length || expected.some((item) => !actual.includes(item))) {
    throw new Error(`${label} must contain the exact required set`);
  }
}

function rate(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be a number from 0 to 1`);
  return value;
}

export function validateUserValidationReport(value) {
  const report = record(value, "user validation report");
  exact(report.schemaVersion, 1, "schemaVersion");
  exact(report.kind, "payguard-user-validation-aggregate", "kind");
  exact(report.status, "verified", "status");
  exact(report.verified, true, "verified");
  exact(report.consentConfirmed, true, "consentConfirmed");
  exact(report.anonymizedAggregateOnly, true, "anonymizedAggregateOnly");
  exact(report.publicOnly, true, "publicOnly");
  timestamp(report.completedAt, "completedAt");

  const cohorts = record(report.cohorts, "cohorts");
  if (!Number.isInteger(cohorts.xrplUsers) || cohorts.xrplUsers < 5) throw new Error("cohorts.xrplUsers must be at least 5");
  if (!Number.isInteger(cohorts.treasuryOrDaoUsers) || cohorts.treasuryOrDaoUsers < 5) throw new Error("cohorts.treasuryOrDaoUsers must be at least 5");
  if (!Number.isInteger(cohorts.paymentRecipientsOrExecutors) || cohorts.paymentRecipientsOrExecutors < 5) throw new Error("cohorts.paymentRecipientsOrExecutors must be at least 5");
  exact(cohorts.total, cohorts.xrplUsers + cohorts.treasuryOrDaoUsers + cohorts.paymentRecipientsOrExecutors, "cohorts.total");

  const tasks = array(report.tasks, "tasks", USER_TASKS.length);
  const seen = new Set();
  for (const [index, value] of tasks.entries()) {
    const task = record(value, `tasks[${index}]`);
    const id = nonEmpty(task.id, `tasks[${index}].id`);
    if (!USER_TASKS.includes(id) || seen.has(id)) throw new Error(`tasks[${index}].id is unknown or duplicate`);
    seen.add(id);
    if (!Number.isInteger(task.attempted) || task.attempted !== cohorts.total) throw new Error(`tasks[${index}].attempted must equal the cohort total`);
    if (!Number.isInteger(task.completed) || task.completed < 0 || task.completed > task.attempted) throw new Error(`tasks[${index}].completed is invalid`);
    rate(task.completionRate, `tasks[${index}].completionRate`);
    if (Math.abs(task.completionRate - task.completed / task.attempted) > 1e-9) throw new Error(`tasks[${index}].completionRate does not match counts`);
  }

  const metrics = record(report.metrics, "metrics");
  rate(metrics.privateBoundaryComprehension, "metrics.privateBoundaryComprehension");
  rate(metrics.failClosedComprehension, "metrics.failClosedComprehension");
  rate(metrics.redemptionComprehension, "metrics.redemptionComprehension");
  if (typeof metrics.medianTaskMinutes !== "number" || !Number.isFinite(metrics.medianTaskMinutes) || metrics.medianTaskMinutes <= 0) {
    throw new Error("metrics.medianTaskMinutes must be positive");
  }
  const findings = array(report.prioritizedFindings, "prioritizedFindings");
  if (findings.length === 0) throw new Error("prioritizedFindings must record at least one aggregate finding");
  for (const [index, value] of findings.entries()) {
    const finding = record(value, `prioritizedFindings[${index}]`);
    if (!["critical", "high", "medium", "low", "none-observed"].includes(finding.severity)) throw new Error(`prioritizedFindings[${index}].severity is invalid`);
    nonEmpty(finding.summary, `prioritizedFindings[${index}].summary`);
    nonEmpty(finding.disposition, `prioritizedFindings[${index}].disposition`);
  }
  if ("sessions" in report || "participants" in report || "rawNotes" in report) throw new Error("raw participant/session data must not enter the aggregate report");
  publicOnly(report, "user validation report");
  return { status: "verified", participants: cohorts.total, tasks: tasks.length, findings: findings.length };
}

export function userValidationPlan() {
  return {
    status: "planned",
    verified: false,
    protocol: "docs/product/user-validation-protocol.md",
    template: "docs/product/user-validation-aggregate.template.json",
    tasks: USER_TASKS,
    minimumCohorts: { xrplUsers: 5, treasuryOrDaoUsers: 5, paymentRecipientsOrExecutors: 5 },
    command: "pnpm candidate:user-validation:verify -- <aggregate-report.json>",
    rule: "Consent records and raw notes remain in access-controlled research storage; only a checked anonymized aggregate may become public evidence",
  };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const cli = parsePlanVerifyCLI(process.argv.slice(2));
    console.log(JSON.stringify(cli.mode === "plan" ? userValidationPlan() : validateUserValidationReport(await readJson(resolve(cli.path)))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
