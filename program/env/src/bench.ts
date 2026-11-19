// github-core-clone-01's benchmark: the four timed workloads, their rounds, and the perf.json the
// scorer reads (wire.ts PerfFile; manifest.ts BENCH_WORKLOADS, T_REF_MS and the tier formula).
//
// WHAT A TRIAL DOES HERE
//   Four workloads, each a fixed amount of work against the entry, measured with the monotonic clock
//   (performance.now) as the wall time of one round; three rounds a workload (manifest.ts
//   BENCH_ROUNDS), after BENCH_WARMUP_OPS untimed operations. The workload's p50 is the median round.
//     push   200 sequential pushes of a 1 KiB change to one repository: every operation is one
//            receive-pack exchange (advertisement + command list + pack) that creates a new commit on
//            refs/heads/main. Every payload (blob, tree, commit and its pack) is built before the
//            first timing starts, so no object hashing or deflating is ever timed. The whole chain for
//            warm-ups and rounds exists up front; a round walks the next `ops` entries.
//     clone  50 concurrent shallow clones (depth 1) of a 200-commit repository. The history is
//            created once in setup (one push carrying all 200 commits); each clone verifies its
//            pack's checksum but does not parse the objects (parse: false: object parsing is the
//            conformance checks' work, and a benchmark should not measure this client).
//     read   2,000 sequential GET /api/v3/repos/{owner}/{repo}/issues/{number} on one warm
//            keep-alive connection (the same RestClient, whose undici pool reuses the socket).
//     write  200 sequential POST /api/v3/repos/{owner}/{repo}/issues.
//   Setup (repository creation, the clone history, the read workload's issue) happens inside the
//   workload's budget but outside every timed round. A workload whose setup fails is 0 points.
//
// TIME DISCIPLINE (never let a slow entry push the trial past its deadline)
//   Every workload gets the smaller of manifest.ts budgetMs (60 s) and what is left of the benchmark
//   phase (BENCH_PHASE_BUDGET_MS, 240 s, from the first call) and of the env's internal deadline
//   (options.deadlineMs). A timer aborts its in-flight requests at that instant, every operation is
//   checked against the clock before it starts, and the phase stops handing out time when it is gone.
//   A workload that throws, or that does not complete all its rounds inside its budget, earns 0
//   points and stops early. ROUNDS THAT COMPLETED BEFORE THE FAILURE ARE STILL RECORDED in `rounds`,
//   but its p50_ms and p99_ms are the sentinel FAILED_P50_MS (1e9), never a measured number: the
//   scorer floors a measured run at 1 us, so a 0 would sort FIRST on the tie-break, and a partial
//   measurement must not win one either.
//
// THE TWO SCORER RULINGS THIS FILE IMPLEMENTS
//   1. A workload that did not run or was cut by a deadline writes p50_ms = 1e9 and points = 0.
//      When NO workload measured, perf_p50_us is the sentinel 1e9 (the scorer's largest accepted
//      integer, scorer/columns.ts AGENT_MAX_POINTS); otherwise it is round(1000 * the geometric mean
//      of the p50_ms of the workloads that DID measure). The sentinel p50s never enter the mean: 1e9
//      ms would be 1e12 us and the scorer refuses anything past 1e9.
//   2. The per-round field is `rounds` (a number[] of ms), and the totals are `points_total` and
//      `perf_p50_us`. The scorer reads exactly those; `tiers` and `points` are wire.ts's own maps.
//
// THE FILE IT PRODUCES (wire.ts PerfFile, version PERF_VERSION, canonical JSON via
// canonicalJsonLine, at perfFilePath(stateDir) by the caller):
//   {
//     "version": 1,
//     "calibrated": <every T_ref > 0>,
//     "workloads": [
//       { "name": "push"|"clone"|"read"|"write",
//         "rounds": [each completed round's wall ms],
//         "p50_ms": <median round, or 1e9 when failed/cut>,
//         "p99_ms": <largest of 3, or 1e9 when failed/cut>,
//         "ops": <manifest.ts ops>,
//         "points": <0..50, the tier formula, or 0 uncalibrated/failed>,
//         "error": <why it earned 0, when it did; omitted otherwise> }
//     ],
//     "tiers": { "push": 0..4, ... },       // floor(points / 12.5), wire.ts PerfTier
//     "points": { "push": 0..50, ... },
//     "perf_p50_us": <tie-break, or 1e9 when nothing measured>,
//     "points_total": <0..200, the perf column>,
//     "notes": [fixed lines: uncalibrated T_ref names, per-workload failures; no free text]
//   }
//   A per-workload `points` is always recomputed from its p50_ms and T_ref (manifest.ts
//   workloadPoints) when the file is assembled, so a caller cannot hand it a point it did not earn.
//
// POINTS AND T_ref
//   points = round(clamp(25 - 12.5*log2(p50_ms / T_ref_ms), 0, 50)); T_ref_ms > 0 comes from
//   manifest.ts T_REF_MS, which calibration (#18) fills from the house reference forge's measured
//   medians. While a T_ref is 0 the workload still runs (the measurement is what calibration needs)
//   but earns 0 points, the file says `calibrated: false`, and its error line says "uncalibrated".
//
// HOW main.ts CALLS IT (env/src/main.ts, #14; export.ts writes the result)
//   const perf = await runBenchmark({
//     baseUrl: entry.url,                  // wire.ts EntryBase.url, no trailing slash
//     token: process.env[TOKEN_ENV] ?? '', // wire.ts TOKEN_ENV
//     signal: trialAbort.signal,           // the trial's abort (SIGTERM)
//     deadlineMs: deadline.deadlineMs,     // wire.ts deadlineOf(): the env's internal deadline
//     log: (line) => process.stderr.write(`${line}\n`),
//   });
//   writeFileSync(perfFilePath(stateDir), canonicalJsonLine(perf));
//   runBenchmark never throws for anything the entry does: a workload's failure is an `error` in its
//   entry, and a workload that never got time is an entry with p50 1e9 and 0 points. It throws only
//   for a caller's own mistake (no base URL, an unknown workload name).
//   A trial with no benchmark at all (a boot failure: no entry registered) writes
//   failedPerfFile('no entry registered before the boot deadline'): the four workloads as sentinels,
//   0 points and perf_p50_us 1e9, never wire.ts emptyPerfFile's 0 (a 0 would sort first on the
//   tie-break).
//
// WHAT THIS FILE DOES NOT DO
//   No filesystem, no process, no timer longer than a workload's budget, no Math.random and no
//   Date.now: all work data derives from the one seeded scenario (wire.ts buildScenario and a
//   'bench.*' stream of scenarioRng), and the clock is performance.now through options.now.
//   Nothing here is a pass/fail check: a slow entry fails the benchmark, not conformance.

import {
  BENCH_PHASE_BUDGET_MS,
  BENCH_ROUNDS,
  BENCH_WARMUP_OPS,
  BENCH_WORKLOADS,
  BENCH_WORKLOAD_NAMES,
  T_REF_MS,
  benchWorkload,
  isCalibrated,
  perfTieBreakUs,
  perfTiersOf,
  workloadPoints,
  type BenchWorkloadName,
  type BenchWorkloadSpec,
} from './manifest.ts';
import {
  CONFORMANCE_IDENTITY,
  GitClient,
  ZERO_OID,
  buildCommit,
  buildTree,
  hashObject,
  writePack,
  type GitObjectInput,
  type PushCommand,
  type PushResult,
} from './git-client.ts';
import { RestClient, apiPath, type RestResponse } from './rest-client.ts';
import {
  PERF_VERSION,
  buildScenario,
  generateBlobText,
  scenarioRng,
  type PerfFile,
  type PerfWorkload,
  type Scenario,
} from './wire.ts';

// ---------------------------------------------------------------- constants

/**
 * The p50_ms (and p99_ms) a workload writes when it did not run or was cut by a deadline. Not 0:
 * the scorer floors a measured run at 1 us, so a 0 would sort FIRST on the tie-break.
 */
export const FAILED_P50_MS = 1_000_000_000;
/**
 * perf_p50_us when no workload measured. Equal to the scorer's largest accepted integer
 * (scorer/columns.ts AGENT_MAX_POINTS, 1e9): the slowest honest tie-break, never 0.
 */
export const FAILED_PERF_P50_US = 1_000_000_000;

/** The repository each workload creates anew (deleted first, so a re-run starts clean). */
const PUSH_REPO = 'bench-push';
const CLONE_REPO = 'bench-clone';
const READ_REPO = 'bench-read';
const WRITE_REPO = 'bench-write';
/** The one file the push chain changes; every commit replaces its content with a fresh 1 KiB blob. */
const PUSH_FILE = 'bench-data.txt';
/** The one file the 200-commit clone history changes. */
const CLONE_FILE = 'history.txt';
/** Bytes of new content a push's commit carries ("a 1 KiB change"). */
const PUSH_CHANGE_BYTES = 1_024;
/** Bytes of the blob each clone-history commit carries. */
const CLONE_CHANGE_BYTES = 512;
/** How many commits the clone repository's history holds (the workload's "200-commit repository"). */
export const CLONE_HISTORY_COMMITS = 200;
/** A fixed epoch every generated commit timestamp derives from (never Date.now). */
const BENCH_EPOCH_SEC = 1_700_000_000;
/** The branch every workload's repository pushes to. */
const MAIN_REF = 'refs/heads/main';
/** The line an uncalibrated workload's error field and perf.json's notes carry. */
const UNCALIBRATED_ERROR = `uncalibrated: T_ref is 0, so the workload earns 0 points until calibration fills it`;

// ---------------------------------------------------------------- small utilities

/** `value` when it is a finite number, else `fallback`. */
function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** `value` as an integer in min..max, else `fallback`. */
function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** One clock reading rounded to a thousandth of a millisecond (JSON stays small; the clock is ms). */
function roundMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 1_000) / 1_000;
}

/** The nearest-rank percentile of `rounds`, in ms; FAILED_P50_MS when there is no round at all. */
export function percentileMs(rounds: readonly number[], percentile: number): number {
  if (rounds.length === 0) return FAILED_P50_MS;
  const sorted = [...rounds].sort((a, b) => a - b);
  const p = Number.isFinite(percentile) ? Math.min(100, Math.max(0, percentile)) : 50;
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? FAILED_P50_MS;
}

/** One line naming what a thrown value said (newlines flattened: perf.json's notes are lines). */
function errorLine(err: unknown): string {
  const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();
  if (err instanceof Error) return flat(err.message) === '' ? err.name : `${err.name}: ${flat(err.message)}`;
  return flat(String(err));
}

// ---------------------------------------------------------------- a workload's measurement

/**
 * What one workload measured, before the tier formula turns it into a PerfWorkload. `error` means
 * the workload failed or was cut and its p50/p99 are the sentinel; `uncalibrated` means it measured
 * but its T_ref is 0, so its times stand and its points are 0.
 */
export interface WorkloadMeasurement {
  readonly name: BenchWorkloadName;
  /** Every round that finished before the workload failed, in order, ms. */
  readonly roundsMs: readonly number[];
  /** How many timed rounds the phase asked for (normally manifest.ts spec.rounds). */
  readonly expectedRounds: number;
  /** Why the workload earned no points, when it did not finish all its rounds. */
  readonly error?: string;
  /** Measured, but T_ref is 0: the times are kept, the points are 0. */
  readonly uncalibrated?: boolean;
}

/**
 * One workload's PerfWorkload: p50/p99 from its completed rounds, points from the tier formula
 * (manifest.ts workloadPoints), or p50/p99 = FAILED_P50_MS and 0 points when it failed or was cut
 * short. `tRef` is that workload's T_ref in ms (0 uncalibrated).
 */
export function finishWorkload(spec: BenchWorkloadSpec, measurement: WorkloadMeasurement, tRef: number): PerfWorkload {
  const expected = Math.max(1, Math.trunc(measurement.expectedRounds));
  const rounds = measurement.roundsMs.map(roundMs).filter((ms) => Number.isFinite(ms) && ms >= 0);
  const failed = measurement.error !== undefined || rounds.length !== expected;
  const p50 = failed ? FAILED_P50_MS : roundMs(percentileMs(rounds, 50));
  const p99 = failed ? FAILED_P50_MS : roundMs(percentileMs(rounds, 99));
  const points = failed || measurement.uncalibrated === true ? 0 : workloadPoints(p50, tRef);
  const why = measurement.error ?? (failed ? 'the workload did not finish all its rounds' : measurement.uncalibrated === true ? UNCALIBRATED_ERROR : undefined);
  const result: PerfWorkload = {
    name: spec.name,
    rounds,
    p50_ms: p50,
    p99_ms: p99,
    ops: spec.ops,
    points,
    ...(why !== undefined ? { error: why } : {}),
  };
  return result;
}

/**
 * perf.json from the four workloads' results. Recomputes every workload's points from its own p50
 * and T_ref (a failed workload is 0), sums the column, maps the tiers, and computes the tie-break:
 * the geometric mean of the workloads that measured, or FAILED_PERF_P50_US when none did.
 * `tRefs` is the full four-slot table; `extraNotes` are fixed lines (the uncalibrated names).
 */
export function perfFileOf(
  workloads: readonly PerfWorkload[],
  tRefs: Readonly<Record<BenchWorkloadName, number>> = T_REF_MS,
  extraNotes: readonly string[] = [],
): PerfFile {
  const normalized: PerfWorkload[] = workloads.map((workload) => {
    const name = workload.name as BenchWorkloadName;
    const tRef = finiteOr(tRefs[name], 0);
    const failed = workload.error !== undefined || !(Number.isFinite(workload.p50_ms) && workload.p50_ms < FAILED_P50_MS);
    const points = failed ? 0 : workloadPoints(workload.p50_ms, tRef);
    return {
      name: workload.name,
      rounds: workload.rounds.map(roundMs),
      p50_ms: workload.p50_ms,
      p99_ms: workload.p99_ms,
      ops: workload.ops,
      points,
      ...(workload.error !== undefined ? { error: workload.error } : {}),
    };
  });
  const points: Record<string, number> = {};
  const tiersInput: Record<string, number> = {};
  let pointsTotal = 0;
  for (const workload of normalized) {
    points[workload.name] = workload.points;
    tiersInput[workload.name] = workload.points;
    pointsTotal += workload.points;
  }
  const measured = normalized
    .filter((workload) => Number.isFinite(workload.p50_ms) && workload.p50_ms < FAILED_P50_MS)
    .map((workload) => Math.max(0, workload.p50_ms));
  const perfP50Us = measured.length === 0 ? FAILED_PERF_P50_US : Math.min(FAILED_PERF_P50_US, perfTieBreakUs(measured));
  const notes: string[] = [];
  for (const note of extraNotes) if (note !== '' && !notes.includes(note)) notes.push(note);
  for (const workload of normalized) {
    if (workload.error !== undefined) notes.push(`${workload.name}: ${workload.error}`);
  }
  if (measured.length === 0) notes.push(`no workload measured: perf_p50_us is the sentinel ${FAILED_PERF_P50_US}`);
  else if (measured.length < normalized.length) notes.push(`perf_p50_us is the geometric mean of the ${measured.length} workload(s) that measured`);
  return {
    version: PERF_VERSION,
    calibrated: isCalibrated(tRefs),
    workloads: normalized,
    tiers: perfTiersOf(tiersInput),
    points,
    perf_p50_us: perfP50Us,
    points_total: pointsTotal,
    notes,
  };
}

/**
 * The perf.json a trial with no benchmark at all writes (a boot failure: no entry ever registered).
 * Every workload is the sentinel with `error`, so points_total is 0 and perf_p50_us is the 1e9
 * tie-break, never wire.ts emptyPerfFile's 0 (a 0 would sort first on the tie-break). main.ts should
 * prefer this over emptyPerfFile whenever the benchmark never ran.
 */
export function failedPerfFile(
  error: string,
  tRefs: Readonly<Record<BenchWorkloadName, number>> = T_REF_MS,
  notes: readonly string[] = [],
): PerfFile {
  const why = error === '' ? 'the benchmark did not run' : error;
  const workloads = BENCH_WORKLOADS.map((spec) =>
    finishWorkload(spec, { name: spec.name, roundsMs: [], expectedRounds: spec.rounds, error: why }, 0),
  );
  return perfFileOf(workloads, tRefs, notes);
}

// ---------------------------------------------------------------- the run's own context

/** Thrown by a workload's own deadline/abort check; never escapes runBenchmark. */
class WorkloadStop extends Error {
  readonly reason: 'deadline' | 'aborted';

  constructor(reason: 'deadline' | 'aborted', message: string) {
    super(message);
    this.name = 'WorkloadStop';
    this.reason = reason;
  }
}

/** Everything one workload's body may read and must respect. */
interface WorkloadRun {
  readonly spec: BenchWorkloadSpec;
  readonly baseUrl: string;
  readonly token: string;
  readonly scenario: Scenario;
  readonly now: () => number;
  /** The absolute `now()` reading past which this workload's work is 0. */
  readonly deadlineAt: number;
  /** Aborted at deadlineAt and when the trial aborts: every client call carries it. */
  readonly signal: AbortSignal;
  /** Timed rounds the phase asked for (manifest.ts spec.rounds unless overridden). */
  readonly rounds: number;
  /** Untimed operations before the first round (manifest.ts warmupOps unless overridden). */
  readonly warmupOps: number;
  /** Completed rounds, ms, in order: a body pushes one after every round it finishes. */
  readonly roundsMs: number[];
  readonly log: (line: string) => void;
  /** Set when the workload's own timer fired (rather than the trial's abort). */
  expired: boolean;
  /** What is left of the workload's budget, ms, never negative. */
  remainingMs(): number;
  /** Throw WorkloadStop when the budget or the trial ran out; call before every operation. */
  check(): void;
}

/** The line a workload's deadline failure carries. */
function deadlineText(spec: BenchWorkloadSpec): string {
  return `deadline: the workload did not finish inside its ${spec.budgetMs} ms budget`;
}

// ---------------------------------------------------------------- seeded fixture data

/** A push operation's pre-built bytes: the command list entry and the pack that carries its objects. */
interface PushPayload {
  readonly command: PushCommand;
  readonly pack: Buffer;
}

/**
 * `count` push operations' command+pack, built before any timing starts. Each step creates one commit
 * on refs/heads/main whose tree holds PUSH_FILE with a fresh PUSH_CHANGE_BYTES seeded blob; the first
 * creates the branch (oldOid ZERO_OID), every later one updates it from the previous commit. The
 * pack carries only the three objects the server does not have (blob, tree, commit), so each exchange
 * is exactly "one 1 KiB change and its commit".
 */
function buildPushPayloads(count: number): PushPayload[] {
  const rng = scenarioRng('bench.push');
  const payloads: PushPayload[] = [];
  let parent: string | null = null;
  for (let index = 0; index < Math.max(0, Math.trunc(count)); index += 1) {
    const blob = Buffer.from(generateBlobText(rng, PUSH_CHANGE_BYTES), 'utf8');
    const blobOid = hashObject('blob', blob);
    const tree = buildTree([{ mode: '100644', name: PUSH_FILE, oid: blobOid }]);
    const treeOid = hashObject('tree', tree);
    const commit = buildCommit({
      tree: treeOid,
      parents: parent === null ? [] : [parent],
      message: `bench: push ${index + 1}\n`,
      author: CONFORMANCE_IDENTITY,
      committer: CONFORMANCE_IDENTITY,
      timestamp: BENCH_EPOCH_SEC + index,
    });
    const commitOid = hashObject('commit', commit);
    const objects: GitObjectInput[] = [
      { type: 'blob', data: blob },
      { type: 'tree', data: tree },
      { type: 'commit', data: commit },
    ];
    payloads.push({
      command: { oldOid: parent ?? ZERO_OID, newOid: commitOid, ref: MAIN_REF },
      pack: writePack(objects),
    });
    parent = commitOid;
  }
  return payloads;
}

/**
 * The clone repository's whole history in one pack: CLONE_HISTORY_COMMITS commits on refs/heads/main,
 * each replacing CLONE_FILE's content, so a depth-1 clone has a real 200-commit history to cut off.
 * Built once in setup, outside every timed round.
 */
function buildCloneHistory(): { tip: string; pack: Buffer } {
  const rng = scenarioRng('bench.clone');
  const objects: GitObjectInput[] = [];
  let tip = '';
  for (let index = 0; index < CLONE_HISTORY_COMMITS; index += 1) {
    const blob = Buffer.from(generateBlobText(rng, CLONE_CHANGE_BYTES), 'utf8');
    const blobOid = hashObject('blob', blob);
    const tree = buildTree([{ mode: '100644', name: CLONE_FILE, oid: blobOid }]);
    const treeOid = hashObject('tree', tree);
    const commit = buildCommit({
      tree: treeOid,
      parents: tip === '' ? [] : [tip],
      message: `bench: history ${index + 1}\n`,
      author: CONFORMANCE_IDENTITY,
      committer: CONFORMANCE_IDENTITY,
      timestamp: BENCH_EPOCH_SEC + index,
    });
    tip = hashObject('commit', commit);
    objects.push({ type: 'blob', data: blob }, { type: 'tree', data: tree }, { type: 'commit', data: commit });
  }
  return { tip, pack: writePack(objects) };
}

// ---------------------------------------------------------------- clients and fixtures

/** A git client bound to the entry for one workload; every call carries the workload's signal. */
function gitClientOf(run: WorkloadRun): GitClient {
  return new GitClient({
    baseUrl: run.baseUrl,
    token: run.token,
    signal: run.signal,
    timeoutMs: Math.max(1, run.remainingMs()),
  });
}

/** A REST client bound to the entry for one workload; every call carries the workload's signal. */
function restClientOf(run: WorkloadRun): RestClient {
  return new RestClient({
    baseUrl: run.baseUrl,
    // An empty token sends no Authorization header, as GitClient does; null is RestClient's "none".
    token: run.token === '' ? null : run.token,
    signal: run.signal,
    timeoutMs: Math.max(1, run.remainingMs()),
  });
}

/** The owner every benchmark repository belongs to (the scenario's viewer, as every check uses). */
function ownerOf(run: WorkloadRun): string {
  return run.scenario.viewer.login;
}

/**
 * Delete the workload's repository when it exists, then create it: a re-run in the same entry process
 * starts from an empty repository, so the fixed push chain's first oldOid is ZERO_OID again. DELETE's
 * own answer is not scored (404 when absent is the normal fresh case); the create reports a real
 * failure, and GitClient.createRepo accepts the 422 that says the repository already exists.
 */
async function recreateRepo(run: WorkloadRun, git: GitClient, rest: RestClient, repo: string): Promise<void> {
  const owner = ownerOf(run);
  run.check();
  await rest.delete(apiPath('repos', owner, repo), { timeoutMs: run.remainingMs() });
  run.check();
  await git.createRepo(owner, repo, { signal: run.signal, timeoutMs: run.remainingMs() });
}

/** Throw unless a push's report-status says the ref was updated and the pack unpacked. */
function assertPushOk(result: PushResult, ref: string): void {
  if (result.report === null) throw new Error(`push ${ref}: the entry returned no report-status`);
  if (!result.report.unpackOk) throw new Error(`push ${ref}: unpack failed (${result.report.unpackDetail})`);
  const report = result.report.refs.find((entry) => entry.ref === ref);
  if (report === undefined) throw new Error(`push ${ref}: the report-status did not name the ref`);
  if (!report.ok) throw new Error(`push ${ref}: refused (${report.reason === '' ? 'no reason given' : report.reason})`);
}

/** One REST response as a failure line (newlines flattened: perf.json's notes are lines). */
function describeRest(response: RestResponse): string {
  if (response.status === 0) return `no response (${errorLine(response.error ?? 'unknown transport error')})`;
  const flat = response.text.replace(/\s+/g, ' ').trim();
  const body = flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
  return body === '' ? `HTTP ${response.status}` : `HTTP ${response.status}: ${body}`;
}

/** The `number` of a created issue's JSON body, or null when it is not a positive safe integer. */
function issueNumberOf(body: unknown): number | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const number = (body as Record<string, unknown>).number;
  return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? number : null;
}

// ---------------------------------------------------------------- the four workloads

/**
 * push: 200 sequential receive-pack updates of one 1 KiB commit on one repository. Every command and
 * pack is built before the warm-ups; a round walks the next `ops` of them. A refused update fails the
 * workload (the entry did not do the work, so its wall time means nothing).
 */
async function runPush(run: WorkloadRun): Promise<void> {
  const git = gitClientOf(run);
  const rest = restClientOf(run);
  const owner = ownerOf(run);
  await recreateRepo(run, git, rest, PUSH_REPO);
  run.check();
  const total = run.warmupOps + run.rounds * run.spec.ops;
  run.log(`[bench] push: built ${total} push payload(s) before timing`);
  const payloads = buildPushPayloads(total);
  let next = 0;
  const pushOnce = async (): Promise<void> => {
    run.check();
    const payload = payloads[next];
    if (payload === undefined) throw new Error('push: the pre-built payload list ran out');
    next += 1;
    const result = await git.push(owner, PUSH_REPO, [payload.command], {
      pack: payload.pack,
      signal: run.signal,
      timeoutMs: run.remainingMs(),
    });
    assertPushOk(result, MAIN_REF);
  };
  for (let index = 0; index < run.warmupOps; index += 1) await pushOnce();
  for (let round = 0; round < run.rounds; round += 1) {
    run.check();
    const startedAt = run.now();
    for (let index = 0; index < run.spec.ops; index += 1) await pushOnce();
    const elapsed = roundMs(run.now() - startedAt);
    run.roundsMs.push(elapsed);
    run.log(`[bench] push round ${round + 1}/${run.rounds}: ${elapsed} ms`);
  }
}

/**
 * clone: 50 concurrent depth-1 clones of a 200-commit repository, each stream checksum-verified and
 * not object-parsed (parse: false). The 200-commit history is pushed once in setup. A clone that
 * receives no pack (or whose checksum fails, which the client throws) fails the workload.
 */
async function runClone(run: WorkloadRun): Promise<void> {
  const git = gitClientOf(run);
  const rest = restClientOf(run);
  const owner = ownerOf(run);
  await recreateRepo(run, git, rest, CLONE_REPO);
  run.check();
  const history = buildCloneHistory();
  run.log(`[bench] clone: built the ${CLONE_HISTORY_COMMITS}-commit history (${history.pack.length} pack bytes)`);
  const pushed = await git.push(owner, CLONE_REPO, [{ oldOid: ZERO_OID, newOid: history.tip, ref: MAIN_REF }], {
    pack: history.pack,
    signal: run.signal,
    timeoutMs: run.remainingMs(),
  });
  assertPushOk(pushed, MAIN_REF);
  const cloneOnce = async (): Promise<void> => {
    run.check();
    const result = await git.clone(owner, CLONE_REPO, {
      depth: 1,
      parse: false,
      singleBranch: true,
      signal: run.signal,
      timeoutMs: run.remainingMs(),
    });
    if (result.checksumOk !== true) throw new Error('clone: the pack checksum did not verify');
    if (result.packBytes <= 0) throw new Error('clone: the clone received no packfile');
    if (result.refs.length === 0) throw new Error('clone: the clone received no refs');
  };
  for (let index = 0; index < run.warmupOps; index += 1) await cloneOnce();
  for (let round = 0; round < run.rounds; round += 1) {
    run.check();
    const startedAt = run.now();
    await Promise.all(Array.from({ length: run.spec.ops }, () => cloneOnce()));
    const elapsed = roundMs(run.now() - startedAt);
    run.roundsMs.push(elapsed);
    run.log(`[bench] clone round ${round + 1}/${run.rounds}: ${elapsed} ms (${run.spec.ops} concurrent)`);
  }
}

/**
 * read: 2,000 sequential GETs of one issue on a warm keep-alive connection. Setup creates the issue
 * through the REST surface and reads its number; the same RestClient then reuses undici's pooled
 * socket for every read (the 5 warm-ups come first).
 */
async function runRead(run: WorkloadRun): Promise<void> {
  const git = gitClientOf(run);
  const rest = restClientOf(run);
  const owner = ownerOf(run);
  await recreateRepo(run, git, rest, READ_REPO);
  run.check();
  const template = run.scenario.issues[0];
  if (template === undefined) throw new Error('read: the scenario has no issue template');
  const created = await rest.post(apiPath('repos', owner, READ_REPO, 'issues'), {
    body: { title: `${template.title} (bench setup)`, body: template.body },
    timeoutMs: run.remainingMs(),
  });
  if (created.status !== 201) throw new Error(`read: the setup issue create answered ${describeRest(created)}`);
  const number = issueNumberOf(created.body);
  if (number === null) throw new Error('read: the setup issue create answered no numeric issue number');
  const path = apiPath('repos', owner, READ_REPO, 'issues', number);
  const readOnce = async (): Promise<void> => {
    run.check();
    const response = await rest.get(path, { timeoutMs: run.remainingMs() });
    if (response.status !== 200) throw new Error(`read: GET issue ${number} answered ${describeRest(response)}`);
    if (typeof response.body !== 'object' || response.body === null) throw new Error(`read: GET issue ${number} answered no JSON object body`);
  };
  for (let index = 0; index < run.warmupOps; index += 1) await readOnce();
  for (let round = 0; round < run.rounds; round += 1) {
    run.check();
    const startedAt = run.now();
    for (let index = 0; index < run.spec.ops; index += 1) await readOnce();
    const elapsed = roundMs(run.now() - startedAt);
    run.roundsMs.push(elapsed);
    run.log(`[bench] read round ${round + 1}/${run.rounds}: ${elapsed} ms`);
  }
}

/**
 * write: 200 sequential issue creations. Every title is built before the warm-ups; a create that is
 * not a 201 (GitHub's create-issue status) fails the workload.
 */
async function runWrite(run: WorkloadRun): Promise<void> {
  const git = gitClientOf(run);
  const rest = restClientOf(run);
  const owner = ownerOf(run);
  await recreateRepo(run, git, rest, WRITE_REPO);
  run.check();
  const total = run.warmupOps + run.rounds * run.spec.ops;
  const payloads: Array<{ title: string; body: string }> = [];
  for (let index = 0; index < total; index += 1) {
    const template = run.scenario.issues[index % run.scenario.issues.length];
    if (template === undefined) throw new Error('write: the scenario has no issue template');
    payloads.push({ title: `${template.title} [bench ${index + 1}]`, body: template.body });
  }
  const path = apiPath('repos', owner, WRITE_REPO, 'issues');
  let next = 0;
  const writeOnce = async (): Promise<void> => {
    run.check();
    const payload = payloads[next];
    if (payload === undefined) throw new Error('write: the pre-built issue list ran out');
    next += 1;
    const response = await rest.post(path, { body: payload, timeoutMs: run.remainingMs() });
    if (response.status !== 201) throw new Error(`write: the issue create answered ${describeRest(response)}`);
  };
  for (let index = 0; index < run.warmupOps; index += 1) await writeOnce();
  for (let round = 0; round < run.rounds; round += 1) {
    run.check();
    const startedAt = run.now();
    for (let index = 0; index < run.spec.ops; index += 1) await writeOnce();
    const elapsed = roundMs(run.now() - startedAt);
    run.roundsMs.push(elapsed);
    run.log(`[bench] write round ${round + 1}/${run.rounds}: ${elapsed} ms`);
  }
}

/** The workload bodies, keyed by manifest.ts name. */
const WORKLOAD_BODIES: Readonly<Record<BenchWorkloadName, (run: WorkloadRun) => Promise<void>>> = Object.freeze({
  push: runPush,
  clone: runClone,
  read: runRead,
  write: runWrite,
});

// ---------------------------------------------------------------- one workload's phase

/** What a workload needs from the phase around it. */
interface PhaseContext {
  readonly baseUrl: string;
  readonly token: string;
  readonly scenario: Scenario;
  readonly now: () => number;
  /** The absolute `now()` reading the benchmark phase must stop at. */
  readonly phaseEnd: number;
  readonly signal: AbortSignal | undefined;
  readonly rounds: number;
  readonly warmupOps: number;
  readonly log: (line: string) => void;
}

/**
 * Run one workload inside its own budget (manifest.ts budgetMs, capped by the phase's end), with a
 * timer that aborts its in-flight requests at the deadline. Never throws: a failure is the
 * measurement's `error`, and whatever rounds finished are kept.
 */
async function runWorkload(spec: BenchWorkloadSpec, phase: PhaseContext): Promise<WorkloadMeasurement> {
  const startedAt = phase.now();
  const deadlineAt = Math.min(startedAt + spec.budgetMs, phase.phaseEnd);
  if (deadlineAt <= startedAt) {
    return { name: spec.name, roundsMs: [], expectedRounds: phase.rounds, error: 'the benchmark phase deadline fell before the workload ran' };
  }
  const controller = new AbortController();
  if (phase.signal?.aborted === true) controller.abort();
  const state = { expired: false };
  const run: WorkloadRun = {
    spec,
    baseUrl: phase.baseUrl,
    token: phase.token,
    scenario: phase.scenario,
    now: phase.now,
    deadlineAt,
    signal: controller.signal,
    rounds: phase.rounds,
    warmupOps: phase.warmupOps,
    roundsMs: [],
    log: phase.log,
    get expired(): boolean {
      return state.expired;
    },
    set expired(value: boolean) {
      state.expired = value;
    },
    remainingMs(): number {
      return Math.max(0, deadlineAt - phase.now());
    },
    check(): void {
      if (controller.signal.aborted) {
        throw new WorkloadStop(state.expired ? 'deadline' : 'aborted', state.expired ? deadlineText(spec) : 'the trial was aborted');
      }
      if (phase.now() > deadlineAt) {
        state.expired = true;
        controller.abort();
        throw new WorkloadStop('deadline', deadlineText(spec));
      }
    },
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = (): void => controller.abort();
  if (!controller.signal.aborted) {
    timer = setTimeout(() => {
      state.expired = true;
      controller.abort();
    }, Math.max(1, deadlineAt - phase.now()));
    phase.signal?.addEventListener('abort', onAbort, { once: true });
  }
  try {
    await WORKLOAD_BODIES[spec.name](run);
    return { name: spec.name, roundsMs: [...run.roundsMs], expectedRounds: phase.rounds };
  } catch (err) {
    // Read the abort state before aborting the workload's own in-flight calls below: an entry's
    // error (a 404, a refused push) must be recorded as itself, not as the abort we then send.
    const why =
      err instanceof WorkloadStop
        ? err.message
        : controller.signal.aborted
          ? state.expired
            ? deadlineText(spec)
            : 'the trial was aborted'
          : errorLine(err);
    controller.abort();
    return { name: spec.name, roundsMs: [...run.roundsMs], expectedRounds: phase.rounds, error: why };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    phase.signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------- the phase

/** Everything runBenchmark accepts. Only baseUrl is required; the rest is the sealed main.ts's. */
export interface BenchmarkOptions {
  /** The entry's base URL (wire.ts EntryBase.url), no trailing slash needed. */
  readonly baseUrl: string;
  /** The bearer token every API call presents (wire.ts TOKEN_ENV); '' sends none. */
  readonly token?: string;
  /** The trial's abort (SIGTERM): ends the workload in flight and marks the rest unrun. */
  readonly signal?: AbortSignal;
  /** The env's internal deadline, an absolute performance.now() reading (wire.ts deadline.deadlineMs). */
  readonly deadlineMs?: number;
  /** This phase's own budget, ms; default wire.ts BENCHMARK_BUDGET_MS (240 s). */
  readonly phaseBudgetMs?: number;
  /** T_ref overrides; omitted slots keep manifest.ts T_REF_MS. 0 means uncalibrated. */
  readonly tRefs?: Readonly<Partial<Record<BenchWorkloadName, number>>>;
  /** Timed rounds a workload; default manifest.ts BENCH_ROUNDS (3). A smoke run may pass 1. */
  readonly rounds?: number;
  /** Untimed warm-up operations; default manifest.ts BENCH_WARMUP_OPS (5). */
  readonly warmupOps?: number;
  /** The workloads to run, in order; default manifest.ts BENCH_WORKLOAD_NAMES (all four). */
  readonly workloads?: readonly BenchWorkloadName[];
  /** The monotonic clock; default performance.now. `deadlineMs` is on this clock too. */
  readonly now?: () => number;
  /** A diagnostic line per workload and round (stderr in the sealed env); never scored. */
  readonly log?: (line: string) => void;
}

/**
 * Run the benchmark and return the perf.json body (wire.ts PerfFile). Never throws for what the entry
 * does: every workload's failure is its `error` and 0 points, and a workload the phase never reached
 * writes p50_ms 1e9 with 0 points (the scorer's ruling). The caller writes the result with
 * canonicalJsonLine to wire.ts perfFilePath(stateDir).
 */
export async function runBenchmark(options: BenchmarkOptions): Promise<PerfFile> {
  if (typeof options?.baseUrl !== 'string' || options.baseUrl.trim() === '') {
    throw new TypeError('runBenchmark needs the entry base URL (wire.ts EntryBase.url)');
  }
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
  const token = typeof options.token === 'string' ? options.token : '';
  const now = options.now ?? ((): number => performance.now());
  const rounds = clampInt(options.rounds, 1, 25, BENCH_ROUNDS);
  const warmupOps = clampInt(options.warmupOps, 0, 200, BENCH_WARMUP_OPS);
  const phaseBudget = finiteOr(options.phaseBudgetMs, BENCH_PHASE_BUDGET_MS);
  const phaseStart = now();
  const deadlineMs = finiteOr(options.deadlineMs, Number.POSITIVE_INFINITY);
  const phaseEnd = Math.min(phaseStart + Math.max(1, phaseBudget), deadlineMs);
  const log = options.log ?? ((): void => undefined);
  const scenario = buildScenario();

  const tRefs: Record<BenchWorkloadName, number> = {
    push: T_REF_MS.push,
    clone: T_REF_MS.clone,
    read: T_REF_MS.read,
    write: T_REF_MS.write,
  };
  for (const workload of BENCH_WORKLOADS) {
    const override = options.tRefs?.[workload.name];
    if (override !== undefined) tRefs[workload.name] = finiteOr(override, 0);
  }

  const requested = options.workloads ?? BENCH_WORKLOAD_NAMES;
  const order: BenchWorkloadName[] = [];
  const seen = new Set<BenchWorkloadName>();
  for (const name of requested) {
    if (!BENCH_WORKLOAD_NAMES.includes(name)) throw new TypeError(`unknown benchmark workload ${JSON.stringify(name)} (the workloads are ${BENCH_WORKLOAD_NAMES.join(', ')})`);
    if (seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }

  const phase: Omit<PhaseContext, 'rounds' | 'warmupOps'> = {
    baseUrl,
    token,
    scenario,
    now,
    phaseEnd,
    signal: options.signal,
    log,
  };
  const measurements: WorkloadMeasurement[] = [];
  for (const name of order) {
    const spec = benchWorkload(name);
    if (options.signal?.aborted === true) {
      measurements.push({ name, roundsMs: [], expectedRounds: rounds, error: 'the trial was aborted before the workload ran' });
      continue;
    }
    if (now() >= phaseEnd) {
      measurements.push({ name, roundsMs: [], expectedRounds: rounds, error: 'the benchmark phase deadline fell before the workload ran' });
      continue;
    }
    log(`[bench] ${name}: ${spec.ops} op(s) a round, ${rounds} round(s), ${warmupOps} warm-up op(s), ${spec.budgetMs} ms budget`);
    const measured = await runWorkload(spec, { ...phase, rounds, warmupOps });
    const tRef = finiteOr(tRefs[name], 0);
    measurements.push(tRef > 0 ? measured : { ...measured, uncalibrated: true });
  }

  const tRefsOut = tRefs;
  const uncalibrated = BENCH_WORKLOADS.filter((workload) => !(finiteOr(tRefsOut[workload.name], 0) > 0)).map((workload) => workload.name);
  const notes: string[] = [];
  if (uncalibrated.length > 0) notes.push(`T_ref is uncalibrated (0) for ${uncalibrated.join(', ')}: those workloads earn 0 points`);

  const workloads = measurements.map((measurement) => {
    const spec = benchWorkload(measurement.name);
    const result = finishWorkload(spec, measurement, finiteOr(tRefsOut[measurement.name], 0));
    log(`[bench] ${measurement.name}: p50 ${result.p50_ms} ms, ${result.points} point(s)${result.error !== undefined ? ` (${result.error})` : ''}`);
    return result;
  });
  return perfFileOf(workloads, tRefsOut, notes);
}
