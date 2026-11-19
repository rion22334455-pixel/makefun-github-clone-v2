// github-core-clone-01's check manifest and scoring constants: the seven check groups (120 checks),
// the feature column (600), the agent-native column (200), the four benchmark workloads with their
// T_ref slots, and the perf column (200) with the tier formula. The score is their sum, 0..1000.
//
// Why a table of groups and not a table of checks: a sealed bundle inlines whatever its source imports,
// so a manifest that held every check's function would pull the whole suite into one module and make
// every group's code inseparable. Instead each check lives in its group's module
// (env/src/checks-git.ts, checks-rest.ts, checks-graphql.ts, checks-mcp.ts), which exports a
// `readonly CheckSpec[]`; this file fixes the group names, the counts they must add up to, the
// CheckSpec/CheckContext types, and every constant the scorer reads. validateCheckSpecs() is the one
// place that proves the four lists add up to the manifest before a run.
//
// The columns (the settled scoring contract):
//   feature = round(600 * passedChecks / totalChecks), totalChecks = TOTAL_CHECKS (120)
//   agent   = round(200 * passedAgentChecks / AGENT_CHECKS), the mcp group's passed count out of 15
//   perf    = sum over the four workloads of round(clamp(25 - 12.5*log2(t_ms / T_ref_ms), 0, 50))
//   score   = feature + agent + perf, an integer 0..1000
// The mcp group is counted both in the feature column's 120 and, alone, as the agent column: the
// settled contract weights agent-native support that way on purpose. A T_ref of 0 means the house
// reference has not been calibrated for that workload yet, and the workload earns 0 points (the run is
// `calibrated: false` in perf.json). T_ref is the house reference's measured time for the same fixed
// work, in ms, on the production sandbox; T_REF_MS reads the four values from env/src/calibration.json
// (the calibration run's measured medians) and nothing else.
//
// The tie-break is `perf_p50_us` ascending (the geometric mean of the four workloads' p50_ms, in
// microseconds, rounded): a lower figure ranks first among equal scores, then the earlier receipt.
// Nothing in a pass/fail check reads a clock; these constants are the only place a time becomes points.

import calibration from './calibration.json' with { type: 'json' };
import type { Bit, CheckId, PerfFile, PerfTier, Scenario, StateCounts, StateFile } from './wire.ts';
import {
  BENCHMARK_BUDGET_MS,
  CHECK_TIMEOUT_MAX_MS,
  CHECK_TIMEOUT_MS,
  CHECK_TIMEOUT_MIN_MS,
  STATE_VERSION,
  WireError,
} from './wire.ts';

/** The manifest's version, bumped when the groups or the scoring constants change. */
export const MANIFEST_VERSION = 1;

// ---------------------------------------------------------------- the check groups

/** The seven check groups, in the order the SDK and the checks trace print them. */
export type CheckGroupId = 'git' | 'repos' | 'issues' | 'pulls' | 'graphql' | 'mcp' | 'protocol';

/** One group: its id, what it proves, and how many checks it declares. */
export interface CheckGroupSpec {
  readonly id: CheckGroupId;
  /** The short name a person reads on the checks table. */
  readonly title: string;
  /** How many checks the group declares; the group's module must register exactly this many. */
  readonly checks: number;
  /** One line: what the group proves. */
  readonly about: string;
}

/**
 * The check groups. `git` is the smart-HTTP protocol; `repos`, `issues` and `pulls` are REST v3;
 * `graphql` is v4; `mcp` is the Model Context Protocol endpoint (and the agent column); `protocol`
 * is the status/auth/JSON discipline every surface shares. The counts are the settled contract:
 * 30 + 15 + 15 + 20 + 20 + 15 + 5 = 120.
 */
export const CHECK_GROUPS: readonly CheckGroupSpec[] = Object.freeze([
  Object.freeze({ id: 'git', title: 'Git smart HTTP', checks: 30, about: 'clone, fetch, push and the pack protocol against the entry as a real git server' }),
  Object.freeze({ id: 'repos', title: 'Repositories', checks: 15, about: 'the REST v3 repository, branch, commit and contents APIs' }),
  Object.freeze({ id: 'issues', title: 'Issues', checks: 15, about: 'the REST v3 issue, comment and label APIs' }),
  Object.freeze({ id: 'pulls', title: 'Pull requests', checks: 20, about: 'the REST v3 pull request, files and merge APIs' }),
  Object.freeze({ id: 'graphql', title: 'GraphQL v4', checks: 20, about: 'the v4 documents gh and github-mcp-server actually send' }),
  Object.freeze({ id: 'mcp', title: 'MCP', checks: 15, about: 'the streamable-HTTP MCP endpoint, its tools, and their effect on the REST view' }),
  Object.freeze({ id: 'protocol', title: 'Wire protocol', checks: 5, about: 'status codes, JSON and error bodies, auth, pagination headers and method handling' }),
]);

/** The group ids, in table order. */
export const CHECK_GROUP_IDS: readonly CheckGroupId[] = Object.freeze(CHECK_GROUPS.map((group) => group.id));

/** The group table as a map: id to its spec. */
export const CHECK_GROUP_BY_ID: Readonly<Record<CheckGroupId, CheckGroupSpec>> = Object.freeze(
  Object.fromEntries(CHECK_GROUPS.map((group) => [group.id, group])) as Record<CheckGroupId, CheckGroupSpec>,
);

/** How many checks each group declares. */
export const CHECK_COUNTS: Readonly<Record<CheckGroupId, number>> = Object.freeze(
  Object.fromEntries(CHECK_GROUPS.map((group) => [group.id, group.checks])) as Record<CheckGroupId, number>,
);

/** Every check the manifest declares: the feature column's denominator. */
export const TOTAL_CHECKS = 120;

/** The group whose passed count is the agent column. */
export const AGENT_GROUP: CheckGroupId = 'mcp';

/** The agent column's denominator: the mcp group's checks, fixed. */
export const AGENT_CHECKS = 15;

/** Every issue the group table itself holds (empty is the only healthy answer). */
export function groupTableIssues(): string[] {
  const issues: string[] = [];
  let sum = 0;
  const seen = new Set<string>();
  for (const group of CHECK_GROUPS) {
    if (seen.has(group.id)) issues.push(`group ${group.id} appears twice`);
    seen.add(group.id);
    if (!Number.isSafeInteger(group.checks) || group.checks <= 0) issues.push(`group ${group.id} declares ${String(group.checks)} checks`);
    sum += Number.isSafeInteger(group.checks) && group.checks > 0 ? group.checks : 0;
    if (group.title.trim() === '') issues.push(`group ${group.id} has no title`);
  }
  if (sum !== TOTAL_CHECKS) issues.push(`the groups declare ${sum} checks, not TOTAL_CHECKS (${TOTAL_CHECKS})`);
  if (CHECK_COUNTS[AGENT_GROUP] !== AGENT_CHECKS) issues.push(`${AGENT_GROUP} declares ${String(CHECK_COUNTS[AGENT_GROUP])} checks, not AGENT_CHECKS (${AGENT_CHECKS})`);
  return issues;
}

// ---------------------------------------------------------------- a check

/** What one check reports: a pass/fail bit and, when it fails, one line of why (no times). */
export interface CheckResult {
  readonly ok: boolean;
  readonly detail?: string;
}

/** A passing result, with an optional line of what it proved. */
export function pass(detail?: string): CheckResult {
  return detail === undefined ? { ok: true } : { ok: true, detail };
}

/** A failing result: `detail` says what the entry answered, never a timing. */
export function fail(detail: string): CheckResult {
  return { ok: false, detail };
}

/**
 * What a check gets to work with: the entry's origin and token, the one seeded scenario, its own
 * deadline and timeout, an abort signal, and a log sink for diagnostics that never reaches state.json.
 * The runner aborts `signal` when the phase's deadline falls and records the check 0 with "deadline".
 */
export interface CheckContext {
  /** The entry's origin, no trailing slash (wire.ts EntryBase.url). */
  readonly baseUrl: string;
  /** The bearer token every API call presents (wire.ts TOKEN_ENV, MAKEFUN_SHOP_TOKEN). */
  readonly token: string;
  /** The seeded scenario every name, path, blob and title comes from (wire.ts buildScenario()). */
  readonly scenario: Scenario;
  /** Aborted when the phase's deadline or the trial's abort falls: a check must stop. */
  readonly signal: AbortSignal;
  /** The runner's monotonic clock (performance.now()) at which this check must stop. */
  readonly deadlineMs: number;
  /** The check's own timeout budget, ms: CHECK_TIMEOUT_MIN_MS..CHECK_TIMEOUT_MAX_MS, clamped to the phase. */
  readonly timeoutMs: number;
  /** A diagnostic line (stderr, the SDK's table); never scored, never written to state.json. */
  log(message: string): void;
}

/** One check's body: a result, or a throw the runner records as a failure with the message. */
export type CheckFn = (context: CheckContext) => CheckResult | Promise<CheckResult>;

/** One registered check: its id, its group, its title, an optional timeout, and its body. */
export interface CheckSpec {
  /** `<group>.<slug>`: build it with checkId() so group and id can never disagree. */
  readonly id: CheckId;
  readonly group: CheckGroupId;
  /** What the check proves, one line, shown in the SDK's table. */
  readonly title: string;
  /** Its timeout, ms; default CHECK_TIMEOUT_MS, clamped to CHECK_TIMEOUT_MIN_MS..CHECK_TIMEOUT_MAX_MS. */
  readonly timeoutMs?: number;
  readonly fn: CheckFn;
}

const CHECK_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** A check id from its group and slug: `checkId('git', 'clone-empty')` is `git.clone-empty`. */
export function checkId(group: CheckGroupId, slug: string): CheckId {
  if (!CHECK_SLUG_RE.test(slug)) throw new WireError(`a check slug is lowercase letters, digits and hyphens, not ${JSON.stringify(slug)}`);
  return `${group}.${slug}`;
}

/** A parsed check id. */
export interface ParsedCheckId {
  readonly group: CheckGroupId;
  readonly slug: string;
}

/** The group and slug of an id, or null when it is not `<known group>.<slug>`. */
export function parseCheckId(id: string): ParsedCheckId | null {
  const at = id.indexOf('.');
  if (at <= 0 || at === id.length - 1) return null;
  const group = id.slice(0, at);
  const slug = id.slice(at + 1);
  if (!CHECK_GROUP_IDS.includes(group as CheckGroupId)) return null;
  if (!CHECK_SLUG_RE.test(slug)) return null;
  return { group: group as CheckGroupId, slug };
}

/** The group an id belongs to, or null when it is not a manifest id. */
export function checkGroupOf(id: string): CheckGroupId | null {
  return parseCheckId(id)?.group ?? null;
}

/** The timeout a check gets: its own or the default, inside the allowed range and the phase's remainder. */
export function checkTimeoutMs(requestedMs: number | undefined, remainingMs: number): number {
  const want = requestedMs === undefined ? CHECK_TIMEOUT_MS : requestedMs;
  const inRange = Number.isFinite(want) ? Math.min(CHECK_TIMEOUT_MAX_MS, Math.max(CHECK_TIMEOUT_MIN_MS, want)) : CHECK_TIMEOUT_MS;
  if (!Number.isFinite(remainingMs)) return inRange;
  return Math.max(0, Math.min(inRange, remainingMs));
}

/**
 * Every way the registered checks disagree with the manifest: a duplicate id, an id not
 * `<group>.<slug>`, an id registered under another group, an empty title, a group whose registered
 * count is not its declared count. Empty when the suite is exactly the manifest; the runner refuses to
 * score a suite that is not, so a missing group cannot be papered over by a smaller denominator.
 */
export function validateCheckSpecs(specs: readonly CheckSpec[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const counts: Partial<Record<CheckGroupId, number>> = {};
  for (const spec of specs) {
    if (ids.has(spec.id)) issues.push(`duplicate check id ${spec.id}`);
    ids.add(spec.id);
    const parsed = parseCheckId(spec.id);
    if (parsed === null) issues.push(`check id ${JSON.stringify(spec.id)} is not <group>.<slug>`);
    else if (parsed.group !== spec.group) issues.push(`check id ${spec.id} names group ${parsed.group} but is registered as ${spec.group}`);
    if (spec.title.trim() === '') issues.push(`check ${spec.id} has no title`);
    if (typeof spec.fn !== 'function') issues.push(`check ${spec.id} has no fn`);
    counts[spec.group] = (counts[spec.group] ?? 0) + 1;
  }
  for (const group of CHECK_GROUPS) {
    const registered = counts[group.id] ?? 0;
    if (registered !== group.checks) issues.push(`${group.id} declares ${group.checks} checks but ${registered} are registered`);
  }
  return issues;
}

/** Every check id the four group modules register, in table then registration order (for the export). */
export function checkIdsOf(specs: readonly CheckSpec[]): CheckId[] {
  return specs.map((spec) => spec.id);
}

// ---------------------------------------------------------------- the columns

/** The feature column's maximum: 600 of a score's 1000. */
export const FEATURE_COLUMN_MAX = 600;
/** The agent-native column's maximum: 200. */
export const AGENT_COLUMN_MAX = 200;
/** The performance column's maximum: 200. */
export const PERF_COLUMN_MAX = 200;
/** A perfect score: 1000. */
export const SCORE_MAX = 1000;
/** The most points one benchmark workload earns. */
export const PERF_WORKLOAD_MAX = 50;
/** One perf tier's width: 12.5 points. */
export const PERF_TIER_STEP = 12.5;
/** The highest perf tier: 4 (a workload at 50 points). */
export const PERF_TIER_MAX = 4;

/**
 * The feature column: `round(600 * passedChecks / totalChecks)`, clamped to 0..600. `passedChecks`
 * beyond the total (a malformed counts block) is clamped; a non-positive or missing total falls back
 * to TOTAL_CHECKS so the column can only be 0 at worst, never NaN.
 */
export function featurePoints(passedChecks: number, totalChecks: number = TOTAL_CHECKS): number {
  const total = Number.isFinite(totalChecks) && totalChecks > 0 ? totalChecks : TOTAL_CHECKS;
  const passed = Number.isFinite(passedChecks) ? Math.min(Math.max(0, passedChecks), total) : 0;
  return Math.round((FEATURE_COLUMN_MAX * passed) / total);
}

/** The agent column: `round(200 * passedAgentChecks / totalAgentChecks)`, clamped to 0..200. */
export function agentPoints(passedAgentChecks: number, totalAgentChecks: number = AGENT_CHECKS): number {
  const total = Number.isFinite(totalAgentChecks) && totalAgentChecks > 0 ? totalAgentChecks : AGENT_CHECKS;
  const passed = Number.isFinite(passedAgentChecks) ? Math.min(Math.max(0, passedAgentChecks), total) : 0;
  return Math.round((AGENT_COLUMN_MAX * passed) / total);
}

/** One column value clamped to an integer 0..max (a corrupt export's NaN becomes 0). */
export function clampColumn(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

/** A score's parts: the three columns and their sum. */
export interface ScoreParts {
  readonly feature: number;
  readonly agent: number;
  readonly perf: number;
  readonly score: number;
}

/** feature + agent + perf, each clamped to its column, so the score is an integer 0..1000. */
export function compositeScore(feature: number, agent: number, perf: number): ScoreParts {
  const f = clampColumn(feature, FEATURE_COLUMN_MAX);
  const a = clampColumn(agent, AGENT_COLUMN_MAX);
  const p = clampColumn(perf, PERF_COLUMN_MAX);
  return Object.freeze({ feature: f, agent: a, perf: p, score: f + a + p });
}

/** The mcp group's passed count, the agent column's numerator (0 when the export has no mcp row). */
export function agentPassedOf(counts: StateCounts): number {
  return counts.byGroup[AGENT_GROUP]?.passed ?? 0;
}

/**
 * The columns a trial's exports earn. `feature` reads the counts the env wrote, `agent` the mcp
 * group's row, `perf` perf.json's points_total. A missing group falls back to its declared count (the
 * column scores 0, never NaN). This is the scorer's reference arithmetic; it never reads the clock.
 */
export function scoreOf(state: Pick<StateFile, 'counts'>, perf: Pick<PerfFile, 'points_total'>): ScoreParts {
  const feature = featurePoints(state.counts.passed, state.counts.total);
  const mcp = state.counts.byGroup[AGENT_GROUP];
  const agentPassed = mcp?.passed ?? 0;
  const agentTotal = mcp !== undefined && mcp.total > 0 ? mcp.total : AGENT_CHECKS;
  const agent = agentPoints(agentPassed, agentTotal);
  const perfPoints = clampColumn(perf.points_total, PERF_COLUMN_MAX);
  return compositeScore(feature, agent, perfPoints);
}

// ---------------------------------------------------------------- the benchmark workloads

/** The four benchmark workloads' names. */
export type BenchWorkloadName = 'push' | 'clone' | 'read' | 'write';

/** One benchmark workload: fixed work, timed in rounds, scored by the tier formula. */
export interface BenchWorkloadSpec {
  readonly name: BenchWorkloadName;
  readonly title: string;
  /** One line: exactly what a round does and what is timed. */
  readonly about: string;
  /** The fixed operations one round performs, so a time means the same work for every entry. */
  readonly ops: number;
  /** Timed rounds; the median round is the workload's time. */
  readonly rounds: number;
  /** Untimed warm-up operations before the first round. */
  readonly warmupOps: number;
  /** The most wall time this workload may take in the benchmark phase; past it the workload is 0. */
  readonly budgetMs: number;
}

/** How many timed rounds every workload runs (manifest.ts BENCH_WORKLOADS' rounds). */
export const BENCH_ROUNDS = 3;
/** How many untimed warm-up operations precede a workload's first round. */
export const BENCH_WARMUP_OPS = 5;
/** The benchmark phase's budget for all four workloads together (wire.ts BENCHMARK_BUDGET_MS). */
export const BENCH_PHASE_BUDGET_MS = BENCHMARK_BUDGET_MS;

/**
 * The four workloads. Each is one fixed amount of work measured three times with a monotonic clock;
 * the payloads are built before the first timing starts, the rounds are timed after BENCH_WARMUP_OPS
 * untimed operations, and a workload that cannot finish in budgetMs stops early and scores 0. The
 * workload's own p50 is the median round; perf.json keeps every round's ms. No pass/fail check reads
 * these times.
 */
export const BENCH_WORKLOADS: readonly BenchWorkloadSpec[] = Object.freeze([
  Object.freeze({
    name: 'push',
    title: 'Push',
    about: '200 sequential pushes of a 1 KiB change to one repository (one receive-pack update and new commit each)',
    ops: 200,
    rounds: BENCH_ROUNDS,
    warmupOps: BENCH_WARMUP_OPS,
    budgetMs: 60_000,
  }),
  Object.freeze({
    name: 'clone',
    title: 'Clone',
    about: '50 concurrent shallow clones (depth 1) of a 200-commit repository, each stream checksum-verified',
    ops: 50,
    rounds: BENCH_ROUNDS,
    warmupOps: BENCH_WARMUP_OPS,
    budgetMs: 60_000,
  }),
  Object.freeze({
    name: 'read',
    title: 'Read',
    about: '2,000 sequential GET /api/v3/repos/{owner}/{repo}/issues/{n} on a warm keep-alive connection',
    ops: 2_000,
    rounds: BENCH_ROUNDS,
    warmupOps: BENCH_WARMUP_OPS,
    budgetMs: 60_000,
  }),
  Object.freeze({
    name: 'write',
    title: 'Write',
    about: '200 sequential POST /api/v3/repos/{owner}/{repo}/issues',
    ops: 200,
    rounds: BENCH_ROUNDS,
    warmupOps: BENCH_WARMUP_OPS,
    budgetMs: 60_000,
  }),
]);

/** The workload names, in table order. */
export const BENCH_WORKLOAD_NAMES: readonly BenchWorkloadName[] = Object.freeze(BENCH_WORKLOADS.map((workload) => workload.name));

/** The calibration contract this manifest reads: env/src/calibration.json's schema and contest. */
export const CALIBRATION_SCHEMA = 'agent-fun/calibration/v1';
/** The contest the calibration file was measured for: a file for another contest is a build error, not a silently wrong T_ref. */
export const CALIBRATION_CONTEST = 'github-core-clone-01';

if (calibration.schema !== CALIBRATION_SCHEMA) {
  throw new TypeError(`calibration.json is ${JSON.stringify(calibration.schema)}, not ${JSON.stringify(CALIBRATION_SCHEMA)}`);
}
if (calibration.contest !== CALIBRATION_CONTEST) {
  throw new TypeError(`calibration.json was measured for ${JSON.stringify(calibration.contest)}, not ${JSON.stringify(CALIBRATION_CONTEST)}`);
}

/** One workload's measured p50 from calibration.json, in ms; 0 when it is not a positive number (uncalibrated). */
function calibratedTRefMs(name: BenchWorkloadName): number {
  const p50 = calibration.workloads[name]?.p50_ms;
  return typeof p50 === 'number' && Number.isFinite(p50) && p50 > 0 ? p50 : 0;
}

/**
 * The T_ref slots: the house reference's calibrated time for each workload's fixed work, in ms, on the
 * production sandbox. They are calibration.json's four measured p50_ms values (env/src/calibration.json,
 * measured in a gVisor pod on the e2e rig); esbuild inlines the JSON into env/server.mjs, and
 * sdk/sync.sh copies the file beside sdk/conformance/manifest.ts so the kit's runner resolves it. 0 means
 * "not calibrated yet": that workload earns 0 points and perf.json's `calibrated` is false. Nothing else
 * edits these four values; re-measure only when the trial shape changes (calibration.json's re_measure).
 */
export const T_REF_MS: Readonly<Record<BenchWorkloadName, number>> = Object.freeze({
  push: calibratedTRefMs('push'),
  clone: calibratedTRefMs('clone'),
  read: calibratedTRefMs('read'),
  write: calibratedTRefMs('write'),
});

/** Whether every workload has a calibrated T_ref (perf.json's `calibrated`). */
export function isCalibrated(tRefs: Readonly<Record<BenchWorkloadName, number>> = T_REF_MS): boolean {
  return BENCH_WORKLOADS.every((workload) => Number.isFinite(tRefs[workload.name]) && tRefs[workload.name] > 0);
}

/** A workload's T_ref in ms (0 when uncalibrated). */
export function tRefMs(name: BenchWorkloadName): number {
  return T_REF_MS[name];
}

/** One workload's spec by name; a WireError on an unknown name. */
export function benchWorkload(name: string): BenchWorkloadSpec {
  const found = BENCH_WORKLOADS.find((workload) => workload.name === name);
  if (found === undefined) throw new WireError(`no benchmark workload ${JSON.stringify(name)} (the workloads are ${BENCH_WORKLOAD_NAMES.join(', ')})`);
  return found;
}

/**
 * One workload's points: `round(clamp(25 - 12.5*log2(t_ms / T_ref_ms), 0, 50))`. A missing, zero or
 * non-finite time, or an uncalibrated T_ref (0), is 0 points: never a bonus for a workload that did
 * not run.
 */
export function workloadPoints(tMs: number, tRef: number): number {
  if (!Number.isFinite(tMs) || tMs <= 0) return 0;
  if (!Number.isFinite(tRef) || tRef <= 0) return 0;
  const raw = 25 - 12.5 * Math.log2(tMs / tRef);
  return Math.round(Math.min(PERF_WORKLOAD_MAX, Math.max(0, raw)));
}

/** The perf column: the four workloads' points summed, 0..200 (an absent time is 0 points). */
export function perfColumn(timesMs: Partial<Record<BenchWorkloadName, number>>, tRefs: Readonly<Record<BenchWorkloadName, number>> = T_REF_MS): number {
  let total = 0;
  for (const workload of BENCH_WORKLOADS) {
    total += workloadPoints(timesMs[workload.name] ?? 0, tRefs[workload.name]);
  }
  return total;
}

/** One workload's points as the perf tier state.json carries: floor(points / 12.5), clamped 0..4. */
export function perfTier(points: number): PerfTier {
  if (!Number.isFinite(points) || points <= 0) return 0;
  const tier = Math.floor(points / PERF_TIER_STEP);
  return Math.min(PERF_TIER_MAX, Math.max(0, tier)) as PerfTier;
}

/** The four workloads' tiers, keyed by name (state.json's perfTiers and perf.json's tiers). */
export function perfTiersOf(points: Readonly<Partial<Record<BenchWorkloadName, number>>>): Record<string, PerfTier> {
  const tiers: Record<string, PerfTier> = {};
  for (const workload of BENCH_WORKLOADS) tiers[workload.name] = perfTier(points[workload.name] ?? 0);
  return tiers;
}

/**
 * The leaderboard's tie-break: the geometric mean of the workloads' p50_ms, in microseconds, rounded.
 * Each time is floored at 1 microsecond so a 0 ms round cannot make the mean 0 and win by accident.
 */
export function perfTieBreakUs(p50Ms: readonly number[]): number {
  if (p50Ms.length === 0) return 0;
  let logSum = 0;
  for (const ms of p50Ms) logSum += Math.log(Math.max(Number.isFinite(ms) ? ms : 0.001, 0.001));
  return Math.round(1000 * Math.exp(logSum / p50Ms.length));
}

// ---------------------------------------------------------------- the export's counts

/**
 * The counts block from a run's checks: every group's declared total and the passed count its checks
 * earned. An id not in the manifest is ignored (it cannot earn points); a missing id is a check that
 * did not run, hence 0. `total` is always TOTAL_CHECKS, so the feature column's denominator cannot be
 * shrunk by dropping checks from the export.
 */
export function countsFromChecks(checks: Readonly<Record<CheckId, Bit>>): StateCounts {
  const byGroup: Record<string, { total: number; passed: number }> = {};
  for (const group of CHECK_GROUPS) byGroup[group.id] = { total: group.checks, passed: 0 };
  let passed = 0;
  for (const [id, bit] of Object.entries(checks)) {
    const group = checkGroupOf(id);
    if (group === null) continue;
    const row = byGroup[group];
    if (row === undefined) continue;
    if (bit === 1) {
      row.passed += 1;
      passed += 1;
    }
  }
  return { total: TOTAL_CHECKS, passed, byGroup };
}

/**
 * state.json from a run's results: every declared id gets its 0|1 (`checkIds` is the manifest's whole
 * list; an id missing from `checks` is 0), counts are derived, and the perf tiers are the four
 * workloads' bands. `working` is the caller's bit (wire.ts workingBit); the notes hold fixed causes only.
 */
export function stateFromChecks(input: {
  readonly checks: Readonly<Record<CheckId, Bit>>;
  readonly checkIds: readonly CheckId[];
  readonly perfTiers?: Readonly<Record<string, PerfTier>>;
  readonly working?: Bit;
  readonly notes?: readonly string[];
}): StateFile {
  const complete: Record<CheckId, Bit> = {};
  for (const id of input.checkIds) complete[id] = input.checks[id] === 1 ? 1 : 0;
  for (const [id, bit] of Object.entries(input.checks)) {
    if (!(id in complete)) complete[id] = bit === 1 ? 1 : 0;
  }
  const state: StateFile = {
    version: STATE_VERSION,
    working: input.working ?? 0,
    checks: complete,
    counts: countsFromChecks(complete),
    perfTiers: { ...(input.perfTiers ?? {}) },
    ...(input.notes !== undefined && input.notes.length > 0 ? { notes: input.notes.slice() } : {}),
  };
  return state;
}
