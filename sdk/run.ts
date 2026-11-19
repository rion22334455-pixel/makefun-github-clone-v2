// github-core-clone-01's local conformance runner: the suite the sealed env runs, pointed at a server
// you started yourself. It imports only ./conformance/ (byte-for-byte copies of env/src, written by
// sdk/sync.sh), so the checks, the clients and the benchmark are the sealed ones, not a reimplementation.
//
//   node --experimental-strip-types sdk/run.ts --url http://127.0.0.1:8080 --token "$TOKEN" [--perf] [--json]
//
// It does what the env does, in the same order: GET /healthz once (the boot probe), then every check in
// the suite's registration order, one at a time, each with its own timeout, and finally the columns. With
// --perf it also runs the four benchmark workloads and adds their points; a reference that is not
// calibrated yet (T_ref 0) earns 0 points and the runner says so. --json prints the same facts as one JSON
// object instead of a table.
//
// This is a practice tool: it talks to your server over HTTP, spends nothing, and the checks build their
// data from wire.ts's one fixed seed. The final grade runs the same checks on fresh seeded data in the
// trial pod, so a green run here is evidence, not a guarantee.
//
// Exit status: 0 when /healthz answered (the run happened, whatever the checks said); 1 when it did not,
// or on a usage error. A failing check is reported in the table, never by the exit status.

import {
  AGENT_CHECKS,
  TOTAL_CHECKS,
  agentPoints,
  checkTimeoutMs,
  featurePoints,
  validateCheckSpecs,
  type CheckContext,
  type CheckResult,
  type CheckSpec,
} from './conformance/manifest.ts';
import { GIT_CHECKS } from './conformance/checks-git.ts';
import { restChecks, restProtocolChecks } from './conformance/checks-rest.ts';
import { GRAPHQL_CHECKS, configureGraphQLGit } from './conformance/checks-graphql.ts';
import { MCP_CHECKS } from './conformance/checks-mcp.ts';
import { runBenchmark } from './conformance/bench.ts';
import { CHECK_TIMEOUT_MS, buildScenario, type PerfFile, type Scenario } from './conformance/wire.ts';
import { createGitFixture } from './conformance/main.ts';

/** How long the runner's health probe may take. */
const HEALTHZ_TIMEOUT_MS = 5_000;
/** The drain after a check's timeout: the next check starts only once the abandoned one settles or this. */
const DRAIN_GRACE_MS = 1_000;
/** The longest detail the table prints (a detail is one line in the JSON). */
const TABLE_DETAIL_MAX = 140;

const USAGE = `usage: node --experimental-strip-types sdk/run.ts --url http://127.0.0.1:PORT --token TOK [--perf] [--json] [--timeout-ms N]

  --url URL         your server's origin (the suite dials this)
  --token TOK       the bearer token every check presents (MAKEFUN_SHOP_TOKEN in a trial)
  --perf            also run the four benchmark workloads and add their points
  --json            print the run as one JSON object instead of a table
  --timeout-ms N    the longest one check may take (default ${CHECK_TIMEOUT_MS}; the suite clamps to 5..15 s)`;

interface Options {
  readonly url: string;
  readonly token: string;
  readonly perf: boolean;
  readonly json: boolean;
  readonly timeoutMs: number;
}

interface Row {
  readonly id: string;
  readonly group: string;
  readonly title: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly ms: number;
}

function messageOf(err: unknown): string {
  return (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

function parseArgs(argv: readonly string[]): Options {
  let url = '';
  let token = '';
  let perf = false;
  let json = false;
  let timeoutMs = CHECK_TIMEOUT_MS;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url') {
      url = argv[++index] ?? '';
    } else if (arg === '--token') {
      token = argv[++index] ?? '';
    } else if (arg === '--perf') {
      perf = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--timeout-ms') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`--timeout-ms needs a positive number\n${USAGE}`);
      timeoutMs = value;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument ${JSON.stringify(arg)}\n${USAGE}`);
    }
  }
  if (url === '') throw new Error(`--url is required\n${USAGE}`);
  if (token === '') throw new Error(`--token is required\n${USAGE}`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`--url ${JSON.stringify(url)} is not a URL\n${USAGE}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`--url must be http or https, not ${parsed.protocol}\n${USAGE}`);
  }
  return { url: url.replace(/\/+$/, ''), token, perf, json, timeoutMs };
}

/** GET /healthz: null when it answered 200, else the reason the boot probe failed. */
async function probeHealthz(baseUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl}/healthz`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(HEALTHZ_TIMEOUT_MS) });
    await response.arrayBuffer().catch(() => undefined);
    return response.status === 200 ? null : `GET /healthz answered HTTP ${response.status}`;
  } catch (err) {
    return `GET /healthz failed (${messageOf(err)})`;
  }
}

/** The suite's checks, in the env's registration order (env/src/main.ts suiteChecks). */
function suiteChecks(): CheckSpec[] {
  return [...GIT_CHECKS, ...restChecks(), ...restProtocolChecks(), ...GRAPHQL_CHECKS, ...MCP_CHECKS];
}

function normalise(result: CheckResult): CheckResult {
  if (typeof result === 'object' && result !== null && typeof (result as { ok?: unknown }).ok === 'boolean') return result;
  return { ok: false, detail: 'the check returned no result' };
}

/** Run one check with its own timeout, sequential like the env, and report its row. */
async function runOne(spec: CheckSpec, baseUrl: string, token: string, scenario: Scenario, timeoutMs: number): Promise<Row> {
  const controller = new AbortController();
  const started = performance.now();
  const context: CheckContext = {
    baseUrl,
    token,
    scenario,
    signal: controller.signal,
    deadlineMs: performance.now() + timeoutMs,
    timeoutMs,
    log: (line: string) => process.stderr.write(`[${spec.id}] ${line}\n`),
  };
  let pending: Promise<CheckResult>;
  try {
    pending = Promise.resolve(spec.fn(context));
  } catch (err) {
    pending = Promise.reject(err);
  }
  const guarded = pending.then(normalise, (err: unknown): CheckResult => ({ ok: false, detail: `threw ${messageOf(err)}` }));
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<CheckResult>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve({ ok: false, detail: 'deadline' });
    }, Math.max(1, timeoutMs));
  });
  const result = await Promise.race([guarded, timeout]);
  if (timer !== undefined) clearTimeout(timer);
  if (timedOut) await Promise.race([guarded.then(() => undefined, () => undefined), sleep(DRAIN_GRACE_MS)]);
  return {
    id: spec.id,
    group: spec.group,
    title: spec.title,
    ok: result.ok,
    detail: result.detail ?? '',
    ms: Math.round(performance.now() - started),
  };
}

interface Columns {
  readonly registered: number;
  readonly manifestTotal: number;
  readonly passed: number;
  readonly mcpPassed: number;
  readonly feature: number;
  readonly agent: number;
  readonly perf: number;
  readonly score: number;
  readonly working: 0 | 1;
}

function columnsOf(rows: readonly Row[], perfPoints: number): Columns {
  const passed = rows.filter((row) => row.ok).length;
  const mcpPassed = rows.filter((row) => row.ok && row.group === 'mcp').length;
  const feature = featurePoints(passed, TOTAL_CHECKS);
  const agent = agentPoints(mcpPassed, AGENT_CHECKS);
  const perf = Number.isFinite(perfPoints) ? Math.max(0, Math.min(200, Math.round(perfPoints))) : 0;
  return {
    registered: rows.length,
    manifestTotal: TOTAL_CHECKS,
    passed,
    mcpPassed,
    feature,
    agent,
    perf,
    score: feature + agent + perf,
    working: passed > 0 ? 1 : 0,
  };
}

function printTable(rows: readonly Row[]): void {
  const idWidth = Math.max(8, Math.min(38, Math.max(...rows.map((row) => row.id.length))));
  process.stdout.write(`${'check'.padEnd(idWidth)}  ${'group'.padEnd(8)}  ${'result'.padEnd(6)}  detail\n`);
  for (const row of rows) {
    const detail = row.detail.replace(/\s+/g, ' ').trim().slice(0, TABLE_DETAIL_MAX);
    process.stdout.write(`${row.id.padEnd(idWidth)}  ${row.group.padEnd(8)}  ${(row.ok ? 'pass' : 'fail').padEnd(6)}  ${detail}\n`);
  }
}

function printColumns(columns: Columns, perfRan: boolean): void {
  process.stdout.write('\n');
  process.stdout.write(`checks: ${columns.registered} registered of the manifest's ${columns.manifestTotal}; ${columns.passed} passed, ${columns.registered - columns.passed} failed\n`);
  process.stdout.write(`feature ${columns.feature} (round(600 * ${columns.passed} / ${columns.manifestTotal}))\n`);
  process.stdout.write(`agent   ${columns.agent} (round(200 * ${columns.mcpPassed} / ${AGENT_CHECKS}), the mcp group)\n`);
  process.stdout.write(`perf    ${columns.perf}${perfRan ? ' (the four benchmark workloads)' : ' (not run: pass --perf)'}\n`);
  process.stdout.write(`score   ${columns.score} of 1000; working ${columns.working}\n`);
}

function printPerf(perf: PerfFile): void {
  process.stdout.write('\n');
  for (const workload of perf.workloads) {
    process.stdout.write(`benchmark ${workload.name}: p50 ${workload.p50_ms} ms, p99 ${workload.p99_ms} ms -> ${workload.points} point(s)${workload.error === undefined ? '' : ` (${workload.error})`}\n`);
  }
  process.stdout.write(`perf points_total ${perf.points_total} of 200; perf_p50_us ${perf.perf_p50_us}\n`);
  if (!perf.calibrated) {
    process.stdout.write('reference not calibrated in this build: T_ref is 0 for the workloads above, so each earns 0 points until the sealed reference’s times are measured on the production sandbox\n');
  }
}

async function main(): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${messageOf(err)}\n`);
    return 1;
  }
  const health = await probeHealthz(options.url);
  if (health !== null) {
    process.stderr.write(`${health} at ${options.url}: is your server running and serving GET /healthz?\n`);
    return 1;
  }
  const scenario = buildScenario();
  const specs = suiteChecks();
  const issues = validateCheckSpecs(specs);
  if (issues.length > 0) {
    for (const issue of issues) process.stderr.write(`manifest: ${issue}\n`);
  }
  configureGraphQLGit(
    createGitFixture({
      baseUrl: options.url,
      token: options.token,
      log: (line: string) => process.stderr.write(`${line}\n`),
    }),
  );
  if (!options.json) {
    process.stdout.write(`running ${specs.length} checks against ${options.url} (scenario seed ${scenario.seed})\n`);
  }
  const rows: Row[] = [];
  for (const spec of specs) {
    const timeoutMs = checkTimeoutMs(spec.timeoutMs, options.timeoutMs);
    rows.push(await runOne(spec, options.url, options.token, scenario, timeoutMs));
  }
  let perf: PerfFile | null = null;
  if (options.perf) {
    try {
      perf = await runBenchmark({
        baseUrl: options.url,
        token: options.token,
        log: (line: string) => process.stderr.write(`${line}\n`),
      });
    } catch (err) {
      process.stderr.write(`the benchmark threw (${messageOf(err)})\n`);
    }
  }
  const columns = columnsOf(rows, perf === null ? 0 : perf.points_total);
  if (options.json) {
    const byGroup: Record<string, { passed: number; total: number }> = {};
    for (const spec of specs) {
      const row = byGroup[spec.group] ?? { passed: 0, total: 0 };
      row.total += 1;
      if (rows.find((candidate) => candidate.id === spec.id)?.ok === true) row.passed += 1;
      byGroup[spec.group] = row;
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          url: options.url,
          healthz: true,
          scenario_seed: scenario.seed,
          manifest_issues: issues,
          counts: { registered: columns.registered, manifest_total: columns.manifestTotal, passed: columns.passed, mcp_passed: columns.mcpPassed, by_group: byGroup },
          checks: rows,
          columns: {
            feature: columns.feature,
            agent: columns.agent,
            perf: columns.perf,
            score: columns.score,
            working: columns.working,
          },
          perf,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    printTable(rows);
    printColumns(columns, perf !== null);
    if (perf !== null) printPerf(perf);
  }
  return 0;
}

const code = await main();
process.exit(code);
