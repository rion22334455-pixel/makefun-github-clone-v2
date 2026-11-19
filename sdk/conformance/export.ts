// github-core-clone-01's export writer: the two files the sealed scorer reads, their bytes, and the rule
// that a worse export never replaces a better one.
//
//   <stateDir>/export/state.json   wire.ts StateFile: the run's pass/fail bits, the counts derived from
//                                  them, a static perfTiers table and working. Canonical JSON (keys sorted
//                                  at every depth, one trailing newline), integers only.
//   <stateDir>/export/perf.json    wire.ts PerfFile: the benchmark's measured rounds, points and tiers.
//
// THE RULING THIS FILE IMPLEMENTS (the item's settled decision): state.json holds no timing-derived value.
// A contender's trial is replayed and the two state exports are compared byte for byte, so a field derived
// from a measured duration would make two runs of the same entry differ on noise alone. The measured bands
// therefore live in perf.json alone (bench.ts perfFileOf), the scorer reads the perf column from
// perf.json (scorer/score.ts reads points_total there), and state.json's perfTiers is the four workload
// names at 0: present, typed 0..4 as wire.ts requires, and identical on every run. manifest.ts
// perfTiersOf() is still the function that turns measured points into bands; it is called by bench.ts,
// never here.
//
// WRITES: synchronous and atomic (a temporary beside the file, written and fsynced, then renamed), because
// a SIGTERM handler writes them from inside the signal. A state export that passed no more checks, or a perf
// export that scored fewer points, than the file already on disk is not written: a completed run survives a
// later boot failure or an abort in the same state directory. An equal export is rewritten: its bytes are
// the same, so a replay compares equal either way.
//
// This module imports Node's fs (it is the writer) and nothing outside env/src; scripts/competitions/
// build-agent-bundle.ts inlines it into the sealed env.

import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import {
  BENCH_WORKLOAD_NAMES,
  CHECK_GROUPS,
  checkGroupOf,
  checkId,
  countsFromChecks,
  stateFromChecks,
  type BenchWorkloadName,
} from './manifest.ts';
import {
  BOOT_FAILED_NOTE,
  canonicalJsonLine,
  exportDirPath,
  isPerfFile,
  isStateFile,
  perfFilePath,
  stateFilePath,
  workingBit,
  type Bit,
  type CheckId,
  type PerfFile,
  type PerfTier,
  type StateFile,
} from './wire.ts';

/** What one check reported: its bit and the line its log showed (a detail never enters an export). */
export interface CheckOutcome {
  readonly ok: boolean;
  readonly detail?: string;
}

/**
 * The perfTiers table state.json carries: the four workloads at 0. Not the measured bands (perf.json's
 * tiers), so two runs of one entry on one seed write identical bytes (see the header).
 */
export const STATIC_PERF_TIERS: Readonly<Record<BenchWorkloadName, PerfTier>> = Object.freeze({
  push: 0,
  clone: 0,
  read: 0,
  write: 0,
});

/** Everything the state export needs: the manifest's ids, the run's results, and whether boot succeeded. */
export interface StateExportInput {
  /** Every check id the manifest declares, in registration order (manifest.ts checkIdsOf(specs)). */
  readonly checkIds: readonly CheckId[];
  /** The run's outcomes; an id with no entry (never reached) is 0. */
  readonly results: Readonly<Record<CheckId, CheckOutcome | undefined>>;
  /** Whether the boot phase succeeded (the entry registered and /healthz answered twice). */
  readonly bootOk: boolean;
  /** Fixed causes only, never a timing (wire.ts notes). */
  readonly notes?: readonly string[];
  /** Pad a suite short of the manifest with one 0 id a missing check (default true); false exports as given. */
  readonly pad?: boolean;
}

/**
 * The manifest's whole id list: `checkIds` plus one `<group>.missing-<n>` id (bit 0) for every check a
 * group declares but does not register. The scorer refuses an export whose counts.total is past its checks
 * map (scorer/score.ts), so a suite mid-build still exports every declared id and the five unregistered
 * checks count 0 against the manifest's denominator instead of shrinking it. A complete suite is unchanged.
 */
export function exportCheckIds(checkIds: readonly CheckId[]): CheckId[] {
  const present = new Set(checkIds);
  const out: CheckId[] = [...present];
  for (const group of CHECK_GROUPS) {
    let registered = 0;
    for (const id of present) if (checkGroupOf(id) === group.id) registered += 1;
    for (let index = registered; index < group.checks; index += 1) {
      let suffix = index - registered + 1;
      let id = checkId(group.id, `missing-${suffix}`);
      while (present.has(id)) {
        suffix += 1;
        id = checkId(group.id, `missing-${suffix}`);
      }
      present.add(id);
      out.push(id);
    }
  }
  return out;
}

/** The run's 0|1 bits, one for every id given (an unrun check is 0). */
export function checksOf(input: StateExportInput): Record<CheckId, Bit> {
  const checks: Record<CheckId, Bit> = {};
  for (const id of input.checkIds) checks[id] = input.results[id]?.ok === true ? 1 : 0;
  return checks;
}

/**
 * state.json from a run: every declared check's bit, counts derived from the bits (manifest.ts
 * countsFromChecks), the static perfTiers, working = 1 only when boot succeeded and at least one check
 * passed (wire.ts workingBit), and the caller's fixed notes. No clock, no port and no random id enters it.
 */
export function stateExportOf(input: StateExportInput): StateFile {
  const checkIds = input.pad === false ? [...input.checkIds] : exportCheckIds(input.checkIds);
  const bitsInput: StateExportInput = { ...input, checkIds };
  const checks = checksOf(bitsInput);
  const counts = countsFromChecks(checks);
  const working = workingBit(input.bootOk, counts.passed);
  const notes = input.notes === undefined ? [] : input.notes.slice();
  return stateFromChecks({ checks, checkIds, perfTiers: STATIC_PERF_TIERS, working, notes });
}

/** The export a boot failure writes: every check 0, working 0, the fixed boot note (wire.ts BOOT_FAILED_NOTE). */
export function bootFailureExport(checkIds: readonly CheckId[], notes: readonly string[] = [BOOT_FAILED_NOTE]): StateFile {
  return stateExportOf({ checkIds, results: {}, bootOk: false, notes });
}

/** The result of one file's write: whether it was written, kept, and where it sits. */
export interface ExportWrite {
  readonly written: boolean;
  readonly kept: boolean;
  readonly path: string;
}

/** A parsed state.json from disk, or null when the file is absent, unreadable or not this contract's. */
export function readStateExport(file: string): StateFile | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isStateFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** A parsed perf.json from disk, or null when the file is absent, unreadable or not this contract's. */
export function readPerfExport(file: string): PerfFile | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isPerfFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Whether `next` may replace `existing`: not worse. A run that works beats one that does not, and among
 * runs that agree on working, the one with more passing checks wins; an equal state is rewritten (its bytes
 * are the same). Anything else keeps the file already on disk.
 */
export function stateNotWorse(existing: StateFile, next: StateFile): boolean {
  if (next.working !== existing.working) return next.working > existing.working;
  return next.counts.passed >= existing.counts.passed;
}

/** Whether `next` may replace `existing` perf: a run that scored at least as many points may. */
export function perfNotWorse(existing: PerfFile, next: PerfFile): boolean {
  return next.points_total >= existing.points_total;
}

/** Write a file whole: a temporary beside it, written and fsynced, then renamed over it. */
function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}

/**
 * Write export/state.json with canonicalJsonLine's exact bytes. With `keepBetter` (the default) an export
 * on disk that is not worse than this one is kept; `{ keepBetter: false }` always writes.
 */
export function writeStateExport(stateDir: string, state: StateFile, options: { readonly keepBetter?: boolean } = {}): ExportWrite {
  const dir = exportDirPath(stateDir);
  mkdirSync(dir, { recursive: true });
  const path = stateFilePath(stateDir);
  if (options.keepBetter !== false) {
    const existing = readStateExport(path);
    if (existing !== null && !stateNotWorse(existing, state)) return { written: false, kept: true, path };
  }
  writeAtomic(path, canonicalJsonLine(state));
  return { written: true, kept: false, path };
}

/**
 * Write export/perf.json with canonicalJsonLine's exact bytes. With `keepBetter` (the default) a perf file
 * on disk that scored more points is kept; `{ keepBetter: false }` always writes.
 */
export function writePerfExport(stateDir: string, perf: PerfFile, options: { readonly keepBetter?: boolean } = {}): ExportWrite {
  const dir = exportDirPath(stateDir);
  mkdirSync(dir, { recursive: true });
  const path = perfFilePath(stateDir);
  if (options.keepBetter !== false) {
    const existing = readPerfExport(path);
    if (existing !== null && !perfNotWorse(existing, perf)) return { written: false, kept: true, path };
  }
  writeAtomic(path, canonicalJsonLine(perf));
  return { written: true, kept: false, path };
}

/**
 * Write both exports: state.json first (the authoritative pass/fail set, so a run cut between the two files
 * never pairs a new perf with an older state), then perf.json. Each keeps a better file already on disk.
 */
export function writeExportPair(stateDir: string, state: StateFile, perf: PerfFile): { readonly state: ExportWrite; readonly perf: ExportWrite } {
  const stateWrite = writeStateExport(stateDir, state);
  const perfWrite = writePerfExport(stateDir, perf);
  return { state: stateWrite, perf: perfWrite };
}

/** Every workload name in state.json's perfTiers, for a reader that wants the table's keys. */
export const PERF_TIER_KEYS: readonly BenchWorkloadName[] = Object.freeze([...BENCH_WORKLOAD_NAMES]);
