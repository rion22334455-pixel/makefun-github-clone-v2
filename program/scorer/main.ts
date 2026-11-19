// The github-core-clone-01 scorer (agent/v1, node22): the grader runs it as `node /bot/main.ts` with
// the scorer directory mounted read-only at /bot, after the trial's env has exited and written its
// export. It reads the trial's two export files and writes the leaderboard's scored columns.
//
//   /output/state.json        the env's run-invariant export (env/src/wire.ts StateFile): checks,
//                             counts (total, passed and each group's), perfTiers and working
//   /output/perf.json         the env's timings (env/src/wire.ts PerfFile): points_total (0..200, the
//                             four benchmark workloads' tier points already computed) and perf_p50_us
//   /scores/scores.json       written here: one integer per scored column, columns.ts SCORE_COLUMNS
//
// The env writes its export at /state/export (grader/agent.ts ENV_EXPORT_DIR) and the grader
// materializes it at /output for the scorer (grader/program.ts scoreProgram: the pass's outputs are
// the scorer's /output), so /output is read first and /state/export stands in outside a container.
// MAKEFUN_EXPORT_DIR (or the other houses' MAKEFUN_OUTPUT_DIR) and MAKEFUN_SCORES_DIR override the two
// directories, as the other competitions' scorers allow in the process sandbox and the tests.
//
// A missing or malformed export is scored 0 on every column with a note on stderr, and the scorer
// still writes scores.json and exits 0: the trial stands as a 0 rather than a void, per this bundle's
// brief. The one thing that still fails the scorer is a /scores it cannot write (exit 1: a scorer
// fault, grader/program-scores.ts ScorerError). scores.json holds exactly the scored columns: an extra
// key is a scorer fault, not a display column (see columns.ts's header for the columns and formulas).

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAX_SCORE, PERF_FILE, SCORES_FILE, STATE_FILE, type Scores } from './columns.ts';
import { scoreExport } from './score.ts';

/** Where the grader materializes the env's export for the scorer. */
export const DEFAULT_EXPORT_DIR = '/output';

/** Where the env itself writes its export (grader/agent.ts), the fallback outside a scorer sandbox. */
export const ENV_EXPORT_DIR = '/state/export';

/** Where scores.json is written (the scorer sandbox's one writable mount). */
export const DEFAULT_SCORES_DIR = '/scores';

/**
 * The directory the export is read from: MAKEFUN_EXPORT_DIR, else MAKEFUN_OUTPUT_DIR, else /output
 * when it exists, else /state/export.
 */
export function exportDirOf(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.MAKEFUN_EXPORT_DIR ?? env.MAKEFUN_OUTPUT_DIR;
  if (explicit !== undefined && explicit !== '') return explicit;
  try {
    if (statSync(DEFAULT_EXPORT_DIR).isDirectory()) return DEFAULT_EXPORT_DIR;
  } catch {
    // No /output outside a container: fall through to the env's own directory.
  }
  return ENV_EXPORT_DIR;
}

/** One export file's text, or null when it cannot be read (missing, a directory, unreadable). */
export function readExport(dir: string, name: string): string | null {
  try {
    return readFileSync(join(dir, name), 'utf8');
  } catch {
    return null;
  }
}

export interface RunOptions {
  /** The directory holding state.json and perf.json. */
  exportDir: string;
  /** The directory scores.json is written to. */
  scoresDir: string;
  /** Where the one-line summary goes (default stdout); the notes always go to stderr. */
  write?: (text: string) => void;
}

/**
 * Score one trial's export and write scores.json; returns the scores. A bad export scores 0 with a
 * note, never throws; only an unwritable scores directory does.
 */
export function run(o: RunOptions): Scores {
  const scored = scoreExport(readExport(o.exportDir, STATE_FILE), readExport(o.exportDir, PERF_FILE));
  mkdirSync(o.scoresDir, { recursive: true });
  writeFileSync(join(o.scoresDir, SCORES_FILE), `${JSON.stringify(scored.scores)}\n`);
  for (const note of scored.notes) process.stderr.write(`[scorer] note: ${note}\n`);
  const s = scored.scores;
  const summary = `[scorer] score ${s.score}/${MAX_SCORE}: feature ${s.feature} + agent ${s.agent} + perf ${s.perf}; perf_p50_us ${s.perf_p50_us}, working ${s.working}\n`;
  if (o.write === undefined) process.stdout.write(summary);
  else o.write(summary);
  return scored.scores;
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(invoked).href) {
  try {
    run({ exportDir: exportDirOf(), scoresDir: process.env.MAKEFUN_SCORES_DIR ?? DEFAULT_SCORES_DIR });
  } catch (err) {
    process.stderr.write(`[scorer] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
