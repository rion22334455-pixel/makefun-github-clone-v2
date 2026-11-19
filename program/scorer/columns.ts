// The columns the github-core-clone-01 scorer writes for one trial, in the order the leaderboard
// shows them (the leaderboard's scored columns: neither computed nor read from the score JSON, so
// grader/program-scores.ts scoredColumns requires exactly these keys, no more and no fewer, in
// scores.json; grader/agent-score.ts trialPoints requires each value to be a safe integer of
// magnitude at most AGENT_MAX_POINTS and `working` to be 0 or 1).
//
//   score        0..1000   feature + agent + perf: the rank column (primary_index)
//   feature      0..600    the conformance checks passed, scaled: round(600 * passed / total)
//   agent        0..200    the MCP (agent-native) checks passed, scaled: round(200 * passed / total)
//   perf         0..200    perf.json points_total, the four benchmark workloads' tier points
//   perf_p50_us  us        perf.json perf_p50_us: the tie-break column (tie_break_index, ascending:
//                          the lower measured time ranks first)
//   working      0|1       AGENT_WORKING_COLUMN: 1 when the export says its store works and at least
//                          one check passed
//
// The four per-workload p50s stay out: a leaderboard column's value is either written by the scorer
// (a scored column, so a scores.json key) or derived by the platform from such columns (an `avg`
// computed column), and the settled leaderboard names none of them. A scorer cannot write a
// display-only column of its own: an extra key is a ScorerError (program-scores.ts validateScores).
// Adding them later means adding four scored columns to the leaderboard and four keys here.

/** The scored columns, in leaderboard display order; scores.json holds exactly these keys. */
export const SCORE_COLUMNS = ['score', 'feature', 'agent', 'perf', 'perf_p50_us', 'working'] as const;

export type ScoreColumn = (typeof SCORE_COLUMNS)[number];

/** One trial's scores: one integer per scored column. */
export type Scores = Record<ScoreColumn, number>;

/** The env's run-invariant export (env/src/wire.ts StateFile), at /output/state.json. */
export const STATE_FILE = 'state.json';

/** The env's timings (env/src/wire.ts PerfFile), at /output/perf.json. */
export const PERF_FILE = 'perf.json';

/** The file the scorer writes: the leaderboard's scored columns, one integer each. */
export const SCORES_FILE = 'scores.json';

/** The only version of each export this scorer reads (wire.ts). */
export const EXPORT_VERSION = 1;
export const PERF_VERSION = 1;

/** The feature column's most: the conformance arm, feature = round(FEATURE_POINTS * passed / total). */
export const FEATURE_POINTS = 600;

/** The agent column's most: the MCP arm, agent = round(AGENT_POINTS * passedAgent / totalAgent). */
export const AGENT_POINTS = 200;

/** The perf column's most: the four workloads' tier points sum in perf.json (0..PERF_POINTS). */
export const PERF_POINTS = 200;

/** A perfect trial: every check passed and every performance tier maxed. */
export const MAX_SCORE = FEATURE_POINTS + AGENT_POINTS + PERF_POINTS;

/**
 * The largest magnitude a trial's points may have (grader/agent-score.ts AGENT_MAX_POINTS, and
 * contracts/competition.ts CHECK_REVEAL_MAX_PART_POINTS): a score over it is a scorer fault.
 */
export const AGENT_MAX_POINTS = 1_000_000_000;

/** The contract's agent working column (contracts/competition.ts AGENT_WORKING_COLUMN): 1 when the store works, else 0. */
export const AGENT_WORKING_COLUMN: ScoreColumn = 'working';

/** The scores a trial missing its export, or with one that does not read, gets: 0 on every column. */
export function zeroScores(): Scores {
  return { score: 0, feature: 0, agent: 0, perf: 0, perf_p50_us: 0, working: 0 };
}
