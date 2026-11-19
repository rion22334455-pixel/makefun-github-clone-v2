// One trial's score from the env's two export files (scorer/main.ts reads them and runs this):
//
//   state.json  the run-invariant export (env/src/wire.ts StateFile): version 1, checks{id: 0|1},
//               counts{total, passed, byGroup{<group>: {total, passed}}}, working 0|1. Its
//               counts are cross-checked against checks: a file whose counts disagree with its own
//               check bits does not read (the export writer is the house env, so a disagreement is a
//               corrupt file, never an entrant's doing).
//   perf.json   the timings (env/src/wire.ts PerfFile): version 1, points_total (0..200, the four
//               benchmark workloads' tier points already computed by the env from its T_ref table),
//               perf_p50_us (the geometric mean of the workloads' p50s, in microseconds).
//
// The columns and their formulas are columns.ts's header. Both files are read before anything is
// scored: a missing or malformed one scores the whole trial 0 on every column, with a note, never a
// throw (main.ts writes that zero row; the trial stands as 0, not void).
//
// Nothing here touches the filesystem: main.ts reads the bytes, the tests can feed them whole.

import {
  AGENT_MAX_POINTS,
  AGENT_POINTS,
  EXPORT_VERSION,
  FEATURE_POINTS,
  PERF_FILE,
  PERF_POINTS,
  PERF_VERSION,
  STATE_FILE,
  zeroScores,
  type Scores,
} from './columns.ts';

/** A trial's export that does not read: scored 0 on every column with this message in its note. */
export class ExportFault extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportFault';
  }
}

/** What state.json says, once it reads. */
export interface StateFacts {
  /** All the checks the manifest ran, and how many passed (counts.total, counts.passed). */
  total: number;
  passed: number;
  /** The mcp group's checks (counts.byGroup.mcp), the agent arm's; 0 when the group is absent. */
  agentTotal: number;
  agentPassed: number;
  /** state.json's working: 1 when the env's boot check and its own work say the store works. */
  working: boolean;
}

/** What perf.json says, once it reads. */
export interface PerfFacts {
  /** points_total, 0..PERF_POINTS: the four workloads' tier points, summed by the env. */
  points: number;
  /** perf_p50_us: the tie-break time, in microseconds. */
  p50Us: number;
}

/** A trial's scores and why any of them is 0 (each a line for stderr; never part of scores.json). */
export interface Scored {
  scores: Scores;
  notes: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `v` as an integer in min..max, or an ExportFault naming `what` (default max: every safe integer). */
function integerIn(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) {
    throw new ExportFault(`${what} is ${JSON.stringify(v)}, not an integer ${min}..${max}`);
  }
  return v;
}

function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ExportFault(`${name} is not JSON`);
  }
}

/**
 * (points * passed / total) rounded to the nearest integer, half away from zero (Math.round does
 * that for the non-negative values here); 0 when there is nothing to pass.
 */
export function share(points: number, passed: number, total: number): number {
  if (total <= 0) return 0;
  const n = passed < 0 ? 0 : passed > total ? total : passed;
  return Math.round((points * n) / total);
}

/**
 * state.json's facts, or an ExportFault when it does not read. The counts may not claim more than the
 * checks map holds (the export writes one bit per check and derives counts from it, manifest.ts
 * countsFromChecks): a counts block with a total past the ids, or more passes than there are 1 bits, is
 * corrupt. Extra ids beyond the manifest are allowed (manifest.ts stateFromChecks keeps an id it does
 * not know in `checks` and leaves it out of counts), and a missing byGroup, or a byGroup with no mcp
 * group, is not corrupt: the agent arm scores 0 with a note (the other columns still score).
 */
export function readState(text: string): { facts: StateFacts; notes: string[] } {
  const notes: string[] = [];
  const raw = parseJson(text, STATE_FILE);
  if (!isRecord(raw)) throw new ExportFault(`${STATE_FILE} is not a JSON object`);
  if (raw.version !== EXPORT_VERSION) throw new ExportFault(`${STATE_FILE} version ${JSON.stringify(raw.version)} is not ${EXPORT_VERSION}`);
  const checks = raw.checks;
  if (!isRecord(checks)) throw new ExportFault(`${STATE_FILE} has no checks object`);
  const ids = Object.keys(checks);
  let checkPassed = 0;
  for (const id of ids) {
    const bit = checks[id];
    if (bit !== 0 && bit !== 1) throw new ExportFault(`${STATE_FILE} checks.${id} is ${JSON.stringify(bit)}, not 0 or 1`);
    if (bit === 1) checkPassed += 1;
  }
  const counts = raw.counts;
  if (!isRecord(counts)) throw new ExportFault(`${STATE_FILE} has no counts object`);
  const total = integerIn(counts.total, 0, Number.MAX_SAFE_INTEGER, `${STATE_FILE} counts.total`);
  const passed = integerIn(counts.passed, 0, Number.MAX_SAFE_INTEGER, `${STATE_FILE} counts.passed`);
  if (passed > total) throw new ExportFault(`${STATE_FILE} counts.passed ${passed} is past counts.total ${total}`);
  if (total > ids.length) throw new ExportFault(`${STATE_FILE} counts.total ${total} is past its ${ids.length} checks`);
  if (passed > checkPassed) throw new ExportFault(`${STATE_FILE} counts.passed ${passed} is past its ${checkPassed} passing checks`);
  let agentTotal = 0;
  let agentPassed = 0;
  const byGroup = counts.byGroup;
  if (byGroup === undefined) notes.push(`${STATE_FILE} counts has no byGroup: the agent arm scores 0`);
  else if (!isRecord(byGroup)) throw new ExportFault(`${STATE_FILE} counts.byGroup is not an object`);
  else if (byGroup.mcp === undefined) notes.push(`${STATE_FILE} counts.byGroup has no mcp group: the agent arm scores 0`);
  else {
    const mcp = byGroup.mcp;
    if (!isRecord(mcp)) throw new ExportFault(`${STATE_FILE} counts.byGroup.mcp is not an object`);
    agentTotal = integerIn(mcp.total, 0, Number.MAX_SAFE_INTEGER, `${STATE_FILE} counts.byGroup.mcp.total`);
    agentPassed = integerIn(mcp.passed, 0, Number.MAX_SAFE_INTEGER, `${STATE_FILE} counts.byGroup.mcp.passed`);
    if (agentPassed > agentTotal) throw new ExportFault(`${STATE_FILE} counts.byGroup.mcp.passed ${agentPassed} is past its total ${agentTotal}`);
  }
  const working = raw.working;
  if (working !== 0 && working !== 1) throw new ExportFault(`${STATE_FILE} working is ${JSON.stringify(working)}, not 0 or 1`);
  // The env's own fixed notes (a boot failure's, wire.ts StateFile.notes) belong in the log, never in
  // scores.json; they name causes, never timings.
  if (Array.isArray(raw.notes)) {
    for (const note of raw.notes) if (typeof note === 'string' && note !== '') notes.push(`${STATE_FILE} note: ${note}`);
  }
  return { facts: { total, passed, agentTotal, agentPassed, working: working === 1 }, notes };
}

/**
 * perf.json's facts, or an ExportFault when it does not read. points_total is the whole perf column
 * (0..200: the env's tier formula, env/src/manifest.ts, summed over the four workloads); perf_p50_us
 * is the tie-break. A file without either is corrupt: both are the export's own schema (wire.ts).
 */
export function readPerf(text: string): PerfFacts {
  const raw = parseJson(text, PERF_FILE);
  if (!isRecord(raw)) throw new ExportFault(`${PERF_FILE} is not a JSON object`);
  if (raw.version !== PERF_VERSION) throw new ExportFault(`${PERF_FILE} version ${JSON.stringify(raw.version)} is not ${PERF_VERSION}`);
  const points = integerIn(raw.points_total, 0, PERF_POINTS, `${PERF_FILE} points_total`);
  const p50Us = integerIn(raw.perf_p50_us, 0, AGENT_MAX_POINTS, `${PERF_FILE} perf_p50_us`);
  return { points, p50Us };
}

/**
 * The trial's scores: the composite and its parts (columns.ts's formulas), from the two export texts
 * (null: the file is missing). A missing or malformed file, or any other failure, is 0 on every column
 * with a note, never a throw: the scorer always hands the grader a row.
 */
export function scoreExport(stateText: string | null, perfText: string | null): Scored {
  const notes: string[] = [];
  try {
    if (stateText === null) throw new ExportFault(`${STATE_FILE} is missing`);
    if (perfText === null) throw new ExportFault(`${PERF_FILE} is missing`);
    const state = readState(stateText);
    const perf = readPerf(perfText);
    const feature = share(FEATURE_POINTS, state.facts.passed, state.facts.total);
    const agent = share(AGENT_POINTS, state.facts.agentPassed, state.facts.agentTotal);
    const scores: Scores = {
      score: feature + agent + perf.points,
      feature,
      agent,
      perf: perf.points,
      perf_p50_us: perf.p50Us,
      working: state.facts.working && state.facts.passed > 0 ? 1 : 0,
    };
    for (const [column, value] of Object.entries(scores)) {
      if (!Number.isSafeInteger(value) || Math.abs(value) > AGENT_MAX_POINTS) {
        throw new ExportFault(`${column} is ${value}, not an integer of magnitude at most ${AGENT_MAX_POINTS}`);
      }
    }
    notes.push(...state.notes);
    return { scores, notes };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { scores: zeroScores(), notes: [...notes, `scored 0 on every column: ${why}`] };
  }
}
