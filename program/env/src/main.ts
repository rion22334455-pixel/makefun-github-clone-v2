// github-core-clone-01's env program: the sealed house server that grades one running forge.
//
// The entry (the entrant's GitHub-compatible server) starts beside this process, binds an ephemeral port
// and POSTs it to /register; from then on this process dials the address the register request came from.
// The entry long-polls GET /done until the suite is over and exits 0. The harness SIGTERMs this process
// afterwards, which writes (or keeps) the export the sealed scorer reads (wire.ts holds the whole
// contract; export.ts holds the export's bytes and the never-worse rule).
//
// THE PROGRAM, IN ORDER
//   1. listen on MAKEFUN_ENV_HOST (0.0.0.0 in a container, 127.0.0.1 under the process driver) at
//      MAKEFUN_ENV_PORT (8080 when unset, 0 picks a free port), with no SO_REUSEPORT (server/agent-env/
//      listen.ts's semantics). Write <state>/ready once bound: the harness waits for it before starting
//      the entry. Then confirm <state>/ready reads back (30 s) -- a runner that writes it first makes this
//      the start signal -- and wait for the entry's first register (wire.ts RegisterGate; boot budget).
//      <state>/calls.ndjson is written empty at start: the harness stores it as the pass's env log
//      (grader/agent.ts finishPass, ENV_LOG_FILE) and faults `env` on a pass without one. This env makes
//      no model calls, so the log stays empty; it never holds a fabricated one.
//   2. boot: the entry's GET /healthz answered twice within HEALTHZ_BUDGET_MS. No register before the
//      boot budget is a boot failure: every check 0, working 0, a fixed boot note, and /done true at once.
//   3. install the git fixture the GraphQL pull-request checks need (configureGraphQLGit, over a
//      GitClient bound to the entry: it creates the fixture repository through REST and pushes the
//      branch each pull request is opened from), then run every check of
//      [...GIT_CHECKS, ...restChecks(), ...restProtocolChecks(), ...GRAPHQL_CHECKS, ...MCP_CHECKS] in
//      registration order, one at a time, each with its own timeout and its own AbortSignal. A check
//      that times out is recorded 0 with the detail "deadline"; the rest still run. validateCheckSpecs
//      refuses a suite whose group counts are not the manifest's (git 30, repos 15, issues 15, pulls 20,
//      graphql 20, mcp 15, protocol 5): then no check runs and every registered id is 0.
//   4. the benchmark (four workloads, bench.ts), and the export.
//   5. /done answers {"done":true} as soon as the export is written. The process keeps serving until
//      SIGTERM (which rewrites the export only if it is not worse, and exits 0).
//
// DEADLINE DISCIPLINE. The internal deadline is the trial's wall budget less DEADLINE_MARGIN_MS
// (wire.ts deadlineOf; 900 s less 90 s by default, MAKEFUN_TRIAL_WALL_BUDGET_SEC overrides it for a local
// run). The conformance phase is also bounded by CONFORMANCE_BUDGET_MS and the benchmark by
// BENCHMARK_BUDGET_MS (wire.ts PHASE_BUDGET_MS). At the deadline the checks still pending are recorded 0
// with "deadline", the benchmark's remaining workloads are never started (bench.ts's own deadline does the
// same inside a workload), the export is written, /done is answered, and the process exits after a 5 s
// grace if the harness has not SIGTERMed it yet.
//
// WHAT NEVER ENTERS THE EXPORT: a time, a port or a random id. state.json's bytes depend only on the
// checks' pass bits (export.ts: the static perfTiers and the RULING that no measured timing reaches
// state.json); perf.json holds the timings. A SIGTERM at any point still writes an export, so a trial that
// dies mid-suite leaves a scorable one rather than none.
//
// This module imports only env/src modules and Node built-ins; scripts/competitions/build-agent-bundle.ts
// inlines all of it into env/server.mjs (from src/server/main.ts), and sdk/sync.sh copies these files into
// the kit's local runner.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  BENCHMARK_BUDGET_MS,
  BOOT_BUDGET_MS,
  BOOT_FAILED_NOTE,
  CONFORMANCE_BUDGET_MS,
  CONTAINER_HOST,
  DEFAULT_ENV_PORT,
  DEADLINE_MARGIN_MS,
  DONE_PATH,
  ENV_HOST_ENV,
  ENV_PORT_ENV,
  HEALTHZ_ATTEMPTS,
  HEALTHZ_BUDGET_MS,
  HEALTHZ_PATH,
  MAX_REGISTER_BODY_BYTES,
  PROCESS_DRIVER_HOST,
  REGISTER_BAD_REQUEST_STATUS,
  REGISTER_CONFLICT_STATUS,
  REGISTER_METHOD_STATUS,
  REGISTER_OK_STATUS,
  REGISTER_PATH,
  STATE_DIR_ENV,
  TOKEN_ENV,
  TRIAL_WALL_BUDGET_SEC,
  WireError,
  buildScenario,
  deadlineOf,
  doneComplete,
  doneWaiting,
  entryBase,
  isReadyFile,
  joinPath,
  joinUrl,
  parseRegisterRequest,
  readyBody,
  readyFilePath,
  registerAcceptedBody,
  registerConflictBody,
  stateDirOf,
  waitForReadyFile,
  waitForValue,
  RegisterGate,
  type CheckId,
  type Deadline,
  type EntryBase,
  type PerfFile,
  type Phase,
  type ReadyFile,
  type Scenario,
  type StateFile,
} from './wire.ts';
import {
  checkTimeoutMs,
  fail,
  validateCheckSpecs,
  type CheckContext,
  type CheckResult,
  type CheckSpec,
} from './manifest.ts';
import { GIT_CHECKS } from './checks-git.ts';
import { restChecks, restProtocolChecks } from './checks-rest.ts';
import { GRAPHQL_CHECKS, configureGraphQLGit, type GraphQLGitFixture, type GraphQLGitPush } from './checks-graphql.ts';
import { MCP_CHECKS } from './checks-mcp.ts';
import { failedPerfFile, runBenchmark } from './bench.ts';
import {
  CONFORMANCE_IDENTITY,
  GitClient,
  ZERO_OID,
  buildCommit,
  buildTree,
  hashObject,
  objectsToSend,
  parseCommit,
  parseTree,
  type GitObject,
  type GitObjectType,
  type TreeEntry,
} from './git-client.ts';
import { bootFailureExport, stateExportOf, writeExportPair, type CheckOutcome } from './export.ts';

// ---------------------------------------------------------------- constants

/** The variable that overrides the trial's wall budget for a local run (seconds); the wire constant wins. */
export const WALL_BUDGET_ENV = 'MAKEFUN_TRIAL_WALL_BUDGET_SEC';
/** How long the env waits for <state>/ready to read back before it treats the run as a boot failure. */
export const READY_WAIT_MS = 30_000;
/** How long the env keeps serving after the internal deadline wrote the export and answered /done. */
export const DEADLINE_EXIT_GRACE_MS = 5_000;
/** The longest a timed-out check's abandoned promise gets to settle before the next check starts. */
export const CHECK_DRAIN_GRACE_MS = 1_000;
/** The prefix every diagnostic line carries (the trial's env log). */
export const ENV_LOG_PREFIX = '[env] ';
/** The call log under the state directory: grader/agent.ts finishPass stores it, and a pass without it faults `env`. */
export const CALLS_LOG_FILE = 'calls.ndjson';
/** The fixed epoch a fixture commit carries (wire.ts SCENARIO_EPOCH_SEC): data, never a clock. */
export const FIXTURE_EPOCH_SEC = 1_735_689_600;
/** One git request the fixture makes may take this long (a correct entry answers in milliseconds). */
export const FIXTURE_REQUEST_TIMEOUT_MS = 4_000;
/** All the fixture work for one pushBranch call is bounded by this (inside a GraphQL check's timeout). */
export const FIXTURE_PUSH_BUDGET_MS = 12_000;

// ---------------------------------------------------------------- small utilities

/** A thrown value's line, flattened (a log line is one line). */
function messageOf(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.replace(/\s+/g, ' ').trim();
}

function realLog(line: string): void {
  process.stderr.write(`${ENV_LOG_PREFIX}${line}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

function roundMs(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0;
}

/** The wall budget the internal deadline derives from: the variable when it is a positive number. */
export function trialWallBudgetOf(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const text = env[WALL_BUDGET_ENV];
  const value = text === undefined || text === '' ? Number.NaN : Number(text);
  return Number.isFinite(value) && value > 0 ? value : TRIAL_WALL_BUDGET_SEC;
}

// ---------------------------------------------------------------- the listener

/** Where the env listens: the host as configured and the port (0 picks a free one). */
export interface ListenTarget {
  readonly host: string;
  readonly port: number;
}

/**
 * The host and port to bind, with server/agent-env/listen.ts's semantics: MAKEFUN_ENV_HOST when set; else
 * 127.0.0.1 under the process driver (MAKEFUN_STATE_DIR set) and 0.0.0.0 in a container. MAKEFUN_ENV_PORT
 * when set (0 picks a free port), else 8080. A port that is not digits 0..65535 throws WireError.
 */
export function listenTargetOf(
  env: Readonly<Record<string, string | undefined>> = process.env,
  override: { readonly host?: string; readonly port?: number } = {},
): ListenTarget {
  const stateDir = env[STATE_DIR_ENV];
  const processDriver = stateDir !== undefined && stateDir !== '';
  const host = override.host ?? (env[ENV_HOST_ENV] || (processDriver ? PROCESS_DRIVER_HOST : CONTAINER_HOST));
  const portText = override.port !== undefined ? String(override.port) : env[ENV_PORT_ENV] ?? String(DEFAULT_ENV_PORT);
  if (!/^\d{1,5}$/.test(portText) || Number(portText) > 65535) {
    throw new WireError(`${ENV_PORT_ENV} ${JSON.stringify(portText)} is not a port (0..65535, digits only)`);
  }
  return { host, port: Number(portText) };
}

/** The bound address the ready file names. */
export interface EnvAddress {
  readonly host: string;
  readonly port: number;
}

/** Bind `server` at `target`, reusePort false (no SO_REUSEPORT: a second listener is refused). */
export function bindServer(server: Server, target: ListenTarget): Promise<EnvAddress> {
  return new Promise<EnvAddress>((resolve, reject) => {
    const onError = (err: Error): void => reject(err);
    server.once('error', onError);
    server.listen({ port: target.port, host: target.host, reusePort: false }, () => {
      server.removeListener('error', onError);
      const bound = server.address();
      if (bound === null || typeof bound === 'string') {
        reject(new Error(`the env's listener on ${target.host}:${target.port} has no TCP address`));
        return;
      }
      resolve({ host: target.host, port: bound.port });
    });
  });
}

/** Write <state>/ready whole: the body wire.ts readyBody makes, then a rename. */
export function writeReadyFile(stateDir: string, address: EnvAddress): void {
  mkdirSync(stateDir, { recursive: true });
  const file = readyFilePath(stateDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(readyBody(address.host, address.port))}\n`, 'utf8');
  renameSync(tmp, file);
}

/** The ready file's parsed body, or null when it is absent or not this contract's. */
export function readReadyFile(stateDir: string): ReadyFile | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(readyFilePath(stateDir), 'utf8'));
    return isReadyFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the env's HTTP surface

/** What the env's server reads: the register gate and whether the export is written. */
export interface EnvServerOptions {
  readonly gate: RegisterGate;
  readonly isDone: () => boolean;
  readonly log: (line: string) => void;
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): void {
  const text = `${JSON.stringify(body)}\n`;
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(text),
      'cache-control': 'no-store',
      ...headers,
    });
    res.end(text);
  } catch {
    // The peer went away between the request and the answer; nothing to write to.
  }
}

function pathOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://env').pathname;
  } catch {
    return '/';
  }
}

/** Read a register body up to the contract's cap; null when the body is past it. */
async function readRegisterBody(req: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_REGISTER_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, options: EnvServerOptions): Promise<void> {
  const method = req.method ?? 'GET';
  const path = pathOf(req);

  if (path === REGISTER_PATH) {
    if (method !== 'POST') {
      sendJson(res, REGISTER_METHOD_STATUS, { ok: false, error: 'method_not_allowed', message: `${REGISTER_PATH} takes POST` });
      return;
    }
    const raw = await readRegisterBody(req);
    if (raw === null) {
      sendJson(res, REGISTER_BAD_REQUEST_STATUS, { ok: false, error: 'body_too_large', message: `a register body holds at most ${MAX_REGISTER_BODY_BYTES} bytes` });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      sendJson(res, REGISTER_BAD_REQUEST_STATUS, { ok: false, error: 'bad_json', message: 'the register body is not JSON' });
      return;
    }
    try {
      const register = parseRegisterRequest(body);
      const base = entryBase(req.socket.remoteAddress, register.port);
      if (options.gate.offer(base)) {
        options.log(`register: entry base ${base.url}`);
        sendJson(res, REGISTER_OK_STATUS, registerAcceptedBody());
      } else {
        sendJson(res, REGISTER_CONFLICT_STATUS, registerConflictBody());
      }
    } catch (err) {
      sendJson(res, REGISTER_BAD_REQUEST_STATUS, { ok: false, error: 'bad_request', message: messageOf(err) });
    }
    return;
  }

  if (path === DONE_PATH) {
    if (method !== 'GET') {
      sendJson(res, REGISTER_METHOD_STATUS, { ok: false, error: 'method_not_allowed', message: `${DONE_PATH} takes GET` });
      return;
    }
    // Answered at once, never held: the entry polls (wire.ts DONE_ANSWER_DEADLINE_MS).
    sendJson(res, 200, options.isDone() ? doneComplete() : doneWaiting());
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not_found', message: `no route ${method} ${path}` });
}

/** The env's server: POST /register, GET /done, a JSON 404 for anything else. It binds nothing yet. */
export function createEnvServer(options: EnvServerOptions): Server {
  const server = createServer((req, res) => {
    void handleRequest(req, res, options).catch((err: unknown) => {
      options.log(`a request failed: ${messageOf(err)}`);
      sendJson(res, 500, { ok: false, error: 'internal', message: 'the env failed to answer' });
    });
  });
  server.on('error', (err: Error) => {
    options.log(`the listener reported an error: ${messageOf(err)}`);
  });
  return server;
}

// ---------------------------------------------------------------- the GraphQL fixtures' git adapter

interface ObjectStore {
  readonly objects: Map<string, GitObject>;
}

/** Store one object and answer its id (the fixture's local object model). */
function putObject(store: ObjectStore, type: GitObjectType, data: Buffer): string {
  const oid = hashObject(type, data);
  if (!store.objects.has(oid)) store.objects.set(oid, { type, data });
  return oid;
}

function treeEntriesOf(store: ObjectStore, treeOid: string): TreeEntry[] {
  const tree = store.objects.get(treeOid);
  if (tree === undefined || tree.type !== 'tree') throw new WireError(`the fixture tree ${treeOid} is not in the client store`);
  return parseTree(tree.data);
}

/** The tree a parent commit holds, read from the store (fetching the commit's closure when absent). */
async function loadCommitTree(
  client: GitClient,
  store: ObjectStore,
  owner: string,
  repo: string,
  commitOid: string,
  signal: AbortSignal,
): Promise<TreeEntry[] | null> {
  if (!store.objects.has(commitOid)) {
    const fetched = await client.fetch(owner, repo, { wants: [commitOid], parse: true }, { signal });
    for (const [oid, object] of fetched.objects) if (!store.objects.has(oid)) store.objects.set(oid, object);
  }
  const commit = store.objects.get(commitOid);
  if (commit === undefined || commit.type !== 'commit') return null;
  const tree = store.objects.get(parseCommit(commit.data).tree);
  if (tree === undefined || tree.type !== 'tree') return null;
  return parseTree(tree.data);
}

/** The blob a tree holds at `segments`, or null when the path is absent. */
function findTreePath(store: ObjectStore, entries: readonly TreeEntry[], segments: readonly string[]): string | null {
  const head = segments[0];
  if (head === undefined) return null;
  const entry = entries.find((candidate) => candidate.name === head);
  if (entry === undefined) return null;
  if (segments.length === 1) return entry.mode === '40000' ? null : entry.oid;
  if (entry.mode !== '40000') return null;
  const child = store.objects.get(entry.oid);
  if (child === undefined || child.type !== 'tree') return null;
  return findTreePath(store, parseTree(child.data), segments.slice(1));
}

/** A tree with `segments` set to `blobOid`, every other entry kept: the fixture commit's tree. */
function buildTreeWithPath(store: ObjectStore, entries: readonly TreeEntry[], segments: readonly string[], blobOid: string): string {
  const head = segments[0];
  if (head === undefined || head === '' || head === '.' || head === '..') throw new WireError('the fixture file path has an unusable segment');
  const rest = segments.slice(1);
  const kept = entries.filter((entry) => entry.name !== head);
  if (rest.length === 0) {
    kept.push({ mode: '100644', name: head, oid: blobOid });
  } else {
    const existing = entries.find((entry) => entry.name === head && entry.mode === '40000');
    const childEntries = existing === undefined ? [] : treeEntriesOf(store, existing.oid);
    kept.push({ mode: '40000', name: head, oid: buildTreeWithPath(store, childEntries, rest, blobOid) });
  }
  return putObject(store, 'tree', buildTree(kept));
}

/** Whether the commit's tree already holds `content` at `path` (true, false, or null when unreadable). */
async function fixtureHoldsFile(
  client: GitClient,
  store: ObjectStore,
  owner: string,
  repo: string,
  commitOid: string,
  segments: readonly string[],
  content: string,
  signal: AbortSignal,
): Promise<boolean | null> {
  const entries = await loadCommitTree(client, store, owner, repo, commitOid, signal);
  if (entries === null) return null;
  const oid = findTreePath(store, entries, segments);
  if (oid === null) return false;
  const blob = store.objects.get(oid);
  return blob !== undefined && blob.type === 'blob' ? blob.data.toString('utf8') === content : false;
}

/** One pushBranch call: create the repo if needed, build the commit, push it, read the report. */
async function pushFixtureBranch(
  client: GitClient,
  store: ObjectStore,
  request: GraphQLGitPush,
  signal: AbortSignal,
  log: (line: string) => void,
): Promise<string | null> {
  const path = request.path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (path === '') return 'the fixture file path is empty';
  const segments = path.split('/');
  await client.createRepo(request.owner, request.repo, { signal });
  const prefixes = [`refs/heads/${request.branch}`];
  if (request.from !== undefined) prefixes.push(`refs/heads/${request.from}`);
  const listed = await client.lsRefs(request.owner, request.repo, { signal, prefixes });
  const branchTip = listed.refs.find((ref) => ref.name === `refs/heads/${request.branch}`)?.oid;
  let fromTip: string | undefined;
  if (request.from !== undefined) {
    fromTip = listed.refs.find((ref) => ref.name === `refs/heads/${request.from}`)?.oid;
    if (fromTip === undefined) return `the branch ${request.from} does not exist on ${request.owner}/${request.repo}`;
  }
  if (branchTip !== undefined) {
    const holds = await fixtureHoldsFile(client, store, request.owner, request.repo, branchTip, segments, request.content, signal);
    if (holds === true) {
      log(`git fixture: ${request.branch} already holds ${path}`);
      return null;
    }
    if (holds === null) return `the branch ${request.branch}'s tree could not be read`;
  }
  const parent = branchTip ?? fromTip ?? null;
  const parentEntries = parent === null ? [] : await loadCommitTree(client, store, request.owner, request.repo, parent, signal);
  if (parentEntries === null) return `the parent commit ${String(parent)} could not be read`;
  const blob = putObject(store, 'blob', Buffer.from(request.content, 'utf8'));
  const tree = buildTreeWithPath(store, parentEntries, segments, blob);
  const commit = putObject(
    store,
    'commit',
    buildCommit({
      tree,
      parents: parent === null ? [] : [parent],
      message: `${request.message}\n`,
      timestamp: FIXTURE_EPOCH_SEC,
      author: CONFORMANCE_IDENTITY,
      committer: CONFORMANCE_IDENTITY,
    }),
  );
  const advertisement = await client.advertisement(request.owner, request.repo, 'git-receive-pack', { signal });
  if (advertisement.protocol !== 0) return 'receive-pack advertised a non-v0 protocol';
  const serverTips = advertisement.refs.map((ref) => ref.oid).filter((oid) => oid !== ZERO_OID);
  const objects = objectsToSend((oid) => store.objects.get(oid), serverTips, [commit]);
  const pushed = await client.push(
    request.owner,
    request.repo,
    [{ oldOid: branchTip ?? ZERO_OID, newOid: commit, ref: `refs/heads/${request.branch}` }],
    { objects, signal },
  );
  if (pushed.report === null) return 'the server returned no report-status for the fixture push';
  if (!pushed.report.unpackOk) return `unpack failed: ${pushed.report.unpackDetail}`;
  const rejected = pushed.report.refs.find((ref) => !ref.ok);
  if (rejected !== undefined) return `${rejected.ref}: ${rejected.reason}`;
  log(`git fixture: pushed ${commit.slice(0, 12)} to refs/heads/${request.branch} (${path})`);
  return null;
}

/** What the fixture adapter needs: the entry's origin and token, the trial's abort and a log sink. */
export interface GitFixtureOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly signal?: AbortSignal;
  readonly log?: (line: string) => void;
  readonly timeoutMs?: number;
}

/**
 * The git adapter checks-graphql.ts's pull-request checks need: pushBranch builds one commit on `branch`
 * (rooted at `from`, or fast-forwarded from the branch's own tip on a re-run), with `path` set to
 * `content`, and pushes it over the suite's smart-HTTP client. It answers null on success or a
 * human-readable failure detail, never a throw (GraphQLGitFixture's contract).
 */
export function createGitFixture(options: GitFixtureOptions): GraphQLGitFixture {
  const client = new GitClient({
    baseUrl: options.baseUrl,
    token: options.token,
    timeoutMs: options.timeoutMs ?? FIXTURE_REQUEST_TIMEOUT_MS,
    signal: options.signal,
  });
  const store: ObjectStore = { objects: new Map() };
  const log = options.log ?? ((): void => undefined);
  return {
    async pushBranch(request: GraphQLGitPush): Promise<string | null> {
      const budget = AbortSignal.timeout(FIXTURE_PUSH_BUDGET_MS);
      const signal = options.signal === undefined ? budget : AbortSignal.any([options.signal, budget]);
      try {
        return await pushFixtureBranch(client, store, request, signal, log);
      } catch (err) {
        return `threw ${messageOf(err)}`;
      }
    },
  };
}

// ---------------------------------------------------------------- one check

/** Run one check with its timeout; a timeout aborts its signal and resolves 0 with "deadline". */
async function runCheck(
  spec: CheckSpec,
  context: CheckContext,
  timeoutMs: number,
  controller: AbortController,
  drainMs: number,
): Promise<CheckResult> {
  let started: Promise<CheckResult>;
  try {
    started = Promise.resolve(spec.fn(context));
  } catch (err) {
    started = Promise.reject(err);
  }
  const guarded = started.then(
    (result: CheckResult): CheckResult =>
      typeof result === 'object' && result !== null && typeof (result as { ok?: unknown }).ok === 'boolean' ? result : fail('the check returned no result'),
    (err: unknown): CheckResult => fail(`threw ${messageOf(err)}`),
  );
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<CheckResult>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve(fail('deadline'));
    }, Math.max(1, timeoutMs));
  });
  const result = await Promise.race([guarded, timeout]);
  if (timer !== undefined) clearTimeout(timer);
  if (timedOut && drainMs > 0) {
    // One check in flight at a time: a timed-out check gets a bounded moment to settle after its abort.
    await Promise.race([guarded.then(() => undefined, () => undefined), sleep(drainMs)]);
  }
  return result;
}

// ---------------------------------------------------------------- the run

interface RunState {
  readonly gate: RegisterGate;
  readonly specs: readonly CheckSpec[];
  readonly stateDir: string;
  readonly token: string;
  readonly scenario: Scenario;
  readonly deadline: Deadline;
  readonly now: () => number;
  readonly log: (line: string) => void;
  readonly trial: AbortController;
  readonly results: Record<CheckId, CheckOutcome>;
  readonly phaseMs: Record<Phase, number>;
  bootOk: boolean;
  registered: boolean;
  deadlineFallen: boolean;
  entry: EntryBase | null;
  perf: PerfFile | null;
}

/** Everything one run reports at its end (the handle's `done`). */
export interface SuiteOutcome {
  readonly state: StateFile;
  readonly perf: PerfFile;
  readonly bootOk: boolean;
  readonly registered: boolean;
  readonly working: 0 | 1;
  readonly passed: number;
  readonly total: number;
  readonly deadlineFallen: boolean;
  readonly aborted: boolean;
  readonly phaseMs: Readonly<Record<Phase, number>>;
  readonly durationMs: number;
}

/** The suite's checks, in the settled registration order (the WIRING of #14). */
export function suiteChecks(): CheckSpec[] {
  return [...GIT_CHECKS, ...restChecks(), ...restProtocolChecks(), ...GRAPHQL_CHECKS, ...MCP_CHECKS];
}

/** The boot phase: wait for the first register, then GET /healthz twice. */
async function runBoot(state: RunState): Promise<boolean> {
  const limit = Math.min(BOOT_BUDGET_MS, Math.max(0, state.deadline.deadlineMs - state.now()));
  try {
    await waitForValue(() => state.gate.entry, {
      timeoutMs: limit,
      signal: state.trial.signal,
      now: state.now,
    });
  } catch (err) {
    state.log(`boot: no register inside ${Math.round(limit)} ms (${messageOf(err)})`);
    return false;
  }
  const entry = state.gate.entry;
  if (entry === null) return false;
  state.entry = entry;
  state.registered = true;
  state.log(`boot: the entry registered at ${entry.url}`);
  const healthBudget = Math.min(HEALTHZ_BUDGET_MS, Math.max(0, state.deadline.deadlineMs - state.now()));
  const healthEnd = state.now() + healthBudget;
  let answered = 0;
  for (let attempt = 1; attempt <= HEALTHZ_ATTEMPTS; attempt += 1) {
    const left = Math.floor(healthEnd - state.now());
    if (left <= 0 || state.trial.signal.aborted) break;
    try {
      const response = await fetch(joinUrl(entry.url, HEALTHZ_PATH), {
        method: 'GET',
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.any([state.trial.signal, AbortSignal.timeout(Math.max(1, left))]),
      });
      await response.arrayBuffer().catch(() => undefined);
      if (response.status === 200) answered += 1;
      else state.log(`boot: GET ${HEALTHZ_PATH} ${attempt}/${HEALTHZ_ATTEMPTS} answered HTTP ${response.status}`);
    } catch (err) {
      state.log(`boot: GET ${HEALTHZ_PATH} ${attempt}/${HEALTHZ_ATTEMPTS} failed (${messageOf(err)})`);
    }
  }
  state.log(`boot: ${HEALTHZ_PATH} answered ${answered}/${HEALTHZ_ATTEMPTS} times in ${Math.round(healthBudget)} ms`);
  return answered === HEALTHZ_ATTEMPTS;
}

/** Install the git adapter the GraphQL pull-request checks use; null (and a log line) when it cannot be. */
function installGitFixture(state: RunState): void {
  const entry = state.entry;
  if (entry === null) {
    configureGraphQLGit(null);
    return;
  }
  try {
    configureGraphQLGit(createGitFixture({ baseUrl: entry.url, token: state.token, signal: state.trial.signal, log: state.log }));
    state.log('graphql: the git fixture is installed over the suite\'s git client');
  } catch (err) {
    configureGraphQLGit(null);
    state.log(`graphql: the git fixture could not be installed (${messageOf(err)})`);
  }
}

/** The conformance phase: every check, one at a time, each with its own timeout, never overlapping. */
async function runConformance(state: RunState): Promise<void> {
  const issues = validateCheckSpecs(state.specs);
  for (const issue of issues) state.log(`manifest: ${issue}`);
  if (issues.length > 0) {
    // The suite is short of the manifest (a check module mid-build): the export pads every missing declared
    // check with a 0 id (export.ts exportCheckIds), so the denominator stays the manifest's and the checks
    // that do exist still score. A complete suite logs nothing here.
    state.log(`manifest: ${issues.length} issue(s); the suite runs anyway and the unregistered ids export 0`);
  }
  const entry = state.entry;
  if (entry === null) return;
  const phaseEnd = Math.min(state.deadline.deadlineMs, state.now() + CONFORMANCE_BUDGET_MS);
  for (const spec of state.specs) {
    const nowMs = state.now();
    const phaseLeft = Math.min(phaseEnd, state.deadline.deadlineMs) - nowMs;
    if (state.trial.signal.aborted || phaseLeft <= 0) {
      state.results[spec.id] = { ok: false, detail: 'deadline' };
      if (nowMs >= state.deadline.deadlineMs) state.deadlineFallen = true;
      continue;
    }
    const timeoutMs = checkTimeoutMs(spec.timeoutMs, phaseLeft);
    if (timeoutMs <= 0) {
      state.results[spec.id] = { ok: false, detail: 'deadline' };
      continue;
    }
    const controller = new AbortController();
    const onTrialAbort = (): void => controller.abort();
    state.trial.signal.addEventListener('abort', onTrialAbort, { once: true });
    if (state.trial.signal.aborted) controller.abort();
    const context: CheckContext = {
      baseUrl: entry.url,
      token: state.token,
      scenario: state.scenario,
      signal: controller.signal,
      deadlineMs: state.now() + timeoutMs,
      timeoutMs,
      log: (line: string) => state.log(`${spec.id}: ${line}`),
    };
    let result: CheckResult;
    try {
      // The deadline lets go of an abandoned check at once; before it, a bounded drain keeps one in flight.
      const drainMs = state.now() >= state.deadline.deadlineMs ? 0 : CHECK_DRAIN_GRACE_MS;
      result = await runCheck(spec, context, timeoutMs, controller, drainMs);
    } finally {
      state.trial.signal.removeEventListener('abort', onTrialAbort);
    }
    const detail = result.ok ? result.detail : result.detail ?? 'failed';
    state.results[spec.id] = result.ok ? { ok: true, detail } : { ok: false, detail };
    state.log(`${spec.id} ${result.ok ? 'pass' : 'fail'}${detail === undefined ? '' : ` — ${detail}`}`);
    if (state.now() >= state.deadline.deadlineMs) state.deadlineFallen = true;
  }
}

/** The benchmark phase: bench.ts's four workloads, bounded by the phase budget and the deadline. */
async function runBenchmarkPhase(state: RunState): Promise<PerfFile> {
  const entry = state.entry;
  if (entry === null) return failedPerfFile(BOOT_FAILED_NOTE);
  if (state.trial.signal.aborted) return failedPerfFile('the trial was aborted before the benchmark ran');
  const nowMs = state.now();
  if (nowMs >= state.deadline.deadlineMs) {
    state.deadlineFallen = true;
    return failedPerfFile('the internal deadline fell before the benchmark ran');
  }
  const phaseEnd = Math.min(state.deadline.deadlineMs, nowMs + BENCHMARK_BUDGET_MS);
  try {
    return await runBenchmark({
      baseUrl: entry.url,
      token: state.token,
      signal: state.trial.signal,
      deadlineMs: phaseEnd,
      now: state.now,
      log: (line: string) => state.log(line),
    });
  } catch (err) {
    state.log(`the benchmark threw (${messageOf(err)})`);
    return failedPerfFile(`the benchmark threw: ${messageOf(err)}`);
  }
}

/**
 * Write the export from whatever the run has, and answer the run's outcome. Called once per run, on the
 * normal path and on a throw alike; the perf file is bench.ts's measured one, or the sentinel file a run
 * that never benchmarked writes (never wire.ts emptyPerfFile's 0: a 0 would sort first on the tie-break).
 */
function finishSuite(state: RunState, startedAt: number): SuiteOutcome {
  const exportStart = state.now();
  const registered = state.registered || state.gate.registered;
  const perf = state.perf ?? failedPerfFile(registered ? (state.trial.signal.aborted ? 'the trial was aborted before the benchmark finished' : 'the benchmark did not run') : BOOT_FAILED_NOTE);
  const stateFile = stateExportOf({
    checkIds: state.specs.map((spec) => spec.id),
    results: state.results,
    bootOk: state.bootOk,
    notes: registered ? [] : [BOOT_FAILED_NOTE],
  });
  try {
    writeExportPair(state.stateDir, stateFile, perf);
    state.log(`export: state.json (${stateFile.counts.passed}/${stateFile.counts.total} passed, working ${stateFile.working}) and perf.json (${perf.points_total} points) written`);
  } catch (err) {
    state.log(`export: the export could not be written (${messageOf(err)})`);
  }
  state.phaseMs.export = roundMs(state.now() - exportStart);
  state.log(
    `phases: boot ${state.phaseMs.boot} ms, conformance ${state.phaseMs.conformance} ms, benchmark ${state.phaseMs.benchmark} ms, export ${state.phaseMs.export} ms`,
  );
  return {
    state: stateFile,
    perf,
    bootOk: state.bootOk,
    registered,
    working: stateFile.working,
    passed: stateFile.counts.passed,
    total: stateFile.counts.total,
    deadlineFallen: state.deadlineFallen,
    aborted: state.trial.signal.aborted,
    phaseMs: { ...state.phaseMs },
    durationMs: roundMs(state.now() - startedAt),
  };
}

/** The phases in order: ready, boot, conformance, benchmark, export (finishSuite always runs). */
async function runSuite(state: RunState): Promise<SuiteOutcome> {
  const startedAt = state.now();
  try {
    const bootStart = state.now();
    try {
      await waitForReadyFile(() => readReadyFile(state.stateDir), {
        timeoutMs: READY_WAIT_MS,
        signal: state.trial.signal,
        now: state.now,
      });
    } catch (err) {
      state.log(`ready: ${readyFilePath(state.stateDir)} did not read back (${messageOf(err)})`);
      return finishSuite(state, startedAt);
    }
    state.bootOk = await runBoot(state);
    state.phaseMs.boot = roundMs(state.now() - bootStart);
    if (!state.registered) {
      state.log('boot: no entry registered before the boot deadline');
      return finishSuite(state, startedAt);
    }
    if (state.trial.signal.aborted) return finishSuite(state, startedAt);
    installGitFixture(state);
    const conformanceStart = state.now();
    await runConformance(state);
    state.phaseMs.conformance = roundMs(state.now() - conformanceStart);
    if (state.trial.signal.aborted) return finishSuite(state, startedAt);
    const benchmarkStart = state.now();
    state.perf = await runBenchmarkPhase(state);
    state.phaseMs.benchmark = roundMs(state.now() - benchmarkStart);
  } catch (err) {
    state.log(`suite: stopped by ${messageOf(err)}`);
  }
  return finishSuite(state, startedAt);
}

// ---------------------------------------------------------------- the handle

/** What startEnv accepts; every field has a settled default from wire.ts. */
export interface EnvOptions {
  /** The environment to read (default process.env; a test passes a map). */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** MAKEFUN_STATE_DIR's value (default wire.ts stateDirOf(env)). */
  readonly stateDir?: string;
  /** MAKEFUN_ENV_HOST's value (default the listen.ts semantics). */
  readonly host?: string;
  /** MAKEFUN_ENV_PORT's value (default 8080; 0 picks a free port). */
  readonly port?: number;
  /** The trial's wall budget, seconds (default wire.ts TRIAL_WALL_BUDGET_SEC or MAKEFUN_TRIAL_WALL_BUDGET_SEC). */
  readonly wallBudgetSec?: number;
  /** The suite's checks (default suiteChecks(); a test passes a short list). */
  readonly checks?: readonly CheckSpec[];
  /** The monotonic clock (default performance.now; the deadline is on this clock). */
  readonly now?: () => number;
  /** The diagnostic sink (default stderr with ENV_LOG_PREFIX). */
  readonly log?: (line: string) => void;
  /** How long to keep serving after the internal deadline (default DEADLINE_EXIT_GRACE_MS). */
  readonly exitGraceMs?: number;
}

/** A running env: its listener, its deadline, the suite's outcome and one idempotent stop. */
export interface EnvHandle {
  readonly server: Server;
  readonly address: EnvAddress;
  readonly stateDir: string;
  readonly deadline: Deadline;
  /** Resolves once the suite wrote its export (on the normal path or after a throw). */
  readonly done: Promise<SuiteOutcome>;
  /** Abort, write the export, close the listener; resolves 0. Idempotent. */
  stop(reason?: string): Promise<number>;
  /** Resolves once stopped (the deadline's grace included). */
  readonly stopped: Promise<number>;
}

/** Start the env: bind, write ready, serve /register and /done, run the phases in the background. */
export async function startEnv(options: EnvOptions = {}): Promise<EnvHandle> {
  const env = options.env ?? process.env;
  const stateDir = options.stateDir ?? stateDirOf(env);
  const now = options.now ?? ((): number => performance.now());
  const log = options.log ?? realLog;
  const startedAt = now();
  const wallBudgetSec = options.wallBudgetSec ?? trialWallBudgetOf(env);
  const deadline = deadlineOf(startedAt, wallBudgetSec);
  const token = env[TOKEN_ENV] ?? '';
  const specs = options.checks === undefined ? suiteChecks() : [...options.checks];
  const gate = new RegisterGate();
  const trial = new AbortController();
  const results: Record<CheckId, CheckOutcome> = {};
  const phaseMs: Record<Phase, number> = { boot: 0, conformance: 0, benchmark: 0, export: 0 };
  let done = false;
  const isDone = (): boolean => done;
  const server = createEnvServer({ gate, isDone, log });
  const target = listenTargetOf(env, { host: options.host, port: options.port });
  const address = await bindServer(server, target);
  mkdirSync(stateDir, { recursive: true });
  // The pass's call log (grader/agent.ts ENV_LOG_FILE): finishPass faults `env` when a pass wrote none, and
  // this env makes no model calls, so it writes the empty log the harness stores and never a fabricated line.
  writeFileSync(joinPath(stateDir, CALLS_LOG_FILE), '');
  writeReadyFile(stateDir, address);
  log(`listening on ${address.host}:${address.port}, state ${stateDir}`);
  log(`internal deadline in ${Math.round(deadline.deadlineMs - startedAt)} ms (wall budget ${wallBudgetSec} s less ${DEADLINE_MARGIN_MS} ms)`);

  const state: RunState = {
    gate,
    specs,
    stateDir,
    token,
    scenario: buildScenario(),
    deadline,
    now,
    log,
    trial,
    results,
    phaseMs,
    bootOk: false,
    registered: false,
    deadlineFallen: false,
    entry: null,
    perf: null,
  };

  let resolveStopped: (code: number) => void = () => undefined;
  const stopped = new Promise<number>((resolve) => {
    resolveStopped = resolve;
  });
  let stopping: Promise<number> | null = null;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;

  const stop = (reason?: string): Promise<number> => {
    if (stopping !== null) return stopping;
    stopping = (async (): Promise<number> => {
      if (reason !== undefined) log(`stopping: ${reason}`);
      trial.abort();
      if (exitTimer !== undefined) clearTimeout(exitTimer);
      const registered = state.registered || state.gate.registered;
      const perf = state.perf ?? failedPerfFile(registered ? 'the trial was aborted before the benchmark finished' : BOOT_FAILED_NOTE);
      const stateFile = stateExportOf({
        checkIds: state.specs.map((spec) => spec.id),
        results: state.results,
        bootOk: state.bootOk,
        notes: registered ? [] : [BOOT_FAILED_NOTE],
      });
      try {
        const written = writeExportPair(state.stateDir, stateFile, perf);
        log(`export on stop: state.json ${written.state.written ? 'written' : 'kept'}, perf.json ${written.perf.written ? 'written' : 'kept'}`);
      } catch (err) {
        log(`export on stop: could not be written (${messageOf(err)})`);
      }
      done = true;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections();
        server.closeAllConnections();
      });
      resolveStopped(0);
      return 0;
    })();
    return stopping;
  };

  const donePromise = runSuite(state)
    .catch((err: unknown): SuiteOutcome => {
      log(`suite: threw ${messageOf(err)}`);
      return finishSuite(state, startedAt);
    })
    .then((outcome) => {
      done = true;
      if (outcome.deadlineFallen && stopping === null) {
        log(`the internal deadline fell: exported; exiting ${options.exitGraceMs ?? DEADLINE_EXIT_GRACE_MS} ms after /done`);
        exitTimer = setTimeout(() => {
          void stop('the internal deadline');
        }, options.exitGraceMs ?? DEADLINE_EXIT_GRACE_MS);
      }
      return outcome;
    });

  return {
    server,
    address,
    stateDir,
    deadline,
    done: donePromise,
    stop,
    stopped,
  };
}

/**
 * Start the env, install SIGTERM/SIGINT handlers for the whole life (a signal before the listener is
 * ready writes the boot-failure export), and wait for one of them (or the deadline's grace exit).
 */
export async function runEnv(options: EnvOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const stateDir = options.stateDir ?? stateDirOf(env);
  const log = options.log ?? realLog;
  let handle: EnvHandle | null = null;
  const onSignal = (signal: string): void => {
    if (handle !== null) {
      void handle.stop(signal);
      return;
    }
    log(`stopping: ${signal} before the listener was ready`);
    try {
      writeBootFailure(stateDir, suiteChecks().map((spec) => spec.id));
    } catch (err) {
      log(`the boot-failure export could not be written: ${messageOf(err)}`);
    }
    process.exit(0);
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
  try {
    handle = await startEnv({ ...options, env, stateDir, log });
    return await handle.stopped;
  } finally {
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGINT', onSignal);
  }
}

/** The export a run that never started (a fatal error) writes: already-better files on disk are kept. */
function writeBootFailure(stateDir: string, checkIds: readonly CheckId[]): void {
  writeExportPair(stateDir, bootFailureExport(checkIds), failedPerfFile(BOOT_FAILED_NOTE));
}

/**
 * The program: run the env, and never crash without an export. A throw before or during the run writes
 * the boot-failure export (kept only where no better one is on disk) and exits 1; a signal writes the
 * export and exits 0.
 */
export async function main(env: Readonly<Record<string, string | undefined>> = process.env): Promise<number> {
  const stateDir = stateDirOf(env);
  const log = realLog;
  const checkIds = (): CheckId[] => suiteChecks().map((spec) => spec.id);
  const fatal = (label: string, err: unknown): void => {
    log(`${label}: ${messageOf(err)}`);
    try {
      writeBootFailure(stateDir, checkIds());
    } catch (writeErr) {
      log(`the boot-failure export could not be written: ${messageOf(writeErr)}`);
    }
  };
  process.on('uncaughtException', (err: Error) => {
    fatal('uncaught exception', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    fatal('unhandled rejection', reason);
    process.exit(1);
  });
  try {
    return await runEnv({ env, log });
  } catch (err) {
    fatal('fatal', err);
    return 1;
  }
}
