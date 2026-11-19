// scorer/score.mjs: built by scripts/competitions/build-agent-bundle.ts from src/scorer/main.ts with esbuild 0.28.2. Do not edit: rebuild it.
import { createRequire as __agentBundleCreateRequire } from 'node:module';
const require = __agentBundleCreateRequire(import.meta.url);

// src/scorer/main.ts
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// scorer/columns.ts
var STATE_FILE = "state.json";
var PERF_FILE = "perf.json";
var SCORES_FILE = "scores.json";
var EXPORT_VERSION = 1;
var PERF_VERSION = 1;
var FEATURE_POINTS = 600;
var AGENT_POINTS = 200;
var PERF_POINTS = 200;
var MAX_SCORE = FEATURE_POINTS + AGENT_POINTS + PERF_POINTS;
var AGENT_MAX_POINTS = 1e9;
function zeroScores() {
  return { score: 0, feature: 0, agent: 0, perf: 0, perf_p50_us: 0, working: 0 };
}

// scorer/score.ts
var ExportFault = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ExportFault";
  }
};
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function integerIn(v, min, max, what) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) {
    throw new ExportFault(`${what} is ${JSON.stringify(v)}, not an integer ${min}..${max}`);
  }
  return v;
}
function parseJson(text, name) {
  try {
    return JSON.parse(text);
  } catch {
    throw new ExportFault(`${name} is not JSON`);
  }
}
function share(points, passed, total) {
  if (total <= 0) return 0;
  const n = passed < 0 ? 0 : passed > total ? total : passed;
  return Math.round(points * n / total);
}
function readState(text) {
  const notes = [];
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
  if (byGroup === void 0) notes.push(`${STATE_FILE} counts has no byGroup: the agent arm scores 0`);
  else if (!isRecord(byGroup)) throw new ExportFault(`${STATE_FILE} counts.byGroup is not an object`);
  else if (byGroup.mcp === void 0) notes.push(`${STATE_FILE} counts.byGroup has no mcp group: the agent arm scores 0`);
  else {
    const mcp = byGroup.mcp;
    if (!isRecord(mcp)) throw new ExportFault(`${STATE_FILE} counts.byGroup.mcp is not an object`);
    agentTotal = integerIn(mcp.total, 0, Number.MAX_SAFE_INTEGER, `${STATE_FILE} counts.byGroup.mcp.total`);
    agentPassed = integerIn(mcp.passed, 0, Number.MAX_SAFE_INTEGER, `${STATE_FILE} counts.byGroup.mcp.passed`);
    if (agentPassed > agentTotal) throw new ExportFault(`${STATE_FILE} counts.byGroup.mcp.passed ${agentPassed} is past its total ${agentTotal}`);
  }
  const working = raw.working;
  if (working !== 0 && working !== 1) throw new ExportFault(`${STATE_FILE} working is ${JSON.stringify(working)}, not 0 or 1`);
  if (Array.isArray(raw.notes)) {
    for (const note of raw.notes) if (typeof note === "string" && note !== "") notes.push(`${STATE_FILE} note: ${note}`);
  }
  return { facts: { total, passed, agentTotal, agentPassed, working: working === 1 }, notes };
}
function readPerf(text) {
  const raw = parseJson(text, PERF_FILE);
  if (!isRecord(raw)) throw new ExportFault(`${PERF_FILE} is not a JSON object`);
  if (raw.version !== PERF_VERSION) throw new ExportFault(`${PERF_FILE} version ${JSON.stringify(raw.version)} is not ${PERF_VERSION}`);
  const points = integerIn(raw.points_total, 0, PERF_POINTS, `${PERF_FILE} points_total`);
  const p50Us = integerIn(raw.perf_p50_us, 0, AGENT_MAX_POINTS, `${PERF_FILE} perf_p50_us`);
  return { points, p50Us };
}
function scoreExport(stateText, perfText) {
  const notes = [];
  try {
    if (stateText === null) throw new ExportFault(`${STATE_FILE} is missing`);
    if (perfText === null) throw new ExportFault(`${PERF_FILE} is missing`);
    const state = readState(stateText);
    const perf = readPerf(perfText);
    const feature = share(FEATURE_POINTS, state.facts.passed, state.facts.total);
    const agent = share(AGENT_POINTS, state.facts.agentPassed, state.facts.agentTotal);
    const scores = {
      score: feature + agent + perf.points,
      feature,
      agent,
      perf: perf.points,
      perf_p50_us: perf.p50Us,
      working: state.facts.working && state.facts.passed > 0 ? 1 : 0
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

// src/scorer/main.ts
var DEFAULT_EXPORT_DIR = "/output";
var ENV_EXPORT_DIR = "/state/export";
var DEFAULT_SCORES_DIR = "/scores";
function exportDirOf(env) {
  const explicit = env.MAKEFUN_EXPORT_DIR ?? env.MAKEFUN_OUTPUT_DIR;
  if (explicit !== void 0 && explicit !== "") return explicit;
  try {
    if (statSync(DEFAULT_EXPORT_DIR).isDirectory()) return DEFAULT_EXPORT_DIR;
  } catch {
  }
  return ENV_EXPORT_DIR;
}
function readExport(dir, name) {
  try {
    return readFileSync(join(dir, name), "utf8");
  } catch {
    return null;
  }
}
try {
  const exportDir = exportDirOf(process.env);
  const scored = scoreExport(readExport(exportDir, STATE_FILE), readExport(exportDir, PERF_FILE));
  const scoresDir = process.env.MAKEFUN_SCORES_DIR ?? DEFAULT_SCORES_DIR;
  mkdirSync(scoresDir, { recursive: true });
  writeFileSync(join(scoresDir, SCORES_FILE), `${JSON.stringify(scored.scores)}
`);
  for (const note of scored.notes) process.stderr.write(`[scorer] note: ${note}
`);
  const s = scored.scores;
  process.stdout.write(
    `[scorer] score ${s.score}/${MAX_SCORE}: feature ${s.feature} + agent ${s.agent} + perf ${s.perf}; perf_p50_us ${s.perf_p50_us}, working ${s.working}
`
  );
} catch (err) {
  process.stderr.write(`[scorer] ${err instanceof Error ? err.message : String(err)}
`);
  process.exitCode = 1;
}
