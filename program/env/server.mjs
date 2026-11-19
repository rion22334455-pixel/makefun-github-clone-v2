// env/server.mjs: built by scripts/competitions/build-agent-bundle.ts from src/server/main.ts with esbuild 0.28.2. Do not edit: rebuild it.
import { createRequire as __agentBundleCreateRequire } from 'node:module';
const require = __agentBundleCreateRequire(import.meta.url);

// env/src/main.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2, renameSync as renameSync2, writeFileSync } from "node:fs";
import { createServer } from "node:http";

// env/src/wire.ts
var WireError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "WireError";
  }
};
var WireTimeoutError = class extends WireError {
  constructor(message) {
    super(message);
    this.name = "WireTimeoutError";
  }
};
var WireAbortError = class extends WireError {
  constructor(message) {
    super(message);
    this.name = "WireAbortError";
  }
};
var STATE_DIR_ENV = "MAKEFUN_STATE_DIR";
var ENV_HOST_ENV = "MAKEFUN_ENV_HOST";
var ENV_PORT_ENV = "MAKEFUN_ENV_PORT";
var TOKEN_ENV = "MAKEFUN_SHOP_TOKEN";
var DEFAULT_ENV_PORT = 8080;
var CONTAINER_HOST = "0.0.0.0";
var PROCESS_DRIVER_HOST = "127.0.0.1";
var CONTAINER_STATE_DIR = "/state";
function stateDirOf(env) {
  const dir = env[STATE_DIR_ENV];
  return dir !== void 0 && dir !== "" ? dir : CONTAINER_STATE_DIR;
}
var REGISTER_PATH = "/register";
var DONE_PATH = "/done";
var HEALTHZ_PATH = "/healthz";
var READY_FILE = "ready";
var READY_SCHEMA = "github-core-clone-01/ready/v1";
var EXPORT_DIR = "export";
var STATE_FILE = "state.json";
var PERF_FILE = "perf.json";
var STATE_VERSION = 1;
var PERF_VERSION = 1;
var MIN_PORT = 1;
var MAX_PORT = 65535;
var MAX_REGISTER_BODY_BYTES = 65536;
function isPort(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_PORT && value <= MAX_PORT;
}
function parseRegisterRequest(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new WireError("the register body is not a JSON object");
  const port = value.port;
  if (!isPort(port)) throw new WireError(`the register body's port is not an integer 1..${MAX_PORT}: ${JSON.stringify(port)}`);
  return { port };
}
function normalizeRemoteAddress(address) {
  if (address === void 0 || address === "") throw new WireError("the register request has no peer address");
  let host = address.trim();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  const zone = host.indexOf("%");
  if (zone >= 0) host = host.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
  if (mapped !== null) host = mapped[1] ?? host;
  if (host === "") throw new WireError("the register request has no peer address");
  return host;
}
function formatHost(host) {
  if (host === "") throw new WireError("a base URL needs a host");
  return host.includes(":") && !(host.startsWith("[") && host.endsWith("]")) ? `[${host}]` : host;
}
function entryBase(remoteAddress, port) {
  if (!isPort(port)) throw new WireError(`the register port is not an integer 1..${MAX_PORT}: ${JSON.stringify(port)}`);
  const host = normalizeRemoteAddress(remoteAddress);
  return Object.freeze({ host, port, url: `http://${formatHost(host)}:${port}` });
}
function joinUrl(baseUrl, path) {
  const origin = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${suffix}`;
}
var REGISTER_OK_STATUS = 200;
var REGISTER_CONFLICT_STATUS = 409;
var REGISTER_BAD_REQUEST_STATUS = 400;
var REGISTER_METHOD_STATUS = 405;
function registerAcceptedBody() {
  return { ok: true };
}
function registerConflictBody() {
  return { ok: false, error: "already_registered" };
}
function doneWaiting() {
  return { done: false };
}
function doneComplete() {
  return { done: true };
}
var BOOT_BUDGET_MS = 2e4;
var CONFORMANCE_BUDGET_MS = 24e4;
var BENCHMARK_BUDGET_MS = 24e4;
var EXPORT_BUDGET_MS = 3e4;
var DEADLINE_MARGIN_MS = 9e4;
var TRIAL_WALL_BUDGET_SEC = 900;
var HEALTHZ_ATTEMPTS = 2;
var HEALTHZ_BUDGET_MS = 1e4;
var CHECK_TIMEOUT_MS = 15e3;
var CHECK_TIMEOUT_MIN_MS = 5e3;
var CHECK_TIMEOUT_MAX_MS = 15e3;
var PHASE_BUDGET_MS = Object.freeze({
  boot: BOOT_BUDGET_MS,
  conformance: CONFORMANCE_BUDGET_MS,
  benchmark: BENCHMARK_BUDGET_MS,
  export: EXPORT_BUDGET_MS
});
var BOOT_BACKOFF = Object.freeze({ initialMs: 100, factor: 2, maxMs: 2e3 });
function deadlineOf(startedAtMs, wallBudgetSec = TRIAL_WALL_BUDGET_SEC) {
  const wallMs = Number.isFinite(wallBudgetSec) && wallBudgetSec > 0 ? wallBudgetSec * 1e3 : TRIAL_WALL_BUDGET_SEC * 1e3;
  const deadlineMs = startedAtMs + Math.max(0, wallMs - DEADLINE_MARGIN_MS);
  return Object.freeze({ startedAtMs, deadlineMs });
}
function realSleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
async function waitForValue(probe, options) {
  const now = options.now ?? (() => Date.now());
  const sleep2 = options.sleep ?? realSleep;
  const initial = Math.max(1, options.initialDelayMs ?? BOOT_BACKOFF.initialMs);
  const cap = Math.max(initial, options.maxDelayMs ?? BOOT_BACKOFF.maxMs);
  const growth = Math.max(1, options.factor ?? BOOT_BACKOFF.factor);
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : 0;
  const deadline = now() + timeoutMs;
  let delay = initial;
  let probes = 0;
  for (; ; ) {
    if (options.signal?.aborted === true) throw new WireAbortError("the wait was aborted");
    const value = probe();
    if (value !== null && value !== void 0) return value;
    probes += 1;
    const left = deadline - now();
    if (left <= 0) throw new WireTimeoutError(`nothing arrived within ${timeoutMs} ms (${probes} probes)`);
    await sleep2(Math.min(delay, left));
    delay = Math.min(cap, Math.round(delay * growth));
  }
}
var RegisterGate = class {
  #entry = null;
  /** The entry base URL, or null before the first register. */
  get entry() {
    return this.#entry;
  }
  /** Whether an entry has registered. */
  get registered() {
    return this.#entry !== null;
  }
  /** Record `base` if no entry has registered yet; false when the first entry already won. */
  offer(base) {
    if (this.#entry !== null) return false;
    this.#entry = base;
    return true;
  }
  /** Wait for the first register, with the boot backoff, up to the boot budget (or `timeoutMs`). */
  wait(options = {}) {
    return waitForValue(() => this.#entry, {
      timeoutMs: options.timeoutMs ?? BOOT_BUDGET_MS,
      initialDelayMs: options.initialDelayMs,
      maxDelayMs: options.maxDelayMs,
      factor: options.factor,
      signal: options.signal,
      now: options.now,
      sleep: options.sleep
    });
  }
};
function readyBody(host, port) {
  if (!isPort(port) && port !== 0) throw new WireError(`a ready file's port is 0 or 1..${MAX_PORT}: ${JSON.stringify(port)}`);
  return Object.freeze({ schema: READY_SCHEMA, host, port });
}
function isReadyFile(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value;
  return record.schema === READY_SCHEMA && typeof record.host === "string" && record.host !== "" && isPort(record.port);
}
function waitForReadyFile(read, options = {}) {
  return waitForValue(read, {
    timeoutMs: options.timeoutMs ?? BOOT_BUDGET_MS,
    initialDelayMs: options.initialDelayMs,
    maxDelayMs: options.maxDelayMs,
    factor: options.factor,
    signal: options.signal,
    now: options.now,
    sleep: options.sleep
  });
}
function joinPath(...parts) {
  const absolute = parts.length > 0 && (parts[0] ?? "").startsWith("/");
  const clean = [];
  for (const part of parts) {
    if (part === "") continue;
    const piece = part.replace(/^\/+/, "").replace(/\/+$/, "");
    if (piece !== "") clean.push(piece);
  }
  return `${absolute ? "/" : ""}${clean.join("/")}`;
}
function readyFilePath(stateDir) {
  return joinPath(stateDir, READY_FILE);
}
function exportDirPath(stateDir) {
  return joinPath(stateDir, EXPORT_DIR);
}
function stateFilePath(stateDir) {
  return joinPath(stateDir, EXPORT_DIR, STATE_FILE);
}
function perfFilePath(stateDir) {
  return joinPath(stateDir, EXPORT_DIR, PERF_FILE);
}
var BOOT_FAILED_NOTE = "no entry registered before the boot deadline";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isBitRecord(value) {
  if (!isRecord(value)) return false;
  for (const bit of Object.values(value)) if (bit !== 0 && bit !== 1) return false;
  return true;
}
function isPerfTier(value) {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}
function isPerfTierRecord(value) {
  if (!isRecord(value)) return false;
  for (const tier of Object.values(value)) if (!isPerfTier(tier)) return false;
  return true;
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isStateFile(value) {
  if (!isRecord(value) || value.version !== STATE_VERSION) return false;
  if (value.working !== 0 && value.working !== 1) return false;
  if (!isBitRecord(value.checks)) return false;
  if (!isPerfTierRecord(value.perfTiers)) return false;
  if (!isRecord(value.counts)) return false;
  if (!isCount(value.counts.total) || !isCount(value.counts.passed)) return false;
  if (!isRecord(value.counts.byGroup)) return false;
  for (const group of Object.values(value.counts.byGroup)) {
    if (!isRecord(group) || !isCount(group.total) || !isCount(group.passed)) return false;
  }
  if (value.notes !== void 0 && !isStringArray(value.notes)) return false;
  return true;
}
function isPerfFile(value) {
  if (!isRecord(value) || value.version !== PERF_VERSION) return false;
  if (typeof value.calibrated !== "boolean") return false;
  if (!Array.isArray(value.workloads)) return false;
  for (const workload of value.workloads) {
    if (!isRecord(workload)) return false;
    if (typeof workload.name !== "string" || workload.name === "") return false;
    if (!Array.isArray(workload.rounds) || !workload.rounds.every(isFiniteNumber)) return false;
    if (!isFiniteNumber(workload.p50_ms) || !isFiniteNumber(workload.p99_ms)) return false;
    if (!isCount(workload.ops)) return false;
    if (!isCount(workload.points) || workload.points > 50) return false;
    if (workload.error !== void 0 && typeof workload.error !== "string") return false;
  }
  if (!isPerfTierRecord(value.tiers)) return false;
  if (!isRecord(value.points)) return false;
  for (const points of Object.values(value.points)) if (!isCount(points) || points > 50) return false;
  if (!isCount(value.perf_p50_us)) return false;
  if (!isCount(value.points_total) || value.points_total > 200) return false;
  if (!isStringArray(value.notes)) return false;
  return true;
}
function canonicalJson(value) {
  return JSON.stringify(sortKeysDeep(value));
}
function canonicalJsonLine(value) {
  return `${canonicalJson(value)}
`;
}
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!isRecord(value)) return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === void 0) continue;
    sorted[key] = sortKeysDeep(item);
  }
  return sorted;
}
function workingBit(bootOk, passedChecks) {
  return bootOk && Number.isFinite(passedChecks) && passedChecks > 0 ? 1 : 0;
}
var SCENARIO_SEED = 0x6a09e667f3bcc909n;
var SCENARIO_SEED_HEX = "6a09e667f3bcc909";
var U64_MASK = 0xffffffffffffffffn;
var SCENARIO_EPOCH_SEC = 1735689600;
var SCENARIO_USERS = 12;
var SCENARIO_VIEWER_REPOS = 30;
var SCENARIO_ORG_REPOS = 6;
var SCENARIO_STRANGER_REPOS = 3;
var SCENARIO_FILE_PATHS = 60;
var SCENARIO_BLOBS = 24;
var SCENARIO_COMMITS = 60;
var SCENARIO_ISSUES = 60;
var SCENARIO_PULLS = 30;
var DEFAULT_BRANCH = "main";
function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = hash * 0x100000001b3n & U64_MASK;
  }
  return hash;
}
function mix64(value) {
  let z = value + 0x9e3779b97f4a7c15n & U64_MASK;
  z = (z ^ z >> 30n) * 0xbf58476d1ce4e5b9n & U64_MASK;
  z = (z ^ z >> 27n) * 0x94d049bb133111ebn & U64_MASK;
  return (z ^ z >> 31n) & U64_MASK;
}
function scenarioSeedFor(label) {
  return mix64(SCENARIO_SEED ^ fnv1a64(label));
}
function scenarioRng(label) {
  return new Rng(scenarioSeedFor(label));
}
var HEX_DIGITS = "0123456789abcdef";
var Rng = class _Rng {
  #state;
  constructor(seed) {
    const masked = seed & U64_MASK;
    this.#state = masked === 0n ? SCENARIO_SEED : masked;
  }
  /** A stream from a label (scenarioSeedFor) under this scenario's seed. */
  static fromLabel(label) {
    return new _Rng(scenarioSeedFor(label));
  }
  /** An independent stream from this one's current state. */
  clone() {
    return new _Rng(this.#state);
  }
  /** The next 64-bit value. */
  nextU64() {
    let x = this.#state;
    x = (x ^ x >> 12n) & U64_MASK;
    x = (x ^ x << 25n) & U64_MASK;
    x = (x ^ x >> 27n) & U64_MASK;
    this.#state = x;
    return x * 0x2545f4914f6cdd1dn & U64_MASK;
  }
  /** The next 32-bit value, from the top half of nextU64(). */
  nextU32() {
    return Number(this.nextU64() >> 32n);
  }
  /** An integer in [0, maxExclusive), unbiased by rejection. */
  nextInt(maxExclusive) {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) throw new WireError(`nextInt needs a positive safe integer, not ${String(maxExclusive)}`);
    if (maxExclusive === 1) return 0;
    const range = 4294967296;
    const limit = range - range % maxExclusive;
    for (; ; ) {
      const value = this.nextU32();
      if (value < limit) return value % maxExclusive;
    }
  }
  /** A number in [0, 1), 32 bits of resolution. */
  fraction() {
    return this.nextU32() / 4294967296;
  }
  /** True with probability `probability`. */
  chance(probability) {
    return this.fraction() < probability;
  }
  /** One element, uniformly (a WireError on an empty list). */
  pick(items) {
    if (items.length === 0) throw new WireError("pick from an empty list");
    return items[this.nextInt(items.length)];
  }
  /** A shuffled copy, Fisher-Yates. */
  shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(i + 1);
      const swap = copy[i];
      copy[i] = copy[j];
      copy[j] = swap;
    }
    return copy;
  }
  /** `length` bytes. */
  bytes(length) {
    const size = Number.isSafeInteger(length) ? Math.max(0, length) : 0;
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i += 4) {
      const word = this.nextU32();
      out[i] = word & 255;
      if (i + 1 < size) out[i + 1] = word >>> 8 & 255;
      if (i + 2 < size) out[i + 2] = word >>> 16 & 255;
      if (i + 3 < size) out[i + 3] = word >>> 24 & 255;
    }
    return out;
  }
  /** `length` lowercase hex characters. */
  hex(length) {
    let out = "";
    while (out.length < length) out += HEX_DIGITS[this.nextInt(16)];
    return out;
  }
  /** `count` picks from `list`, in order. */
  words(count, list) {
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(this.pick(list));
    return out;
  }
};
var FIRST_NAMES = Object.freeze([
  "ada",
  "bram",
  "cora",
  "dmitri",
  "elena",
  "felix",
  "greta",
  "hugo",
  "iris",
  "jonas",
  "kira",
  "lars",
  "mira",
  "nico",
  "olga",
  "pavel",
  "quinn",
  "rosa",
  "sven",
  "tess",
  "ulla",
  "vito",
  "wren",
  "yara",
  "zane"
]);
var LAST_NAMES = Object.freeze([
  "anders",
  "bauer",
  "costa",
  "dahl",
  "eriksen",
  "fischer",
  "garcia",
  "holm",
  "iversen",
  "jansen",
  "keller",
  "lind",
  "moreau",
  "novak",
  "olsen",
  "peters",
  "quist",
  "rossi",
  "sato",
  "turi",
  "ulrich",
  "vega",
  "weber",
  "xu",
  "yilmaz",
  "zimmer"
]);
var REPO_ADJECTIVES = Object.freeze([
  "amber",
  "brisk",
  "calm",
  "crisp",
  "eager",
  "faint",
  "gentle",
  "happy",
  "idle",
  "jolly",
  "keen",
  "lively",
  "mellow",
  "nimble",
  "open",
  "plain",
  "quick",
  "quiet",
  "rapid",
  "soft",
  "steady",
  "tidy",
  "upbeat",
  "vivid",
  "warm",
  "witty",
  "young",
  "zesty"
]);
var REPO_NOUNS = Object.freeze([
  "acorn",
  "badger",
  "canyon",
  "cedar",
  "comet",
  "coral",
  "delta",
  "ember",
  "falcon",
  "glade",
  "harbor",
  "indigo",
  "juniper",
  "kettle",
  "lantern",
  "meadow",
  "nebula",
  "orchid",
  "pebble",
  "quartz",
  "raven",
  "saffron",
  "thistle",
  "umber",
  "violet",
  "willow",
  "yarrow",
  "zephyr"
]);
var REPO_DESCRIPTIONS = Object.freeze([
  "a small service with a sharp edge",
  "notes and experiments, kept until they are not",
  "the tooling behind the thing",
  "a reference implementation, for reading",
  "what the prototype became",
  "fixtures, generators and the odd benchmark",
  "the parts that must not break",
  "a sandbox for the next idea"
]);
var PATH_SEGMENTS = Object.freeze([
  "src",
  "lib",
  "docs",
  "test",
  "scripts",
  "api",
  "core",
  "util",
  "config",
  "data",
  "web",
  "cli",
  "pkg",
  "internal",
  "examples",
  "assets",
  "build",
  "tools",
  "server",
  "client"
]);
var FILE_STEMS = Object.freeze([
  "index",
  "request",
  "response",
  "server",
  "client",
  "schema",
  "parser",
  "router",
  "config",
  "store",
  "clock",
  "queue",
  "render",
  "format",
  "validate",
  "session",
  "token",
  "event",
  "stream",
  "cache"
]);
var FILE_EXTENSIONS = Object.freeze(["ts", "js", "json", "md", "txt", "yml", "toml", "css", "html", "sql"]);
var BLOB_WORDS = Object.freeze([
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliet",
  "kilo",
  "lima",
  "mike",
  "november",
  "oscar",
  "papa",
  "quebec",
  "romeo",
  "sierra",
  "tango",
  "uniform",
  "victor",
  "whiskey",
  "xray",
  "yankee",
  "zulu",
  "amber",
  "basalt",
  "cobalt",
  "drift",
  "ember",
  "frost",
  "granite",
  "hollow",
  "ivory",
  "jasper",
  "kelp",
  "lichen",
  "moss",
  "nickel"
]);
var COMMIT_VERBS = Object.freeze([
  "Add",
  "Fix",
  "Refactor",
  "Document",
  "Test",
  "Tidy",
  "Speed up",
  "Simplify",
  "Handle",
  "Extract",
  "Inline",
  "Rename",
  "Guard",
  "Wire",
  "Drop"
]);
var COMMIT_OBJECTS = Object.freeze([
  "the request parser",
  "repo lookup",
  "issue pagination",
  "the merge path",
  "token checks",
  "the clone endpoint",
  "packfile handling",
  "error bodies",
  "branch listing",
  "the GraphQL node query",
  "MCP tool dispatch",
  "rate limit headers",
  "the upload pack",
  "the ref advertisement",
  "commit ancestry"
]);
var ISSUE_ADJECTIVES = Object.freeze([
  "Broken",
  "Slow",
  "Missing",
  "Confusing",
  "Unexpected",
  "Flaky",
  "Incorrect",
  "Unclear",
  "Stale",
  "Noisy"
]);
var ISSUE_SUBJECTS = Object.freeze([
  "clone over HTTP",
  "push report-status",
  "issue pagination",
  "merge button",
  "GraphQL node ids",
  "MCP tool list",
  "shallow fetch",
  "tag listing",
  "repo creation",
  "content update",
  "branch deletion",
  "commit listing"
]);
var PULL_VERBS = Object.freeze(["Add", "Fix", "Improve", "Simplify", "Document", "Refactor", "Speed up", "Harden"]);
var PULL_SUBJECTS = Object.freeze([
  "shallow fetch support",
  "push report status checks",
  "issue label validation",
  "merge conflict detection",
  "GraphQL cursor pagination",
  "MCP tool schemas",
  "packfile delta reuse",
  "conditional requests",
  "repo pagination",
  "branch protection stubs"
]);
var SENTENCE_STARTS = Object.freeze([
  "Steps to reproduce are below",
  "This showed up after the last change",
  "The expected behaviour is clear",
  "A minimal case is attached",
  "It works on a fresh repository",
  "The same flow works over the API"
]);
var SENTENCE_ENDS = Object.freeze([
  "and the server answers with a JSON error",
  "but the second request fails",
  "and nothing is written to the log",
  "while the reply body stays empty",
  "and the status is wrong for the method",
  "so the client gives up"
]);
var ISSUE_LABELS = Object.freeze(["bug", "enhancement", "documentation", "question", "good first issue", "help wanted"]);
var DEFAULT_BRANCHES = Object.freeze(["main", "develop", "release/1.0"]);
function generateUsers(rng, count) {
  const used = /* @__PURE__ */ new Set();
  const users = [];
  for (let i = 0; i < Math.max(0, Math.trunc(count)); i += 1) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const base = `${first}${last}`.replace(/[^a-z0-9-]/g, "");
    let login = base;
    let suffix = 2;
    while (used.has(login)) {
      login = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(login);
    users.push(Object.freeze({ id: 1e3 + i, login, name: `${first} ${last}`, email: `${login}@example.invalid` }));
  }
  return users;
}
function generateRepos(rng, owner, count, firstId = 5e3) {
  const used = /* @__PURE__ */ new Set();
  const repos = [];
  for (let i = 0; i < Math.max(0, Math.trunc(count)); i += 1) {
    const base = `${rng.pick(REPO_ADJECTIVES)}-${rng.pick(REPO_NOUNS)}`;
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
      name = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(name);
    repos.push(
      Object.freeze({
        id: firstId + i,
        owner,
        name,
        fullName: `${owner}/${name}`,
        description: rng.pick(REPO_DESCRIPTIONS),
        private: i % 7 === 3,
        defaultBranch: DEFAULT_BRANCH
      })
    );
  }
  return repos;
}
function generateFilePaths(rng, count) {
  const used = /* @__PURE__ */ new Set();
  const paths = [];
  for (let i = 0; i < Math.max(0, Math.trunc(count)); i += 1) {
    const depth = rng.nextInt(3) === 0 ? 0 : 1 + rng.nextInt(2);
    const dirs = depth === 0 ? [] : rng.shuffle(PATH_SEGMENTS).slice(0, depth);
    const base = [...dirs, `${rng.pick(FILE_STEMS)}.${rng.pick(FILE_EXTENSIONS)}`].join("/");
    let path = base;
    let suffix = 2;
    while (used.has(path)) {
      path = [...dirs, `${suffix}-${base.split("/").pop() ?? base}`].join("/");
      suffix += 1;
    }
    used.add(path);
    paths.push(path);
  }
  return paths;
}
function generateBlobText(rng, sizeBytes) {
  const size = Number.isFinite(sizeBytes) ? Math.max(0, Math.trunc(sizeBytes)) : 0;
  let out = "";
  while (out.length < size) {
    out += rng.pick(BLOB_WORDS);
    if (out.length < size) out += rng.chance(0.14) ? "\n" : " ";
  }
  return out.slice(0, size);
}
var BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const triplet = b0 << 16 | b1 << 8 | b2;
    out += BASE64_ALPHABET[triplet >> 18 & 63] ?? "";
    out += BASE64_ALPHABET[triplet >> 12 & 63] ?? "";
    out += i + 1 < bytes.length ? BASE64_ALPHABET[triplet >> 6 & 63] ?? "" : "=";
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triplet & 63] ?? "" : "=";
  }
  return out;
}
function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}
function generateBlob(rng, path, sizeBytes) {
  const content = generateBlobText(rng, sizeBytes);
  return Object.freeze({ path, content, base64: textToBase64(content) });
}
function scenarioDate(rng) {
  const epochSec = SCENARIO_EPOCH_SEC + rng.nextInt(90 * 24 * 60 * 60);
  return Object.freeze({ epochSec, iso: new Date(epochSec * 1e3).toISOString() });
}
function generateCommitMessage(rng) {
  const head = `${rng.pick(COMMIT_VERBS)} ${rng.pick(COMMIT_OBJECTS)}`;
  return rng.chance(0.35) ? `${head}

${generateSentence(rng)}` : head;
}
function generateCommit(rng, author) {
  const when = scenarioDate(rng);
  return Object.freeze({ message: generateCommitMessage(rng), author, epochSec: when.epochSec, iso: when.iso });
}
function generateSentence(rng) {
  return `${rng.pick(SENTENCE_STARTS)} ${rng.pick(SENTENCE_ENDS)}.`;
}
function generateBody(rng) {
  const sentences = [];
  const count = 1 + rng.nextInt(3);
  for (let i = 0; i < count; i += 1) sentences.push(generateSentence(rng));
  return sentences.join(" ");
}
function generateIssue(rng) {
  return Object.freeze({
    title: `${rng.pick(ISSUE_ADJECTIVES)} ${rng.pick(ISSUE_SUBJECTS)}`,
    body: generateBody(rng),
    labels: rng.chance(0.5) ? [rng.pick(ISSUE_LABELS)] : []
  });
}
function generateBranchName(rng) {
  const kind = rng.pick(["feature", "fix", "perf", "docs", "chore"]);
  const subject = rng.pick(PULL_SUBJECTS).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${kind}/${subject}`;
}
function generatePull(rng, base = DEFAULT_BRANCH) {
  return Object.freeze({
    title: `${rng.pick(PULL_VERBS)} ${rng.pick(PULL_SUBJECTS)}`,
    body: generateBody(rng),
    head: generateBranchName(rng),
    base
  });
}
function uniqueBranch(rng, used) {
  let branch = generateBranchName(rng);
  let suffix = 2;
  while (used.has(branch)) {
    branch = `${generateBranchName(rng)}-${suffix}`;
    suffix += 1;
  }
  used.add(branch);
  return branch;
}
function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}
var cachedScenario = null;
function buildScenario() {
  if (cachedScenario !== null) return cachedScenario;
  const users = generateUsers(scenarioRng("users"), SCENARIO_USERS);
  const viewer = users[0];
  const teammate = users[1];
  const stranger = users[2];
  const orgRng = scenarioRng("org");
  const org = `${orgRng.pick(REPO_ADJECTIVES)}-${orgRng.pick(REPO_NOUNS)}-org`;
  const branchRng = scenarioRng("branches");
  const branchSet = new Set(DEFAULT_BRANCHES);
  for (let i = 0; i < 8; i += 1) uniqueBranch(branchRng, branchSet);
  const filePaths = generateFilePaths(scenarioRng("paths"), SCENARIO_FILE_PATHS);
  const blobRng = scenarioRng("blobs");
  const blobs = filePaths.slice(0, SCENARIO_BLOBS).map((path) => generateBlob(blobRng, path, 64 + blobRng.nextInt(4033)));
  const commitRng = scenarioRng("commits");
  const commits = Array.from({ length: SCENARIO_COMMITS }, () => generateCommit(commitRng, commitRng.pick(users)));
  const issueRng = scenarioRng("issues");
  const issues = Array.from({ length: SCENARIO_ISSUES }, () => generateIssue(issueRng));
  const pullRng = scenarioRng("pulls");
  const pulls = Array.from({ length: SCENARIO_PULLS }, () => generatePull(pullRng));
  const repos = generateRepos(scenarioRng("repos.viewer"), viewer.login, SCENARIO_VIEWER_REPOS, 5e3);
  const orgRepos = generateRepos(scenarioRng("repos.org"), org, SCENARIO_ORG_REPOS, 6e3);
  const strangerRepos = generateRepos(scenarioRng("repos.stranger"), stranger.login, SCENARIO_STRANGER_REPOS, 7e3);
  cachedScenario = deepFreeze({
    seed: SCENARIO_SEED_HEX,
    viewer,
    teammate,
    stranger,
    users,
    org,
    repos,
    orgRepos,
    strangerRepos,
    labels: ISSUE_LABELS,
    branches: [...branchSet],
    filePaths,
    blobs,
    commits,
    issues,
    pulls
  });
  return cachedScenario;
}

// env/src/calibration.json
var calibration_default = {
  schema: "agent-fun/calibration/v1",
  contest: "github-core-clone-01",
  measured_at: "2026-11-14",
  status: "measured",
  note: "Measured on dsh-makefun (the production cluster), in the makefun-dev overlay, on the production-shaped trial the platform itself grades: three dev grades of the house baseline (baseline/entry, the reference forge), each a fresh entry entered with `admin-enter-baseline --now` after superseding the previous one. Each grade ran the platform's agent/v1 trial in the split sandbox layout beside production's live sandbox pods. The four p50_ms values below are the per-workload medians of the three runs and are the T_refs.",
  re_measure: "re-measure only if the trial shape changes (the contest's limits, the layout's per-member limits, or the env's BENCH_ROUNDS/protocol). The figures are from makefun-dev, whose overlay holds no one-pod-from setting, so its trials run the split layout (separate entry, env and forwarder pods); production holds one-pod-from 2026-11-13T12:40:09.867Z and this contest's row was born after it, so production grades the contest on the `pod` layout (entry and env in one sandbox pod, the forwarder in the grader's lanes pod). The per-container limits are the same on both layouts (entry 2 CPUs / 1024 MiB, env 2 CPUs / 256 MiB), and the earlier rig cross-check between a one-container trial and the two-member pod found no consistent shape penalty; still, a production `pod` baseline trial is the closest shape and should be measured if one is graded before the escrow locks.",
  method: "Three whole dev grades of the sealed env (env/server.mjs) against the reference forge (baseline/entry) on makefun-dev, entered 2026-11-14T02:18:54Z, 02:51:30Z and 02:54:20Z (run ids below). Each grade made the platform's agent/v1 trial: the entry pod under the contest's limits (2 CPUs, 1024 MiB, 256 pids) and the env pod under grader/sandbox/network.ts ENV_LIMITS (2 CPUs, 256 MiB, 64 pids) with the forwarder pod, the platform's split layout; the pods observed for runs 2 and 3 were on the gVisor nodes s10 and s11 (entry s11, env s10, forwarder s11 on run 2 and s10 on run 3). A dev grade runs its trial once (run flag replay_skipped), so each run is one live pass. The suite runs its 120 conformance checks, then the four benchmark workloads (3 timed rounds each after 5 warm-up operations), then the export. p50_ms per workload is that run's median round; T_ref is the median of the three runs' p50_ms per workload.",
  runs: [
    {
      run_id: "2403c3e0-f183-877d-8ab9-1b12517df568",
      submission_id: "01a1d7d9-ad7b-74f1-a8be-bac47afe76e2",
      started_at: "2026-11-14T02:18:54.282944Z",
      p50s: { push: 1914.548, clone: 266.941, read: 2874.092, write: 448.01 },
      perf_p50_us: 900674
    },
    {
      run_id: "a51d3be7-d400-8d5f-948c-3bb3eb52afa8",
      submission_id: "01a1d7f7-8837-7472-b5f0-44928067eb83",
      started_at: "2026-11-14T02:51:30.262721Z",
      p50s: { push: 1640.82, clone: 313.634, read: 2759.715, write: 348.965 },
      perf_p50_us: 839040
    },
    {
      run_id: "f4f49dce-11b9-8f4c-aff3-5d0ab7c2de82",
      submission_id: "01a1d7fa-1de4-722e-9f4a-8ed9f16b69fc",
      started_at: "2026-11-14T02:54:20.238932Z",
      p50s: { push: 1415.785, clone: 259.436, read: 2428.118, write: 289.433 },
      perf_p50_us: 712790
    }
  ],
  run_count: 3,
  spread: {
    metric: "perf_p50_us",
    min: 712790,
    max: 900674,
    spread_pct: 26.36,
    per_workload_spread_pct: { push: 35.23, clone: 20.89, read: 18.37, write: 54.79 },
    threshold_pct: 20,
    bench_rounds: 3,
    bench_rounds_changed: false,
    note: "Run-to-run spread of the tie-break, (max - min) / min, over the three runs; per-workload spreads are wider (write 289.433-448.01, push 1415.785-1914.548). 26.36% is above the 20% the earlier rig batch used as its threshold, but this is the platform's own run-to-run variation on a shared production node (the three runs finished 39.8-45.4 s of wall time apart), not within-run noise: a wider within-run median cannot shrink it, and the contest's rules quote the median of 3 rounds, so manifest.ts BENCH_ROUNDS stays 3 and the three-run median is the stabilizer.",
    geometric_mean_of_medians_us: 805899
  },
  venue: {
    cluster: "dsh-makefun (the production k3s cluster)",
    overlay: "makefun-dev",
    namespace: "makefun-dev",
    layout: "split (this overlay holds no one-pod-from setting): the entry pod, the env pod and the entry forwarder pod, one sandbox each; in the runs observed (2 and 3) the entry pod was on gVisor node s11, the env pod on s10, and the forwarder on s11 (run 2) or s10 (run 3)",
    nodes: "s10 and s11, the gVisor sandbox nodes, beside production's live sandbox pods (s10 held 23, s11 26 of makefun-prod's sandbox pods at the time of the runs)",
    platform: "gVisor runsc, RuntimeClass gvisor; node s18 runs the app, Postgres, graders and recorders; the trial's pods shared s10/s11 with production's sandbox pods as a production trial does",
    release: "ghcr.io/makedotfun/makefun@sha256:e8f24aaf969a755a0112c73bbad13e69e37641a6c21c673874e6fdf5d392bdfe (commit 52f5a3e24d18f3fd034baad60a9d358c128a61f4), the release makefun-dev served when the runs were made"
  },
  pod: {
    entry: "2 CPUs, 1024 MiB, 256 pids (competition.yaml limits: cpus 2, memory_mb 1024, pids 256, wall_budget_sec 900)",
    env: "2 CPUs, 256 MiB, 64 pids (grader/sandbox/network.ts ENV_LIMITS)",
    forwarder: "SERVICE_LIMITS",
    note: "the split layout's three pods. On production this contest runs the `pod` layout (one sandbox pod, entry and env its two containers, the same per-container limits, the forwarder a lane in the grader's lanes pod)."
  },
  measured_build: {
    bundle_sha256: "793f75c0f8f85338b09d3a564e1a13d2220262a42768c7dce710bf0012620555",
    env_sha256: "d6293aaf3129185c3847df94693212948f045965c515f3fd7d43e03c5d08af05",
    server_mjs_sha256: "51f8c78cb5cd25d8b9e9add663c75d1f26f3ff226633d83952629a39a3b9e783",
    note: "the bundle and the env tree the graded release served, and env/server.mjs's own bytes as those pods ran them. This item's rebuild inlines the new figures below into env/server.mjs, so the shipped env tree and server.mjs digest move (harness.env_sha256 is re-pinned in competition.yaml); the four medians are the change, no check, workload or protocol line moved."
  },
  entry_sha256: "6385bdea052dcd4045cb9f08e3760f3a8939661eb2d2d1fd89b31a296c39f45c",
  entry_sha256_scope: "treeSha256's file-line form over competitions/github-core-clone-01/baseline/entry with rel paths prefixed `baseline/entry/`. baseline/src and baseline/entry are byte-identical (tests/unit/comp-github-core-clone-01.test.ts), so the entry the grade ran is the reference forge in this checkout.",
  conformance: {
    passed: 120,
    total: 120,
    working: 1,
    note: "every run exported state.json with 120/120 passed (git 30/30, repos 15/15, issues 15/15, pulls 20/20, graphql 20/20, mcp 15/15, protocol 5/5) and working 1; the three exports are byte-identical (state.json sha256 a0e98d49854b961230227867235c8615858e006db3763f341ac6154af1445590)."
  },
  prod_sandbox: "The runs were on dsh-makefun itself, beside production's live sandbox pods on s10/s11, in the makefun-dev overlay's split layout. Production grades this contest on the `pod` layout (its one-pod-from setting is 2026-11-13T12:40:09.867Z and the contest's row was born 2026-11-14T01:25:54Z), whose per-container limits are the same and whose pods land on the same gVisor nodes. A production `pod` baseline trial, if one is graded before the escrow locks, is the closest possible measurement; the figures here are the production cluster's own trial shape and load as of 2026-11-14.",
  workloads: {
    push: { p50_ms: 1640.82, runs_p50_ms: [1914.548, 1640.82, 1415.785] },
    clone: { p50_ms: 266.941, runs_p50_ms: [266.941, 313.634, 259.436] },
    read: { p50_ms: 2759.715, runs_p50_ms: [2874.092, 2759.715, 2428.118] },
    write: { p50_ms: 348.965, runs_p50_ms: [448.01, 348.965, 289.433] }
  },
  consumer: "manifest.ts reads workloads.<name>.p50_ms into T_REF_MS.<name> at build time; build-agent-bundle's esbuild pass inlines this JSON into env/server.mjs, and the kit's copy carries the same file under sdk/conformance/.",
  consumer_state: "manifest.ts reads workloads.<name>.p50_ms into T_REF_MS, so T_REF_MS is the four medians above; the build inlines this JSON into env/server.mjs and sdk/sync.sh copies it to sdk/conformance/, so the sealed suite and the kit score the same perf column. At these T_refs each workload at its own T_ref scores round(25 - 12.5*log2(1)) = 25 points, so the reference forge earns 100/200 on a trial measuring like the three-run median; under the previous rig T_refs a run at these same median figures earned 26/200 (push 4, clone 11, read 5, write 6), and the first of the three dev runs itself earned 17/200.",
  previous: {
    measured_at: "2026-11-13",
    what: "the earlier rig batch this recalibration replaces: five whole trials of the sealed env against the same reference forge in one gVisor pod on the throwaway one-node e2e rig (namespace makefun-e2e, node okq764tjd9b3m, a 16 vCPU Namespace instance), the pod at the contest's 2 CPU / 1024 MiB limits, five runs' per-workload medians as T_refs",
    workloads_p50_ms: { push: 514.838, clone: 121.436, read: 899.962, write: 120.093 },
    first_batch_median_perf_p50_us: 290971,
    repeat_batch_median_perf_p50_us: 292297,
    spread_pct: 4.935,
    finding: "a quiet one-node rig: the same reference forge's four workloads measured 2.5-4.7 times faster there than on dsh-makefun beside production's sandbox pods, which paid a production-shaped trial only 26/200 on the perf column (17/200 on the first of the three dev runs). The rig batch also recorded a slow window in which the same shape ran 413k-527k µs, evidence that the rig's own node was not a stable venue.",
    note: "history only: none of these figures is a T_ref any more."
  }
};

// env/src/manifest.ts
var CHECK_GROUPS = Object.freeze([
  Object.freeze({ id: "git", title: "Git smart HTTP", checks: 30, about: "clone, fetch, push and the pack protocol against the entry as a real git server" }),
  Object.freeze({ id: "repos", title: "Repositories", checks: 15, about: "the REST v3 repository, branch, commit and contents APIs" }),
  Object.freeze({ id: "issues", title: "Issues", checks: 15, about: "the REST v3 issue, comment and label APIs" }),
  Object.freeze({ id: "pulls", title: "Pull requests", checks: 20, about: "the REST v3 pull request, files and merge APIs" }),
  Object.freeze({ id: "graphql", title: "GraphQL v4", checks: 20, about: "the v4 documents gh and github-mcp-server actually send" }),
  Object.freeze({ id: "mcp", title: "MCP", checks: 15, about: "the streamable-HTTP MCP endpoint, its tools, and their effect on the REST view" }),
  Object.freeze({ id: "protocol", title: "Wire protocol", checks: 5, about: "status codes, JSON and error bodies, auth, pagination headers and method handling" })
]);
var CHECK_GROUP_IDS = Object.freeze(CHECK_GROUPS.map((group) => group.id));
var CHECK_GROUP_BY_ID = Object.freeze(
  Object.fromEntries(CHECK_GROUPS.map((group) => [group.id, group]))
);
var CHECK_COUNTS = Object.freeze(
  Object.fromEntries(CHECK_GROUPS.map((group) => [group.id, group.checks]))
);
var TOTAL_CHECKS = 120;
function pass(detail2) {
  return detail2 === void 0 ? { ok: true } : { ok: true, detail: detail2 };
}
function fail(detail2) {
  return { ok: false, detail: detail2 };
}
var CHECK_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
function checkId(group, slug2) {
  if (!CHECK_SLUG_RE.test(slug2)) throw new WireError(`a check slug is lowercase letters, digits and hyphens, not ${JSON.stringify(slug2)}`);
  return `${group}.${slug2}`;
}
function parseCheckId(id) {
  const at2 = id.indexOf(".");
  if (at2 <= 0 || at2 === id.length - 1) return null;
  const group = id.slice(0, at2);
  const slug2 = id.slice(at2 + 1);
  if (!CHECK_GROUP_IDS.includes(group)) return null;
  if (!CHECK_SLUG_RE.test(slug2)) return null;
  return { group, slug: slug2 };
}
function checkGroupOf(id) {
  return parseCheckId(id)?.group ?? null;
}
function checkTimeoutMs(requestedMs, remainingMs) {
  const want = requestedMs === void 0 ? CHECK_TIMEOUT_MS : requestedMs;
  const inRange = Number.isFinite(want) ? Math.min(CHECK_TIMEOUT_MAX_MS, Math.max(CHECK_TIMEOUT_MIN_MS, want)) : CHECK_TIMEOUT_MS;
  if (!Number.isFinite(remainingMs)) return inRange;
  return Math.max(0, Math.min(inRange, remainingMs));
}
function validateCheckSpecs(specs2) {
  const issues = [];
  const ids = /* @__PURE__ */ new Set();
  const counts = {};
  for (const spec2 of specs2) {
    if (ids.has(spec2.id)) issues.push(`duplicate check id ${spec2.id}`);
    ids.add(spec2.id);
    const parsed = parseCheckId(spec2.id);
    if (parsed === null) issues.push(`check id ${JSON.stringify(spec2.id)} is not <group>.<slug>`);
    else if (parsed.group !== spec2.group) issues.push(`check id ${spec2.id} names group ${parsed.group} but is registered as ${spec2.group}`);
    if (spec2.title.trim() === "") issues.push(`check ${spec2.id} has no title`);
    if (typeof spec2.fn !== "function") issues.push(`check ${spec2.id} has no fn`);
    counts[spec2.group] = (counts[spec2.group] ?? 0) + 1;
  }
  for (const group of CHECK_GROUPS) {
    const registered = counts[group.id] ?? 0;
    if (registered !== group.checks) issues.push(`${group.id} declares ${group.checks} checks but ${registered} are registered`);
  }
  return issues;
}
var PERF_WORKLOAD_MAX = 50;
var PERF_TIER_STEP = 12.5;
var PERF_TIER_MAX = 4;
var BENCH_ROUNDS = 3;
var BENCH_WARMUP_OPS = 5;
var BENCH_PHASE_BUDGET_MS = BENCHMARK_BUDGET_MS;
var BENCH_WORKLOADS = Object.freeze([
  Object.freeze({
    name: "push",
    title: "Push",
    about: "200 sequential pushes of a 1 KiB change to one repository (one receive-pack update and new commit each)",
    ops: 200,
    rounds: BENCH_ROUNDS,
    warmupOps: BENCH_WARMUP_OPS,
    budgetMs: 6e4
  }),
  Object.freeze({
    name: "clone",
    title: "Clone",
    about: "50 concurrent shallow clones (depth 1) of a 200-commit repository, each stream checksum-verified",
    ops: 50,
    rounds: BENCH_ROUNDS,
    warmupOps: BENCH_WARMUP_OPS,
    budgetMs: 6e4
  }),
  Object.freeze({
    name: "read",
    title: "Read",
    about: "2,000 sequential GET /api/v3/repos/{owner}/{repo}/issues/{n} on a warm keep-alive connection",
    ops: 2e3,
    rounds: BENCH_ROUNDS,
    warmupOps: BENCH_WARMUP_OPS,
    budgetMs: 6e4
  }),
  Object.freeze({
    name: "write",
    title: "Write",
    about: "200 sequential POST /api/v3/repos/{owner}/{repo}/issues",
    ops: 200,
    rounds: BENCH_ROUNDS,
    warmupOps: BENCH_WARMUP_OPS,
    budgetMs: 6e4
  })
]);
var BENCH_WORKLOAD_NAMES = Object.freeze(BENCH_WORKLOADS.map((workload) => workload.name));
var CALIBRATION_SCHEMA = "agent-fun/calibration/v1";
var CALIBRATION_CONTEST = "github-core-clone-01";
if (calibration_default.schema !== CALIBRATION_SCHEMA) {
  throw new TypeError(`calibration.json is ${JSON.stringify(calibration_default.schema)}, not ${JSON.stringify(CALIBRATION_SCHEMA)}`);
}
if (calibration_default.contest !== CALIBRATION_CONTEST) {
  throw new TypeError(`calibration.json was measured for ${JSON.stringify(calibration_default.contest)}, not ${JSON.stringify(CALIBRATION_CONTEST)}`);
}
function calibratedTRefMs(name) {
  const p50 = calibration_default.workloads[name]?.p50_ms;
  return typeof p50 === "number" && Number.isFinite(p50) && p50 > 0 ? p50 : 0;
}
var T_REF_MS = Object.freeze({
  push: calibratedTRefMs("push"),
  clone: calibratedTRefMs("clone"),
  read: calibratedTRefMs("read"),
  write: calibratedTRefMs("write")
});
function isCalibrated(tRefs = T_REF_MS) {
  return BENCH_WORKLOADS.every((workload) => Number.isFinite(tRefs[workload.name]) && tRefs[workload.name] > 0);
}
function benchWorkload(name) {
  const found = BENCH_WORKLOADS.find((workload) => workload.name === name);
  if (found === void 0) throw new WireError(`no benchmark workload ${JSON.stringify(name)} (the workloads are ${BENCH_WORKLOAD_NAMES.join(", ")})`);
  return found;
}
function workloadPoints(tMs, tRef) {
  if (!Number.isFinite(tMs) || tMs <= 0) return 0;
  if (!Number.isFinite(tRef) || tRef <= 0) return 0;
  const raw = 25 - 12.5 * Math.log2(tMs / tRef);
  return Math.round(Math.min(PERF_WORKLOAD_MAX, Math.max(0, raw)));
}
function perfTier(points) {
  if (!Number.isFinite(points) || points <= 0) return 0;
  const tier = Math.floor(points / PERF_TIER_STEP);
  return Math.min(PERF_TIER_MAX, Math.max(0, tier));
}
function perfTiersOf(points) {
  const tiers = {};
  for (const workload of BENCH_WORKLOADS) tiers[workload.name] = perfTier(points[workload.name] ?? 0);
  return tiers;
}
function perfTieBreakUs(p50Ms) {
  if (p50Ms.length === 0) return 0;
  let logSum = 0;
  for (const ms of p50Ms) logSum += Math.log(Math.max(Number.isFinite(ms) ? ms : 1e-3, 1e-3));
  return Math.round(1e3 * Math.exp(logSum / p50Ms.length));
}
function countsFromChecks(checks) {
  const byGroup = {};
  for (const group of CHECK_GROUPS) byGroup[group.id] = { total: group.checks, passed: 0 };
  let passed = 0;
  for (const [id, bit] of Object.entries(checks)) {
    const group = checkGroupOf(id);
    if (group === null) continue;
    const row = byGroup[group];
    if (row === void 0) continue;
    if (bit === 1) {
      row.passed += 1;
      passed += 1;
    }
  }
  return { total: TOTAL_CHECKS, passed, byGroup };
}
function stateFromChecks(input) {
  const complete = {};
  for (const id of input.checkIds) complete[id] = input.checks[id] === 1 ? 1 : 0;
  for (const [id, bit] of Object.entries(input.checks)) {
    if (!(id in complete)) complete[id] = bit === 1 ? 1 : 0;
  }
  const state = {
    version: STATE_VERSION,
    working: input.working ?? 0,
    checks: complete,
    counts: countsFromChecks(complete),
    perfTiers: { ...input.perfTiers ?? {} },
    ...input.notes !== void 0 && input.notes.length > 0 ? { notes: input.notes.slice() } : {}
  };
  return state;
}

// env/src/git-client.ts
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
var ZERO_OID = "0".repeat(40);
var PKT_LINE_MAX = 65520;
var PKT_LINE_MAX_PAYLOAD = PKT_LINE_MAX - 4;
var DEFAULT_GIT_TIMEOUT_MS = 8e3;
var GIT_CLIENT_AGENT = "makefun-git-client/1.0";
var GIT_OBJECT_FORMAT = "sha1";
var GitProtocolError = class extends Error {
  code;
  constructor(message, code2 = "protocol") {
    super(message);
    this.name = "GitProtocolError";
    this.code = code2;
  }
};
var GitHttpError = class extends Error {
  url;
  status;
  bodySnippet;
  constructor(message, url, status, bodySnippet = "") {
    super(message);
    this.name = "GitHttpError";
    this.url = url;
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
};
function asBuffer(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}
function encodePktLine(payload) {
  const data = asBuffer(payload);
  if (data.length > PKT_LINE_MAX_PAYLOAD) {
    throw new GitProtocolError(`pkt-line payload is ${data.length} bytes, over the ${PKT_LINE_MAX_PAYLOAD}-byte maximum`, "pktline-too-long");
  }
  const header = Buffer.allocUnsafe(4);
  header.write((data.length + 4).toString(16).padStart(4, "0"), 0, 4, "ascii");
  return Buffer.concat([header, data]);
}
function pktLineFlush() {
  return Buffer.from("0000", "ascii");
}
function pktLineDelim() {
  return Buffer.from("0001", "ascii");
}
function pktLineResponseEnd() {
  return Buffer.from("0002", "ascii");
}
function encodePktLines(items) {
  const parts = [];
  for (const item of items) {
    if (item === "flush") parts.push(pktLineFlush());
    else if (item === "delim") parts.push(pktLineDelim());
    else if (item === "response-end") parts.push(pktLineResponseEnd());
    else parts.push(encodePktLine(item));
  }
  return Buffer.concat(parts);
}
var HEX4 = /^[0-9a-fA-F]{4}$/;
var PktLineDecoder = class {
  chunks = [];
  buffered = 0;
  ended = false;
  constructor(initial) {
    if (initial && initial.length) this.push(initial);
  }
  get bufferedBytes() {
    return this.buffered;
  }
  push(chunk) {
    if (this.ended) throw new GitProtocolError("pkt-line decoder received bytes after finish()", "pktline-after-end");
    if (!chunk.length) return;
    this.chunks.push(asBuffer(chunk));
    this.buffered += chunk.length;
  }
  /** Mark the stream ended. A caller that expects raw trailing bytes takes them before this. */
  finish() {
    this.ended = true;
  }
  /** True once the stream is ended and every byte was consumed. */
  get complete() {
    return this.ended && this.buffered === 0;
  }
  /** A view of the next `n` bytes without consuming them, or null if fewer are buffered. */
  peek(n) {
    if (this.buffered < n) return null;
    const first = this.chunks[0];
    if (first.length >= n) return first.subarray(0, n);
    const out = Buffer.allocUnsafe(n);
    let filled = 0;
    for (const chunk of this.chunks) {
      const need = n - filled;
      if (need <= 0) break;
      const take = Math.min(need, chunk.length);
      chunk.copy(out, filled, 0, take);
      filled += take;
    }
    return out;
  }
  /** Consume exactly `n` buffered bytes and return them. */
  take(n) {
    if (this.buffered < n) throw new GitProtocolError("pkt-line decoder underrun", "pktline-underrun");
    const first = this.chunks[0];
    if (first.length >= n) {
      if (first.length === n) this.chunks.shift();
      else this.chunks[0] = first.subarray(n);
      this.buffered -= n;
      return first.subarray(0, n);
    }
    const out = Buffer.allocUnsafe(n);
    let filled = 0;
    while (filled < n) {
      const chunk = this.chunks[0];
      const need = n - filled;
      if (chunk.length <= need) {
        chunk.copy(out, filled);
        filled += chunk.length;
        this.chunks.shift();
      } else {
        chunk.copy(out, filled, 0, need);
        this.chunks[0] = chunk.subarray(need);
        filled = n;
      }
    }
    this.buffered -= n;
    return out;
  }
  /** True when the next four buffered bytes look like a pkt-line length, not raw pack data. */
  nextLooksFramed() {
    const head = this.peek(4);
    return head !== null && HEX4.test(head.toString("ascii"));
  }
  /** Remove and return every buffered byte (the v0 raw-pack fallback). */
  takeBuffered() {
    if (!this.buffered) return Buffer.alloc(0);
    const out = Buffer.concat(this.chunks, this.buffered);
    this.chunks = [];
    this.buffered = 0;
    return out;
  }
  /**
   * The next packet, or null when more bytes are needed. Throws on a malformed header or a
   * truncated stream (after `finish()`), never returns a bogus packet.
   */
  next() {
    if (this.buffered < 4) {
      if (this.ended && this.buffered > 0) {
        throw new GitProtocolError(`truncated pkt-line: ${this.buffered} trailing byte(s)`, "pktline-truncated");
      }
      return null;
    }
    const header = this.peek(4);
    if (!HEX4.test(header.toString("ascii"))) {
      throw new GitProtocolError(`invalid pkt-line length ${JSON.stringify(header.toString("ascii"))}`, "pktline-header");
    }
    const length = Number.parseInt(header.toString("ascii"), 16);
    if (length === 0) {
      this.take(4);
      return { kind: "flush" };
    }
    if (length === 1) {
      this.take(4);
      return { kind: "delim" };
    }
    if (length === 2) {
      this.take(4);
      return { kind: "response-end" };
    }
    if (length === 3) {
      throw new GitProtocolError("invalid pkt-line length 0003", "pktline-header");
    }
    if (length > PKT_LINE_MAX) {
      throw new GitProtocolError(`pkt-line length ${length} exceeds ${PKT_LINE_MAX}`, "pktline-too-long");
    }
    if (this.buffered < length) {
      if (this.ended) {
        throw new GitProtocolError(`truncated pkt-line: ${length} announced, ${this.buffered} available`, "pktline-truncated");
      }
      return null;
    }
    const raw = this.take(length);
    return { kind: "data", payload: raw.subarray(4), raw };
  }
  /**
   * Switch the decoder to raw (unframed) mode for a v0 fetch response without sideband: returns
   * the buffered bytes untouched when the next four bytes are not a pkt-line length.
   */
  nextIsRaw() {
    if (this.buffered < 4) return false;
    return !this.nextLooksFramed();
  }
};
function decodePktLines(bytes, options = {}) {
  const decoder = new PktLineDecoder(bytes);
  decoder.finish();
  const packets = [];
  for (; ; ) {
    if (options.allowTrailing && decoder.nextIsRaw()) break;
    const packet = decoder.next();
    if (packet === null) break;
    packets.push(packet);
  }
  return packets;
}
var TYPE_CODE = { commit: 1, tree: 2, blob: 3, tag: 4 };
var CODE_TYPE = { 1: "commit", 2: "tree", 3: "blob", 4: "tag" };
function objectHeader(type, size) {
  return Buffer.from(`${type} ${size}\0`, "utf8");
}
function hashObject(type, data) {
  const body = asBuffer(data);
  const hash = createHash("sha1");
  hash.update(objectHeader(type, body.length));
  hash.update(body);
  return hash.digest("hex");
}
var HEX40 = /^[0-9a-f]{40}$/;
function isObjectId(value) {
  return HEX40.test(value);
}
function parseTree(data) {
  const buffer = asBuffer(data);
  const entries = [];
  let offset = 0;
  while (offset < buffer.length) {
    const space = buffer.indexOf(32, offset);
    if (space < 0) throw new GitProtocolError("tree entry has no mode separator", "tree-parse");
    const nul = buffer.indexOf(0, space + 1);
    if (nul < 0) throw new GitProtocolError("tree entry has no name terminator", "tree-parse");
    if (nul + 21 > buffer.length) throw new GitProtocolError("tree entry has a truncated object id", "tree-parse");
    const mode = buffer.subarray(offset, space).toString("ascii");
    const name = buffer.subarray(space + 1, nul).toString("utf8");
    const oid = buffer.subarray(nul + 1, nul + 21).toString("hex");
    if (!/^[0-7]+$/.test(mode)) throw new GitProtocolError(`tree entry mode ${JSON.stringify(mode)} is not octal`, "tree-parse");
    entries.push({ mode, name, oid });
    offset = nul + 21;
  }
  return entries;
}
function compareTreeNames(a, b) {
  const left = Buffer.from(a.mode === "40000" ? `${a.name}/` : a.name, "utf8");
  const right = Buffer.from(b.mode === "40000" ? `${b.name}/` : b.name, "utf8");
  return Buffer.compare(left, right);
}
function buildTree(entries) {
  const sorted = [...entries].sort(compareTreeNames);
  const parts = [];
  for (const entry of sorted) {
    if (!isObjectId(entry.oid)) throw new GitProtocolError(`tree entry ${entry.name} has a bad object id`, "tree-build");
    parts.push(Buffer.from(`${entry.mode} ${entry.name}\0`, "utf8"));
    parts.push(Buffer.from(entry.oid, "hex"));
  }
  return Buffer.concat(parts);
}
function parseCommit(data) {
  const buffer = asBuffer(data);
  const blank = buffer.indexOf("\n\n");
  const headerEnd = blank < 0 ? buffer.length : blank;
  const headerText = buffer.subarray(0, headerEnd).toString("utf8");
  const message = blank < 0 ? "" : buffer.subarray(blank + 2).toString("utf8");
  let tree = "";
  const parents = [];
  let author = "";
  let committer = "";
  const extra = [];
  for (const line of headerText.split("\n")) {
    if (!line) continue;
    const space = line.indexOf(" ");
    const key = space < 0 ? line : line.slice(0, space);
    const value = space < 0 ? "" : line.slice(space + 1);
    if (key === "tree") tree = value;
    else if (key === "parent") parents.push(value);
    else if (key === "author") author = value;
    else if (key === "committer") committer = value;
    else extra.push([key, value]);
  }
  if (!isObjectId(tree)) throw new GitProtocolError("commit has no valid tree header", "commit-parse");
  for (const parent of parents) if (!isObjectId(parent)) throw new GitProtocolError("commit has a bad parent id", "commit-parse");
  return { tree, parents, author, committer, message, extraHeaders: extra };
}
function parseTag(data) {
  const buffer = asBuffer(data);
  const blank = buffer.indexOf("\n\n");
  const headerEnd = blank < 0 ? buffer.length : blank;
  const headers = /* @__PURE__ */ new Map();
  for (const line of buffer.subarray(0, headerEnd).toString("utf8").split("\n")) {
    if (!line) continue;
    const space = line.indexOf(" ");
    if (space < 0) throw new GitProtocolError(`tag header ${JSON.stringify(line)} has no value`, "tag-parse");
    headers.set(line.slice(0, space), line.slice(space + 1));
  }
  const object = headers.get("object") ?? "";
  const type = headers.get("type") ?? "";
  if (!isObjectId(object)) throw new GitProtocolError("tag has no valid object header", "tag-parse");
  if (type !== "commit" && type !== "tree" && type !== "blob" && type !== "tag") {
    throw new GitProtocolError(`tag has bad type ${JSON.stringify(type)}`, "tag-parse");
  }
  return {
    object,
    type,
    tag: headers.get("tag") ?? "",
    tagger: headers.get("tagger") ?? "",
    message: blank < 0 ? "" : buffer.subarray(blank + 2).toString("utf8")
  };
}
var CONFORMANCE_IDENTITY = "Conformance <conformance@make.fun>";
function buildCommit(fields) {
  if (!isObjectId(fields.tree)) throw new GitProtocolError("buildCommit needs a valid tree id", "commit-build");
  const timestamp = fields.timestamp ?? 17e8;
  const timezone = fields.timezone ?? "+0000";
  const who = `${fields.author ?? CONFORMANCE_IDENTITY} ${timestamp} ${timezone}`;
  const committer = `${fields.committer ?? CONFORMANCE_IDENTITY} ${timestamp} ${timezone}`;
  const lines = [`tree ${fields.tree}`];
  for (const parent of fields.parents ?? []) {
    if (!isObjectId(parent)) throw new GitProtocolError("buildCommit needs valid parent ids", "commit-build");
    lines.push(`parent ${parent}`);
  }
  lines.push(`author ${who}`, `committer ${committer}`, "");
  return Buffer.from(`${lines.join("\n")}
${fields.message}`, "utf8");
}
function buildTag(fields) {
  if (!isObjectId(fields.object)) throw new GitProtocolError("buildTag needs a valid object id", "tag-build");
  const timestamp = fields.timestamp ?? 17e8;
  const timezone = fields.timezone ?? "+0000";
  const tagger = `${fields.tagger ?? CONFORMANCE_IDENTITY} ${timestamp} ${timezone}`;
  return Buffer.from(
    `object ${fields.object}
type ${fields.type}
tag ${fields.tag}
tagger ${tagger}

${fields.message}`,
    "utf8"
  );
}
function collectReachable(roots, lookup, options = {}) {
  const seen = /* @__PURE__ */ new Set();
  const queue = [];
  for (const root of roots) if (isObjectId(root)) queue.push(root);
  while (queue.length) {
    const oid = queue.pop();
    if (seen.has(oid)) continue;
    const object = lookup(oid);
    if (!object) {
      if (options.allowMissing) continue;
      throw new GitProtocolError(`object ${oid} is missing from the store`, "missing-object");
    }
    seen.add(oid);
    if (object.type === "commit") {
      const commit = parseCommit(object.data);
      queue.push(commit.tree);
      for (const parent of commit.parents) queue.push(parent);
    } else if (object.type === "tag") {
      queue.push(parseTag(object.data).object);
    } else if (object.type === "tree") {
      for (const entry of parseTree(object.data)) {
        if (entry.mode === "160000") continue;
        queue.push(entry.oid);
      }
    }
  }
  return seen;
}
function readVarintSize(buffer, start) {
  if (start >= buffer.length) throw new GitProtocolError("pack entry has no size header", "pack-truncated");
  let byte = buffer[start];
  const first = byte;
  let size = byte & 15;
  let shift = 4;
  let offset = start + 1;
  while (byte & 128) {
    if (offset >= buffer.length) throw new GitProtocolError("pack entry size varint is truncated", "pack-truncated");
    byte = buffer[offset++];
    size += (byte & 127) * 2 ** shift;
    shift += 7;
    if (shift > 63) throw new GitProtocolError("pack entry size varint is too long", "pack-corrupt");
  }
  return { size, next: offset, first };
}
function readOfsDeltaBase(buffer, start) {
  if (start >= buffer.length) throw new GitProtocolError("ofs-delta has no base offset", "pack-truncated");
  let byte = buffer[start];
  let offset = start + 1;
  let value = byte & 127;
  while (byte & 128) {
    if (offset >= buffer.length) throw new GitProtocolError("ofs-delta base offset is truncated", "pack-truncated");
    byte = buffer[offset++];
    value = (value + 1) * 128 + (byte & 127);
  }
  return { baseOffset: value, next: offset };
}
function inflateAt(buffer, offset) {
  const view = asBuffer(buffer).subarray(offset);
  let result;
  try {
    result = inflateSync(view, { info: true });
  } catch (err) {
    throw new GitProtocolError(`zlib stream at offset ${offset} did not inflate: ${err.message}`, "pack-zlib");
  }
  const written = result.engine.bytesWritten;
  if (!written || written <= 0) throw new GitProtocolError(`zlib stream at offset ${offset} consumed no bytes`, "pack-zlib");
  return { data: result.buffer, next: offset + written };
}
function applyDelta(base, delta) {
  const baseBuffer = asBuffer(base);
  const deltaBuffer = asBuffer(delta);
  let offset = 0;
  const readSize = () => {
    let value = 0;
    let shift = 0;
    for (; ; ) {
      if (offset >= deltaBuffer.length) throw new GitProtocolError("delta size varint is truncated", "delta-corrupt");
      const byte = deltaBuffer[offset++];
      value += (byte & 127) * 2 ** shift;
      shift += 7;
      if (!(byte & 128)) break;
      if (shift > 63) throw new GitProtocolError("delta size varint is too long", "delta-corrupt");
    }
    return value;
  };
  const sourceSize = readSize();
  const targetSize = readSize();
  if (sourceSize !== baseBuffer.length) {
    throw new GitProtocolError(`delta expects a ${sourceSize}-byte base, got ${baseBuffer.length}`, "delta-base-size");
  }
  const out = Buffer.allocUnsafe(targetSize);
  let written = 0;
  while (offset < deltaBuffer.length) {
    const op = deltaBuffer[offset++];
    if (op & 128) {
      let copyOffset = 0;
      let copySize = 0;
      let shift = 0;
      for (let bit = 0; bit < 4; bit += 1) {
        if (op & 1 << bit) {
          if (offset >= deltaBuffer.length) throw new GitProtocolError("delta copy offset is truncated", "delta-corrupt");
          copyOffset += deltaBuffer[offset++] * 2 ** shift;
        }
        shift += 8;
      }
      shift = 0;
      for (let bit = 4; bit < 7; bit += 1) {
        if (op & 1 << bit) {
          if (offset >= deltaBuffer.length) throw new GitProtocolError("delta copy size is truncated", "delta-corrupt");
          copySize += deltaBuffer[offset++] * 2 ** shift;
        }
        shift += 8;
      }
      if (copySize === 0) copySize = 65536;
      if (copyOffset + copySize > baseBuffer.length) throw new GitProtocolError("delta copy is out of the base", "delta-corrupt");
      if (written + copySize > targetSize) throw new GitProtocolError("delta writes past its target size", "delta-corrupt");
      baseBuffer.copy(out, written, copyOffset, copyOffset + copySize);
      written += copySize;
    } else if (op !== 0) {
      const literal = op & 127;
      if (offset + literal > deltaBuffer.length) throw new GitProtocolError("delta insert is truncated", "delta-corrupt");
      if (written + literal > targetSize) throw new GitProtocolError("delta writes past its target size", "delta-corrupt");
      deltaBuffer.copy(out, written, offset, offset + literal);
      offset += literal;
      written += literal;
    } else {
      throw new GitProtocolError("delta opcode 0 is invalid", "delta-corrupt");
    }
  }
  if (written !== targetSize) throw new GitProtocolError(`delta produced ${written} of ${targetSize} bytes`, "delta-size");
  return out;
}
function packChecksum(pack) {
  const buffer = asBuffer(pack);
  if (buffer.length < 20) throw new GitProtocolError("pack is shorter than its trailer", "pack-truncated");
  return createHash("sha1").update(buffer.subarray(0, buffer.length - 20)).digest("hex");
}
function readPack(pack, options = {}) {
  const buffer = asBuffer(pack);
  if (buffer.length < 32) throw new GitProtocolError(`pack is ${buffer.length} bytes, too short`, "pack-truncated");
  if (buffer.subarray(0, 4).toString("ascii") !== "PACK") {
    throw new GitProtocolError("pack does not start with PACK", "pack-header");
  }
  const version = buffer.readUInt32BE(4);
  if (version !== 2 && version !== 3) throw new GitProtocolError(`unsupported pack version ${version}`, "pack-version");
  const declaredCount = buffer.readUInt32BE(8);
  const trailerStart = buffer.length - 20;
  const trailer = buffer.subarray(trailerStart).toString("hex");
  const computedTrailer = createHash("sha1").update(buffer.subarray(0, trailerStart)).digest("hex");
  const checksumOk = trailer === computedTrailer;
  const raw = [];
  const byOffset = /* @__PURE__ */ new Map();
  let offset = 12;
  for (let index = 0; index < declaredCount; index += 1) {
    const entryOffset = offset;
    const header = readVarintSize(buffer, offset);
    offset = header.next;
    const typeCode = header.first >> 4 & 7;
    const entry = { offset: entryOffset, typeCode, size: header.size, data: Buffer.alloc(0) };
    if (typeCode === 6) {
      const base = readOfsDeltaBase(buffer, offset);
      offset = base.next;
      if (base.baseOffset <= 0 || base.baseOffset > entryOffset) {
        throw new GitProtocolError(`ofs-delta at ${entryOffset} names an invalid base offset ${base.baseOffset}`, "pack-delta");
      }
      entry.baseOffset = entryOffset - base.baseOffset;
    } else if (typeCode === 7) {
      if (offset + 20 > trailerStart) throw new GitProtocolError("ref-delta base id is truncated", "pack-truncated");
      entry.baseOid = buffer.subarray(offset, offset + 20).toString("hex");
      offset += 20;
    } else if (!CODE_TYPE[typeCode]) {
      throw new GitProtocolError(`pack entry ${index} has unknown type code ${typeCode}`, "pack-type");
    }
    const inflated = inflateAt(buffer.subarray(0, trailerStart), offset);
    if (inflated.data.length !== header.size) {
      throw new GitProtocolError(
        `pack entry at ${entryOffset} declares ${header.size} bytes but inflated to ${inflated.data.length}`,
        "pack-size"
      );
    }
    entry.data = inflated.data;
    offset = inflated.next;
    raw.push(entry);
    byOffset.set(entryOffset, entry);
  }
  if (offset !== trailerStart) {
    throw new GitProtocolError(`pack has ${trailerStart - offset} stray bytes before its trailer`, "pack-trailing");
  }
  const entries = [];
  const objects = /* @__PURE__ */ new Map();
  const resolving = /* @__PURE__ */ new Set();
  const resolvedByOid = /* @__PURE__ */ new Map();
  const resolve = (entry) => {
    if (entry.resolved && entry.resolvedType && entry.oid) {
      return { type: entry.resolvedType, data: entry.resolved, oid: entry.oid };
    }
    if (resolving.has(entry.offset)) throw new GitProtocolError(`delta cycle at pack offset ${entry.offset}`, "pack-delta-cycle");
    resolving.add(entry.offset);
    let type;
    let data;
    if (entry.typeCode === 6) {
      const baseEntry = byOffset.get(entry.baseOffset);
      if (!baseEntry) throw new GitProtocolError(`ofs-delta base at offset ${entry.baseOffset} is not in the pack`, "pack-delta-base");
      const base = resolve(baseEntry);
      type = base.type;
      data = applyDelta(base.data, entry.data);
    } else if (entry.typeCode === 7) {
      const wanted = entry.baseOid;
      const baseEntry = resolvedByOid.get(wanted);
      if (baseEntry) {
        const base = resolve(baseEntry);
        type = base.type;
        data = applyDelta(base.data, entry.data);
      } else {
        const external = options.resolveBase?.(wanted);
        if (!external) {
          throw new GitProtocolError(`ref-delta base ${wanted} is neither in the pack nor supplied by the client`, "pack-delta-base");
        }
        type = external.type;
        data = applyDelta(external.data, entry.data);
      }
    } else {
      type = CODE_TYPE[entry.typeCode];
      data = entry.data;
    }
    const oid = hashObject(type, data);
    entry.resolved = data;
    entry.resolvedType = type;
    entry.oid = oid;
    resolvedByOid.set(oid, entry);
    resolving.delete(entry.offset);
    return { type, data, oid };
  };
  let deltaCount = 0;
  for (const entry of raw) {
    const resolved = resolve(entry);
    if (entry.typeCode === 6 || entry.typeCode === 7) deltaCount += 1;
    if (!objects.has(resolved.oid)) objects.set(resolved.oid, { type: resolved.type, data: resolved.data });
    entries.push({
      offset: entry.offset,
      type: resolved.type,
      size: entry.size,
      data: entry.data,
      oid: resolved.oid,
      delta: entry.typeCode === 6 ? { kind: "ofs", baseOid: byOffset.get(entry.baseOffset)?.oid ?? "" } : entry.typeCode === 7 ? { kind: "ref", baseOid: entry.baseOid } : null
    });
  }
  return {
    version,
    declaredCount,
    objects,
    entries,
    trailer,
    computedTrailer,
    checksumOk,
    deltaCount,
    byteLength: buffer.length
  };
}
function writePackObjectHeader(type, size) {
  const code2 = TYPE_CODE[type];
  const bytes = [];
  let remaining = size;
  let first = code2 << 4 | remaining & 15;
  remaining = Math.floor(remaining / 16);
  while (remaining > 0) {
    bytes.push(first | 128);
    first = remaining & 127;
    remaining = Math.floor(remaining / 128);
  }
  bytes.push(first);
  return Buffer.from(bytes);
}
function writePack(objects) {
  const list = [...objects];
  const parts = [];
  const header = Buffer.allocUnsafe(12);
  header.write("PACK", 0, 4, "ascii");
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(list.length, 8);
  parts.push(header);
  for (const object of list) {
    const data = asBuffer(object.data);
    parts.push(writePackObjectHeader(object.type, data.length));
    parts.push(deflateSync(data));
  }
  const body = Buffer.concat(parts);
  return Buffer.concat([body, createHash("sha1").update(body).digest()]);
}
function verifyPackChecksum(pack) {
  const buffer = asBuffer(pack);
  const actual = buffer.subarray(buffer.length - 20).toString("hex");
  const expected = packChecksum(buffer);
  return { ok: actual === expected, expected, actual };
}
function objectsToSend(lookup, serverTips, newTips) {
  const onServer = collectReachable(serverTips, lookup, { allowMissing: true });
  const wanted = collectReachable(newTips, lookup);
  const send = [];
  for (const oid of wanted) {
    if (onServer.has(oid)) continue;
    const object = lookup(oid);
    if (object) send.push(object);
  }
  return send;
}
var defaultFetch = (url, init) => globalThis.fetch(url, init);
function withTimeout(parent, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new GitProtocolError(`request timed out after ${timeoutMs} ms`, "timeout"));
  }, Math.max(1, timeoutMs));
  const timerWithUnref = timer;
  if (typeof timerWithUnref.unref === "function") timerWithUnref.unref();
  let listener = null;
  if (parent) {
    if (parent.aborted) controller.abort(parent.reason);
    else {
      listener = () => controller.abort(parent.reason);
      parent.addEventListener("abort", listener, { once: true });
    }
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      if (parent && listener) parent.removeEventListener("abort", listener);
    }
  };
}
async function* responseChunks(response) {
  if (response.body) {
    for await (const chunk of response.body) yield chunk;
    return;
  }
  const whole = Buffer.from(await response.arrayBuffer());
  if (whole.length) yield whole;
}
async function readAllPackets(response) {
  const decoder = new PktLineDecoder();
  const packets = [];
  for await (const chunk of responseChunks(response)) {
    decoder.push(chunk);
    for (let packet = decoder.next(); packet !== null; packet = decoder.next()) packets.push(packet);
  }
  decoder.finish();
  return packets;
}
async function streamPackets(response, onPacket) {
  const decoder = new PktLineDecoder();
  for await (const chunk of responseChunks(response)) {
    decoder.push(chunk);
    for (let packet = decoder.next(); packet !== null; packet = decoder.next()) onPacket(packet);
  }
  decoder.finish();
}
function parseCapabilityList(text) {
  const capabilities = /* @__PURE__ */ new Map();
  for (const token of text.split(" ")) {
    if (!token) continue;
    const equals = token.indexOf("=");
    if (equals < 0) capabilities.set(token, "");
    else capabilities.set(token.slice(0, equals), token.slice(equals + 1));
  }
  return capabilities;
}
function parseAdvertisement(packets, service) {
  const lines = [];
  let hadServiceHeader = false;
  for (const packet of packets) {
    if (packet.kind !== "data") continue;
    const text = packet.payload.toString("utf8");
    if (lines.length === 0 && !hadServiceHeader && text.startsWith("# service=")) {
      hadServiceHeader = true;
      continue;
    }
    lines.push(text);
  }
  const first = (lines[0] ?? "").replace(/\n$/, "");
  if (first === "version 2" || first.startsWith("version 2 ")) {
    const capabilities2 = /* @__PURE__ */ new Map();
    for (const line of lines) {
      const text = line.replace(/\n$/, "");
      if (!text) continue;
      if (text === "version 2") continue;
      const equals = text.indexOf("=");
      if (equals < 0) capabilities2.set(text, "");
      else capabilities2.set(text.slice(0, equals), text.slice(equals + 1));
    }
    const format = capabilities2.get("object-format");
    if (format && format !== GIT_OBJECT_FORMAT) {
      throw new GitProtocolError(`server speaks object-format ${format}, this client speaks ${GIT_OBJECT_FORMAT}`, "object-format");
    }
    return {
      hadServiceHeader,
      advertisement: { protocol: 2, service, capabilities: capabilities2, versionLine: first, hadServiceHeader }
    };
  }
  const refs = [];
  let capabilities = /* @__PURE__ */ new Map();
  let headSymref = null;
  const rawRefs = [];
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index].replace(/\n$/, "");
    if (!line) continue;
    if (index === 0) {
      const nul = line.indexOf("\0");
      if (nul >= 0) {
        capabilities = parseCapabilityList(line.slice(nul + 1));
        line = line.slice(0, nul);
      }
    }
    const space = line.indexOf(" ");
    if (space < 0) throw new GitProtocolError(`v0 advertisement line has no ref: ${JSON.stringify(line.slice(0, 60))}`, "advertisement");
    const oid = line.slice(0, space);
    const name = line.slice(space + 1);
    if (!isObjectId(oid)) throw new GitProtocolError(`v0 advertisement names a bad object id ${JSON.stringify(oid)}`, "advertisement");
    if (name.trim() === "capabilities^{}") continue;
    if (name.endsWith("^{}")) {
      const base = name.slice(0, -3);
      const existing = rawRefs.find((ref) => ref.name === base);
      if (existing) existing.peeled = oid;
      else rawRefs.push({ oid, name: base, peeled: oid });
      continue;
    }
    rawRefs.push({ oid, name });
  }
  for (const ref of rawRefs) {
    if (ref.oid === ZERO_OID) {
      refs.push({ oid: ref.oid, name: ref.name, unborn: true, peeled: ref.peeled });
      continue;
    }
    const entry = { oid: ref.oid, name: ref.name, peeled: ref.peeled };
    if (ref.name === "HEAD") {
      const symref = capabilities.get("symref");
      if (symref && symref.startsWith("HEAD:")) {
        entry.symrefTarget = symref.slice(5);
        headSymref = entry.symrefTarget;
      }
    }
    refs.push(entry);
  }
  return {
    hadServiceHeader,
    advertisement: { protocol: 0, service, refs, capabilities, headSymref, hadServiceHeader }
  };
}
function trimBase(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}
function snippet(text, max = 400) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
function isAbortError(err) {
  return Boolean(err) && typeof err === "object" && err.name === "AbortError";
}
var GitClient = class {
  baseUrl;
  token;
  agent;
  timeoutMs;
  parentSignal;
  protocolPreference;
  fetchImpl;
  constructor(options) {
    if (!options || !options.baseUrl) throw new GitProtocolError("GitClient needs the entry base URL", "config");
    this.baseUrl = trimBase(options.baseUrl);
    this.token = options.token;
    this.agent = options.agent ?? GIT_CLIENT_AGENT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
    this.parentSignal = options.signal;
    this.protocolPreference = options.gitProtocol ?? "auto";
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
  }
  /** `/<owner>/<repo>.git`: the smart-HTTP path the entry serves (stated in the rules). */
  repoPath(owner, repo) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(owner)) throw new GitProtocolError(`invalid owner ${JSON.stringify(owner)}`, "repo-name");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repo) || repo.endsWith(".git")) {
      throw new GitProtocolError(`invalid repo ${JSON.stringify(repo)}`, "repo-name");
    }
    return `/${owner}/${repo}.git`;
  }
  /** The absolute URL of a repo's git path plus a suffix (e.g. `/info/refs?service=...`). */
  repoUrl(owner, repo, suffix) {
    const url = `${this.baseUrl}${this.repoPath(owner, repo)}${suffix}`;
    if (!url.startsWith(`${this.baseUrl}/`)) throw new GitProtocolError("request would leave the entry base URL", "url");
    return url;
  }
  async request(url, options) {
    if (!url.startsWith(`${this.baseUrl}/`)) {
      throw new GitProtocolError(`refusing to request ${url}, outside the entry base URL`, "url");
    }
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const box = withTimeout(options.signal ?? this.parentSignal, timeoutMs);
    const headers = {
      "User-Agent": this.agent,
      Accept: options.accept ?? "*/*"
    };
    if (options.contentType) headers["Content-Type"] = options.contentType;
    if (options.body) headers["Content-Length"] = String(options.body.length);
    if (options.gitProtocolVersion === 2) headers["Git-Protocol"] = "version=2";
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    try {
      const response = await this.fetchImpl(url, {
        method: options.method ?? "GET",
        headers,
        body: options.body,
        signal: box.signal,
        redirect: "error"
      });
      return response;
    } catch (err) {
      if (box.timedOut()) {
        throw new GitProtocolError(`request to ${url} timed out after ${timeoutMs} ms`, "timeout");
      }
      if (isAbortError(err) || box.signal.aborted) {
        throw new GitProtocolError(`request to ${url} was aborted`, "aborted");
      }
      throw err;
    } finally {
      box.dispose();
    }
  }
  expectedType(service, kind) {
    return `application/x-${service}-${kind}`;
  }
  async expectOk(response, url, contentType, expected) {
    if (response.status !== 200) {
      let body = "";
      try {
        body = snippet(await response.text());
      } catch {
        body = "";
      }
      throw new GitHttpError(`${url} returned HTTP ${response.status}${body ? `: ${body}` : ""}`, url, response.status, body);
    }
    if (contentType !== null && !contentType.toLowerCase().includes(expected)) {
      throw new GitProtocolError(
        `${url} returned content-type ${JSON.stringify(contentType)}, expected ${expected}`,
        "content-type"
      );
    }
  }
  /**
   * GET info/refs for a service and return the raw status/content-type/packets, without throwing on
   * a non-200. The conformance checks use this to prove a missing repo answers 404 and that the
   * server is still healthy afterwards.
   */
  async infoRefs(owner, repo, service, options = {}) {
    const version = service !== "git-upload-pack" || this.protocolPreference === 0 ? null : 2;
    const url = this.repoUrl(owner, repo, `/info/refs?service=${service}`);
    const response = await this.request(url, {
      method: "GET",
      accept: "*/*",
      gitProtocolVersion: version === 2 ? 2 : 0,
      ...options
    });
    const contentType = response.headers.get("content-type");
    if (response.status !== 200) {
      let body = "";
      try {
        body = snippet(await response.text());
      } catch {
        body = "";
      }
      return { status: response.status, contentType, packets: [], bodySnippet: body };
    }
    const packets = await readAllPackets(response);
    return { status: 200, contentType, packets, bodySnippet: "" };
  }
  /** Fetch and parse a ref/capability advertisement. */
  async advertisement(owner, repo, service, options = {}) {
    const raw = await this.infoRefs(owner, repo, service, options);
    if (raw.status !== 200) {
      throw new GitHttpError(
        `${this.repoPath(owner, repo)}/info/refs?service=${service} returned HTTP ${raw.status}`,
        this.repoUrl(owner, repo, `/info/refs?service=${service}`),
        raw.status,
        raw.bodySnippet
      );
    }
    const expected = this.expectedType(service, "advertisement");
    if (raw.contentType !== null && !raw.contentType.toLowerCase().includes(expected)) {
      throw new GitProtocolError(
        `info/refs returned content-type ${JSON.stringify(raw.contentType)}, expected ${expected}`,
        "content-type"
      );
    }
    const parsed = parseAdvertisement(raw.packets, service);
    if (parsed.advertisement.protocol === 2 && this.protocolPreference === 0) {
      throw new GitProtocolError("server answered v2 while the client requested v0", "protocol-mismatch");
    }
    if (parsed.advertisement.protocol === 0 && this.protocolPreference === 2) {
      throw new GitProtocolError("server does not support protocol v2", "protocol-v2-required");
    }
    return parsed.advertisement;
  }
  async post(owner, repo, service, body, options) {
    const url = this.repoUrl(owner, repo, `/${service}`);
    const response = await this.request(url, {
      ...options,
      method: "POST",
      contentType: `application/x-${service}-request`,
      accept: `application/x-${service}-result`,
      body
    });
    await this.expectOk(response, url, response.headers.get("content-type"), this.expectedType(service, "result"));
    return response;
  }
  /** v2 ls-refs (or the v0 advertisement's ref list, filtered client-side). */
  async lsRefs(owner, repo, options = {}) {
    const advertisement = await this.advertisement(owner, repo, "git-upload-pack", options);
    const prefixes = options.prefixes ?? [];
    const keep = (name) => prefixes.length === 0 || prefixes.some((prefix) => name.startsWith(prefix));
    if (advertisement.protocol === 0) {
      return {
        protocol: 0,
        rawRefs: advertisement.refs,
        refs: advertisement.refs.filter((ref) => keep(ref.name)),
        capabilities: advertisement.capabilities,
        headSymref: advertisement.headSymref
      };
    }
    const fetchCapability = advertisement.capabilities.get("ls-refs") ?? "";
    const lines = ["command=ls-refs\n"];
    if (advertisement.capabilities.has("agent")) lines.push(`agent=${this.agent}
`);
    if (advertisement.capabilities.has("object-format")) lines.push(`object-format=${GIT_OBJECT_FORMAT}
`);
    lines.push("delim");
    if (options.peel !== false) lines.push("peel\n");
    if (options.symrefs !== false) lines.push("symrefs\n");
    if (options.unborn !== false && fetchCapability.split(" ").includes("unborn")) lines.push("unborn\n");
    for (const prefix of prefixes) lines.push(`ref-prefix ${prefix}
`);
    lines.push("flush");
    const response = await this.post(owner, repo, "git-upload-pack", encodePktLines(lines), {
      ...options,
      service: "git-upload-pack",
      gitProtocolVersion: 2
    });
    const refs = [];
    await streamPackets(response, (packet) => {
      if (packet.kind !== "data") return;
      const line = packet.payload.toString("utf8").replace(/\n$/, "");
      if (!line) return;
      const firstSpace = line.indexOf(" ");
      if (firstSpace < 0) throw new GitProtocolError(`ls-refs line has no ref name: ${JSON.stringify(line.slice(0, 60))}`, "ls-refs");
      const first = line.slice(0, firstSpace);
      const rest = line.slice(firstSpace + 1);
      const tokens = rest.split(" ");
      const name = tokens[0];
      let symrefTarget;
      let peeled;
      for (const token of tokens.slice(1)) {
        if (token.startsWith("symref-target:")) symrefTarget = token.slice("symref-target:".length);
        else if (token.startsWith("peeled:")) peeled = token.slice("peeled:".length);
      }
      if (first === "unborn") {
        refs.push({ oid: ZERO_OID, name, unborn: true, symrefTarget });
        return;
      }
      if (!isObjectId(first)) throw new GitProtocolError(`ls-refs names a bad object id ${JSON.stringify(first)}`, "ls-refs");
      refs.push({ oid: first, name, peeled, symrefTarget });
    });
    return {
      protocol: 2,
      rawRefs: refs,
      refs: refs.filter((ref) => keep(ref.name)),
      capabilities: advertisement.capabilities,
      headSymref: refs.find((ref) => ref.name === "HEAD")?.symrefTarget ?? null
    };
  }
  /** Fetch objects. Chooses v2 when the server advertises it, v0 otherwise. */
  async fetch(owner, repo, request, options = {}) {
    const callOptions = {
      signal: options.signal ?? request.signal,
      timeoutMs: options.timeoutMs ?? request.timeoutMs
    };
    const advertisement = await this.advertisement(owner, repo, "git-upload-pack", callOptions);
    if (advertisement.protocol === 2) return this.fetchV2(owner, repo, advertisement, request, callOptions);
    return this.fetchV0(owner, repo, advertisement, request, callOptions);
  }
  async fetchV2(owner, repo, advertisement, request, options) {
    const wants = [...new Set(request.wants)];
    for (const want of wants) if (!isObjectId(want)) throw new GitProtocolError(`fetch wants a bad object id ${JSON.stringify(want)}`, "fetch-want");
    const empty = {
      protocol: 2,
      pack: null,
      packBytes: 0,
      checksumOk: true,
      objects: /* @__PURE__ */ new Map(),
      deltaCount: 0,
      shallow: [],
      unshallow: [],
      acks: [],
      nak: false,
      ready: false,
      wantedRefs: [],
      progress: ""
    };
    if (!wants.length) return empty;
    const features = (advertisement.capabilities.get("fetch") ?? "").split(" ").filter(Boolean);
    if (request.depth != null && !features.includes("shallow")) {
      throw new GitProtocolError("server does not advertise shallow fetches (fetch=shallow)", "fetch-shallow");
    }
    if (request.filter != null && !features.includes("filter")) {
      throw new GitProtocolError("server does not advertise fetch filtering", "fetch-filter");
    }
    const lines = ["command=fetch\n"];
    if (advertisement.capabilities.has("agent")) lines.push(`agent=${this.agent}
`);
    if (advertisement.capabilities.has("object-format")) lines.push(`object-format=${GIT_OBJECT_FORMAT}
`);
    lines.push("delim");
    if (request.thinPack !== false) lines.push("thin-pack\n");
    if (request.noProgress !== false) lines.push("no-progress\n");
    lines.push("ofs-delta\n");
    if (request.filter != null) lines.push(`filter ${request.filter}
`);
    for (const want of wants) lines.push(`want ${want}
`);
    for (const have of request.haves ?? []) {
      if (!isObjectId(have)) throw new GitProtocolError(`fetch have is a bad object id ${JSON.stringify(have)}`, "fetch-have");
      lines.push(`have ${have}
`);
    }
    for (const boundary of request.shallow ?? []) {
      if (!isObjectId(boundary)) throw new GitProtocolError(`fetch shallow boundary is a bad object id ${JSON.stringify(boundary)}`, "fetch-shallow");
      lines.push(`shallow ${boundary}
`);
    }
    if (request.depth != null) lines.push(`deepen ${request.depth}
`);
    if (request.deepenSince != null) lines.push(`deepen-since ${request.deepenSince}
`);
    for (const not of request.deepenNot ?? []) lines.push(`deepen-not ${not}
`);
    if (request.done !== false) lines.push("done\n");
    lines.push("flush");
    const response = await this.post(owner, repo, "git-upload-pack", encodePktLines(lines), {
      ...options,
      service: "git-upload-pack",
      gitProtocolVersion: 2
    });
    return this.parseV2Fetch(response, request);
  }
  async parseV2Fetch(response, request) {
    let section = "";
    const packChunks = [];
    const shallow = [];
    const unshallow = [];
    const acks = [];
    const wantedRefs = [];
    let progress = "";
    let nak = false;
    let ready = false;
    let sidebandPackets = 0;
    const decoder = new PktLineDecoder();
    const consume = (packet) => {
      request.observe?.(packet);
      if (packet.kind === "flush") {
        section = "";
        return;
      }
      if (packet.kind === "delim") {
        section = "";
        return;
      }
      if (packet.kind !== "data") throw new GitProtocolError("unexpected control packet in a fetch section", "fetch-section");
      const payload = packet.payload;
      if (section === "") {
        const line2 = payload.toString("utf8");
        if (line2 === "acknowledgments\n") section = "acknowledgments";
        else if (line2 === "shallow-info\n") section = "shallow-info";
        else if (line2 === "wanted-refs\n") section = "wanted-refs";
        else if (line2 === "packfile\n") section = "packfile";
        else if (line2 === "packfile-uris\n") section = "packfile-uris";
        else {
          throw new GitProtocolError(`unexpected v2 fetch section ${JSON.stringify(line2.slice(0, 40))}`, "fetch-section");
        }
        return;
      }
      if (section === "packfile") {
        sidebandPackets += 1;
        if (payload.length < 1) throw new GitProtocolError("empty sideband packet in a packfile section", "sideband");
        const band = payload[0];
        const data = payload.subarray(1);
        if (band === 1) packChunks.push(data);
        else if (band === 2) progress += data.toString("utf8");
        else if (band === 3) throw new GitProtocolError(`server sideband error: ${data.toString("utf8").trim()}`, "sideband-error");
        else throw new GitProtocolError(`invalid sideband band ${band}`, "sideband");
        return;
      }
      const line = payload.toString("utf8").replace(/\n$/, "");
      if (section === "acknowledgments") {
        if (line === "NAK") nak = true;
        else if (line === "ready") ready = true;
        else if (line.startsWith("ACK ")) acks.push(line.slice(4).trim());
        else throw new GitProtocolError(`bad acknowledgments line ${JSON.stringify(line.slice(0, 40))}`, "fetch-ack");
        return;
      }
      if (section === "shallow-info") {
        if (line.startsWith("shallow ")) shallow.push(line.slice(8));
        else if (line.startsWith("unshallow ")) unshallow.push(line.slice(10));
        else throw new GitProtocolError(`bad shallow-info line ${JSON.stringify(line.slice(0, 40))}`, "fetch-shallow");
        return;
      }
      if (section === "wanted-refs") {
        const space = line.indexOf(" ");
        if (space < 0) throw new GitProtocolError("bad wanted-refs line", "fetch-wanted-refs");
        const oid = line.slice(0, space);
        if (!isObjectId(oid)) throw new GitProtocolError("wanted-refs names a bad object id", "fetch-wanted-refs");
        wantedRefs.push({ oid, ref: line.slice(space + 1) });
        return;
      }
      throw new GitProtocolError(`unexpected packet in section ${section}`, "fetch-section");
    };
    for await (const chunk of responseChunks(response)) {
      decoder.push(chunk);
      for (let packet = decoder.next(); packet !== null; packet = decoder.next()) consume(packet);
    }
    decoder.finish();
    if (section === "packfile" && sidebandPackets === 0) {
      throw new GitProtocolError("packfile section carried no packets", "sideband");
    }
    const pack = packChunks.length ? Buffer.concat(packChunks) : null;
    let checksumOk = true;
    let objects = /* @__PURE__ */ new Map();
    let deltaCount = 0;
    if (pack) {
      const checksum = verifyPackChecksum(pack);
      checksumOk = checksum.ok;
      if (!checksumOk) {
        throw new GitProtocolError(`pack trailer ${checksum.actual} does not match its bytes ${checksum.expected}`, "pack-checksum");
      }
      if (request.parse !== false) {
        const read = readPack(pack, {
          resolveBase: (oid) => request.haveObjects?.get(oid)
        });
        objects = read.objects;
        deltaCount = read.deltaCount;
      }
    }
    return {
      protocol: 2,
      pack,
      packBytes: pack?.length ?? 0,
      checksumOk,
      objects,
      deltaCount,
      shallow,
      unshallow,
      acks,
      nak,
      ready,
      wantedRefs,
      progress
    };
  }
  async fetchV0(owner, repo, advertisement, request, options) {
    const wants = [...new Set(request.wants)];
    for (const want of wants) if (!isObjectId(want)) throw new GitProtocolError(`fetch wants a bad object id ${JSON.stringify(want)}`, "fetch-want");
    const empty = {
      protocol: 0,
      pack: null,
      packBytes: 0,
      checksumOk: true,
      objects: /* @__PURE__ */ new Map(),
      deltaCount: 0,
      shallow: [],
      unshallow: [],
      acks: [],
      nak: false,
      ready: false,
      wantedRefs: [],
      progress: ""
    };
    if (!wants.length) return empty;
    const sideband = advertisement.capabilities.has("side-band-64k");
    if (!sideband) {
      throw new GitProtocolError("v0 server does not advertise side-band-64k, so a fetch cannot be framed", "sideband");
    }
    const features = ["side-band-64k"];
    if (advertisement.capabilities.has("multi_ack_detailed")) features.push("multi_ack_detailed");
    else if (advertisement.capabilities.has("multi_ack")) features.push("multi_ack");
    if (request.thinPack !== false && advertisement.capabilities.has("thin-pack")) features.push("thin-pack");
    if (request.noProgress !== false) features.push("no-progress");
    if (advertisement.capabilities.has("ofs-delta")) features.push("ofs-delta");
    let first = true;
    const lines = [];
    for (const want of wants) {
      lines.push(first && features.length ? `want ${want} ${features.join(" ")}
` : `want ${want}
`);
      first = false;
    }
    for (const boundary of request.shallow ?? []) {
      if (!isObjectId(boundary)) throw new GitProtocolError(`fetch shallow boundary is a bad object id ${JSON.stringify(boundary)}`, "fetch-shallow");
      lines.push(`shallow ${boundary}
`);
    }
    if (request.depth != null) {
      if (!advertisement.capabilities.has("shallow")) {
        throw new GitProtocolError("v0 server does not advertise shallow", "fetch-shallow");
      }
      lines.push(`deepen ${request.depth}
`);
    }
    if (request.deepenSince != null) lines.push(`deepen-since ${request.deepenSince}
`);
    for (const not of request.deepenNot ?? []) lines.push(`deepen-not ${not}
`);
    lines.push("flush");
    for (const have of request.haves ?? []) {
      if (!isObjectId(have)) throw new GitProtocolError(`fetch have is a bad object id ${JSON.stringify(have)}`, "fetch-have");
      lines.push(`have ${have}
`);
    }
    if (request.done !== false) lines.push("done\n");
    lines.push("flush");
    const response = await this.post(owner, repo, "git-upload-pack", encodePktLines(lines), {
      ...options,
      service: "git-upload-pack",
      gitProtocolVersion: 0
    });
    const shallow = [];
    const unshallow = [];
    const acks = [];
    let nak = false;
    let progress = "";
    const packChunks = [];
    const decoder = new PktLineDecoder();
    const consume = (packet) => {
      request.observe?.(packet);
      if (packet.kind !== "data") return;
      if (packet.payload.length < 1) throw new GitProtocolError("empty v0 fetch packet", "fetch-v0");
      const band = packet.payload[0];
      if (band === 1 || band === 2 || band === 3) {
        const data = packet.payload.subarray(1);
        if (band === 1) packChunks.push(data);
        else if (band === 2) progress += data.toString("utf8");
        else throw new GitProtocolError(`server sideband error: ${data.toString("utf8").trim()}`, "sideband-error");
        return;
      }
      const line = packet.payload.toString("utf8").replace(/\n$/, "");
      if (line.startsWith("shallow ")) {
        shallow.push(line.slice(8));
        return;
      }
      if (line.startsWith("unshallow ")) {
        unshallow.push(line.slice(10));
        return;
      }
      if (line === "NAK") {
        nak = true;
        return;
      }
      if (line.startsWith("ACK ")) {
        acks.push(line.slice(4));
        return;
      }
      throw new GitProtocolError(`unexpected v0 fetch packet ${JSON.stringify(line.slice(0, 40))}`, "fetch-v0");
    };
    for await (const chunk of responseChunks(response)) {
      decoder.push(chunk);
      for (let packet = decoder.next(); packet !== null; packet = decoder.next()) consume(packet);
    }
    decoder.finish();
    const pack = packChunks.length ? Buffer.concat(packChunks) : null;
    let checksumOk = true;
    let objects = /* @__PURE__ */ new Map();
    let deltaCount = 0;
    if (pack) {
      const checksum = verifyPackChecksum(pack);
      checksumOk = checksum.ok;
      if (!checksumOk) {
        throw new GitProtocolError(`pack trailer ${checksum.actual} does not match its bytes ${checksum.expected}`, "pack-checksum");
      }
      if (request.parse !== false) {
        const read = readPack(pack, { resolveBase: (oid) => request.haveObjects?.get(oid) });
        objects = read.objects;
        deltaCount = read.deltaCount;
      }
    }
    return {
      protocol: 0,
      pack,
      packBytes: pack?.length ?? 0,
      checksumOk,
      objects,
      deltaCount,
      shallow,
      unshallow,
      acks,
      nak,
      ready: false,
      wantedRefs: [],
      progress
    };
  }
  /** Fetch a repo's refs and objects from nothing, optionally shallow. */
  async clone(owner, repo, options = {}) {
    const advertisement = await this.advertisement(owner, repo, "git-upload-pack", options);
    let refs = [];
    let headSymref = null;
    if (advertisement.protocol === 0) {
      refs = advertisement.refs;
      headSymref = advertisement.headSymref;
    } else {
      const ls = await this.lsRefs(owner, repo, { ...options, peel: true, symrefs: true });
      refs = ls.refs;
      headSymref = ls.headSymref ?? refs.find((ref) => ref.name === "HEAD")?.symrefTarget ?? null;
    }
    const base = {
      refs,
      head: headSymref
    };
    const wants = /* @__PURE__ */ new Set();
    if (options.depth != null || options.singleBranch) {
      const headRef = refs.find((ref) => ref.name === (headSymref ?? "HEAD"));
      const tip = headRef?.oid ?? refs.find((ref) => ref.name.startsWith("refs/heads/"))?.oid;
      if (tip && tip !== ZERO_OID) wants.add(tip);
      if (!tip && options.depth == null) {
        for (const ref of refs) if (ref.name.startsWith("refs/heads/")) wants.add(ref.oid);
      }
    } else {
      for (const ref of refs) {
        if (ref.oid === ZERO_OID) continue;
        if (ref.name.startsWith("refs/heads/") || ref.name.startsWith("refs/tags/")) wants.add(ref.oid);
      }
    }
    if (!wants.size) {
      return {
        ...base,
        protocol: advertisement.protocol,
        objects: /* @__PURE__ */ new Map(),
        pack: null,
        packBytes: 0,
        checksumOk: true,
        deltaCount: 0,
        shallow: [],
        progress: ""
      };
    }
    const fetch2 = await this.fetch(
      owner,
      repo,
      { wants: [...wants], depth: options.depth, parse: options.parse },
      options
    );
    return {
      ...base,
      protocol: advertisement.protocol,
      objects: fetch2.objects,
      pack: fetch2.pack,
      packBytes: fetch2.packBytes,
      checksumOk: fetch2.checksumOk,
      deltaCount: fetch2.deltaCount,
      shallow: fetch2.shallow,
      progress: fetch2.progress
    };
  }
  /**
   * Push a command list. `options.objects` (or a prebuilt `options.pack`) carries the objects the
   * server lacks; deletes need neither. A rejection is returned in `report` (an `ng` line), never
   * thrown: HTTP 200 with a refused ref is a successful exchange of a refused update.
   */
  async push(owner, repo, commands, options = {}) {
    if (!commands.length) throw new GitProtocolError("push needs at least one command", "push-command");
    for (const command of commands) {
      if (!isObjectId(command.oldOid) || !isObjectId(command.newOid)) {
        throw new GitProtocolError("push command has a bad object id", "push-command");
      }
      if (!command.ref.startsWith("refs/") || command.ref.length > 200 || /[\s\u0000-\u001f]/.test(command.ref)) {
        throw new GitProtocolError(`push command has a bad ref ${JSON.stringify(command.ref)}`, "push-command");
      }
    }
    const advertisement = await this.advertisement(owner, repo, "git-receive-pack", options);
    if (advertisement.protocol !== 0) {
      throw new GitProtocolError("receive-pack must advertise protocol v0", "push-protocol");
    }
    const capabilities = [...options.capabilities ?? []];
    if (advertisement.capabilities.has("report-status-v2")) capabilities.push("report-status-v2");
    else if (advertisement.capabilities.has("report-status")) capabilities.push("report-status");
    if (advertisement.capabilities.has("side-band-64k")) capabilities.push("side-band-64k");
    if (advertisement.capabilities.has("ofs-delta")) capabilities.push("ofs-delta");
    if (advertisement.capabilities.has("agent")) capabilities.push(`agent=${this.agent}`);
    const updatesRef = commands.some((command) => command.newOid !== ZERO_OID);
    const pack = options.pack ? Buffer.from(options.pack) : updatesRef || options.objects !== void 0 && options.objects.length > 0 ? writePack(options.objects ?? []) : null;
    const lines = [];
    commands.forEach((command, index) => {
      const prefix = `${command.oldOid} ${command.newOid} ${command.ref}`;
      lines.push(index === 0 && capabilities.length ? `${prefix}\0${capabilities.join(" ")}
` : `${prefix}
`);
    });
    lines.push("flush");
    const body = Buffer.concat([encodePktLines(lines), pack ?? Buffer.alloc(0)]);
    const sideband = capabilities.includes("side-band-64k");
    const response = await this.post(owner, repo, "git-receive-pack", body, {
      ...options,
      service: "git-receive-pack",
      gitProtocolVersion: 0
    });
    const reportChunks = [];
    let progress = "";
    const decoder = new PktLineDecoder();
    const consume = (packet) => {
      if (packet.kind !== "data") return;
      if (!packet.payload.length) return;
      if (sideband) {
        const band = packet.payload[0];
        const data = packet.payload.subarray(1);
        if (band === 1) reportChunks.push(data);
        else if (band === 2) progress += data.toString("utf8");
        else if (band === 3) throw new GitProtocolError(`server sideband error: ${data.toString("utf8").trim()}`, "sideband-error");
        else throw new GitProtocolError(`invalid push sideband band ${band}`, "sideband");
        return;
      }
      reportChunks.push(packet.payload);
    };
    for await (const chunk of responseChunks(response)) {
      decoder.push(chunk);
      for (let packet = decoder.next(); packet !== null; packet = decoder.next()) consume(packet);
    }
    decoder.finish();
    const reportBytes = reportChunks.length ? Buffer.concat(reportChunks) : Buffer.alloc(0);
    const report = this.parsePushReport(reportBytes);
    return { report, progress, sideband, capabilities: advertisement.capabilities };
  }
  parsePushReport(bytes) {
    if (!bytes.length) return null;
    let text;
    if (/^[0-9a-fA-F]{4}$/.test(bytes.subarray(0, 4).toString("ascii"))) {
      const packets = decodePktLines(bytes);
      text = packets.filter((packet) => packet.kind === "data").map((packet) => packet.kind === "data" ? packet.payload.toString("utf8") : "").join("");
    } else {
      text = bytes.toString("utf8");
    }
    let unpackOk = false;
    let unpackDetail = "missing";
    const refs = [];
    for (const rawLine of text.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (!line) continue;
      if (line.startsWith("unpack ")) {
        const detail2 = line.slice("unpack ".length);
        unpackOk = detail2 === "ok";
        unpackDetail = detail2;
      } else if (line.startsWith("ok ")) {
        refs.push({ ref: line.slice(3), ok: true, reason: "", options: /* @__PURE__ */ new Map() });
      } else if (line.startsWith("ng ")) {
        const rest = line.slice(3);
        const space = rest.indexOf(" ");
        if (space < 0) throw new GitProtocolError(`bad ng line ${JSON.stringify(line)}`, "push-report");
        refs.push({ ref: rest.slice(0, space), ok: false, reason: rest.slice(space + 1), options: /* @__PURE__ */ new Map() });
      } else if (line.startsWith("option ")) {
        const rest = line.slice(7);
        const space = rest.indexOf(" ");
        const last = refs[refs.length - 1];
        if (!last) throw new GitProtocolError(`report option with no ref: ${JSON.stringify(line)}`, "push-report");
        if (space < 0) last.options.set(rest, "");
        else last.options.set(rest.slice(0, space), rest.slice(space + 1));
      } else {
        throw new GitProtocolError(`bad report-status line ${JSON.stringify(line.slice(0, 80))}`, "push-report");
      }
    }
    if (unpackDetail === "missing") throw new GitProtocolError("report-status has no unpack line", "push-report");
    return { unpackOk, unpackDetail, refs };
  }
  /**
   * Create a repo through the entry's REST surface (`POST /api/v3/user/repos`), the one agreed
   * creation path in the rules: a smart-HTTP push cannot invent a repository. A 422 that says the
   * repo already exists is accepted, so a re-run against a live server is idempotent.
   */
  async createRepo(owner, name, options = {}) {
    const url = `${this.baseUrl}/api/v3/user/repos`;
    if (!url.startsWith(`${this.baseUrl}/`)) throw new GitProtocolError("repo creation would leave the entry base URL", "url");
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const box = withTimeout(options.signal ?? this.parentSignal, timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "User-Agent": this.agent,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          ...this.token ? { Authorization: `Bearer ${this.token}` } : {}
        },
        body: Buffer.from(JSON.stringify({ name, description: `git conformance for ${owner}/${name}`, private: true, auto_init: false }), "utf8"),
        signal: box.signal,
        redirect: "error"
      });
      if (response.status === 201 || response.status === 200) {
        await response.arrayBuffer().catch(() => void 0);
        return;
      }
      let body = "";
      try {
        body = snippet(await response.text());
      } catch {
        body = "";
      }
      if (response.status === 422 && /already exists/i.test(body)) return;
      throw new GitHttpError(
        `POST /api/v3/user/repos for ${owner}/${name} returned HTTP ${response.status}${body ? `: ${body}` : ""}`,
        url,
        response.status,
        body
      );
    } catch (err) {
      if (box.timedOut()) throw new GitProtocolError(`repo creation timed out after ${timeoutMs} ms`, "timeout");
      throw err;
    } finally {
      box.dispose();
    }
  }
  /** A convenience health probe: true when a repo's upload-pack advertisement answers 200. */
  async repoExists(owner, repo, options = {}) {
    const raw = await this.infoRefs(owner, repo, "git-upload-pack", options);
    return raw.status === 200;
  }
  /**
   * POST a service body without validating the response: the conformance checks use it to hand the
   * server a malformed pkt-line and then prove the server still serves a healthy clone.
   */
  async postRaw(owner, repo, service, body, options = {}) {
    const url = this.repoUrl(owner, repo, `/${service}`);
    const response = await this.request(url, {
      ...options,
      method: "POST",
      contentType: `application/x-${service}-request`,
      accept: `application/x-${service}-result`,
      body: Buffer.from(body)
    });
    let text = "";
    try {
      text = snippet(await response.text(), 200);
    } catch {
      text = "";
    }
    return { status: response.status, contentType: response.headers.get("content-type"), bodySnippet: text };
  }
};

// env/src/checks-git.ts
var GIT_GROUP_SIZE = 30;
var MAX_DETAIL = 600;
var specs = [];
function detail(ok, text) {
  const bounded = text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}…` : text;
  return ok ? pass(bounded) : fail(bounded);
}
function describeError(err) {
  if (err instanceof GitProtocolError) return `${err.message} [${err.code}]`;
  if (err instanceof GitHttpError) return `${err.message} [HTTP ${err.status}]`;
  if (err instanceof Error) return `threw ${err.name}: ${err.message}`;
  return `threw ${String(err)}`;
}
function define(slug2, title, timeoutMs, body) {
  specs.push({
    id: checkId("git", slug2),
    group: "git",
    title,
    timeoutMs,
    fn: async (context) => {
      try {
        return await body(context);
      } catch (err) {
        return fail(describeError(err));
      }
    }
  });
}
function scenarioFile(scenario, index, revision = 0) {
  const blob = scenario.blobs[index % scenario.blobs.length];
  const body = revision === 0 ? blob.content : `${blob.content}
# revision ${revision}
`;
  return { path: blob.path, data: Buffer.from(body, "utf8") };
}
function scenarioSizedFile(scenario, index, revision, size) {
  const blob = scenario.blobs[index % scenario.blobs.length];
  const unit = `${blob.content}
`;
  const parts = [];
  let length = 0;
  while (length < size) {
    parts.push(unit);
    length += Buffer.byteLength(unit);
  }
  const body = Buffer.from(parts.join(""), "utf8").subarray(0, size);
  return {
    path: blob.path,
    data: Buffer.concat([body, Buffer.from(`
# revision ${revision}
`, "utf8")])
  };
}
function scenarioManyFiles(scenario, count, revision) {
  const files = [];
  for (let index = 0; index < count; index += 1) {
    const basePath = scenario.filePaths[index % scenario.filePaths.length];
    const round = Math.floor(index / scenario.filePaths.length);
    const path = round === 0 ? basePath : basePath.replace(/(\.[^./]+)?$/, `.${round}$1`);
    const blob = scenario.blobs[index % scenario.blobs.length];
    files.push({ path, data: Buffer.from(`${blob.content}
file ${index} revision ${revision}
`, "utf8") });
  }
  return files;
}
function scenarioCommitMeta(scenario, index, revision = 0) {
  const template = scenario.commits[index % scenario.commits.length];
  return {
    message: revision === 0 ? template.message : `${template.message}

revision ${revision}`,
    timestamp: template.epochSec + revision,
    author: `${scenario.viewer.name} <${scenario.viewer.email}>`
  };
}
var LocalRepo = class {
  objects = /* @__PURE__ */ new Map();
  refs = /* @__PURE__ */ new Map();
  lookup = (oid) => this.objects.get(oid);
  put(type, data) {
    const oid = hashObject(type, data);
    if (!this.objects.has(oid)) this.objects.set(oid, { type, data });
    return oid;
  }
  blob(data) {
    return this.put("blob", typeof data === "string" ? Buffer.from(data, "utf8") : data);
  }
  treeFromFiles(files) {
    const make = () => ({ files: /* @__PURE__ */ new Map(), dirs: /* @__PURE__ */ new Map() });
    const root = make();
    for (const file of files) {
      const segments = file.path.split("/");
      let node = root;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const name = segments[index];
        if (!node.dirs.has(name)) node.dirs.set(name, make());
        node = node.dirs.get(name);
      }
      node.files.set(segments[segments.length - 1], file.data);
    }
    const build = (node) => {
      const entries = [];
      for (const [name, data] of [...node.files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        entries.push({ mode: "100644", name, oid: this.blob(data) });
      }
      for (const [name, child] of [...node.dirs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        entries.push({ mode: "40000", name, oid: build(child) });
      }
      return this.put("tree", buildTree(entries));
    };
    return build(root);
  }
  commit(files, meta, parents = []) {
    const tree = this.treeFromFiles(files);
    const data = buildCommit({
      tree,
      parents,
      message: meta.message.endsWith("\n") ? meta.message : `${meta.message}
`,
      author: meta.author,
      committer: meta.author,
      timestamp: meta.timestamp
    });
    return this.put("commit", data);
  }
  tag(name, target, meta) {
    const data = buildTag({
      object: target,
      type: "commit",
      tag: name,
      message: meta.message.endsWith("\n") ? meta.message : `${meta.message}
`,
      tagger: meta.author,
      timestamp: meta.timestamp
    });
    return this.put("tag", data);
  }
  reachable(tips) {
    return collectReachable(tips, this.lookup);
  }
};
async function harness(context, slug2) {
  const client = new GitClient({
    baseUrl: context.baseUrl,
    token: context.token,
    signal: context.signal,
    timeoutMs: Math.max(1, Math.min(context.timeoutMs || DEFAULT_GIT_TIMEOUT_MS, DEFAULT_GIT_TIMEOUT_MS))
  });
  const owner = context.scenario.viewer.login;
  const repo = `gitconf-${slug2}`;
  await client.createRepo(owner, repo, { signal: context.signal });
  return { context, client, owner, repo, local: new LocalRepo() };
}
function reportFor(result, ref) {
  return result.report?.refs.find((entry) => entry.ref === ref);
}
function pushFailure(result) {
  if (!result.report) return "the server returned no report-status (it did not advertise report-status)";
  if (!result.report.unpackOk) return `unpack failed: ${result.report.unpackDetail}`;
  const bad = result.report.refs.filter((entry) => !entry.ok);
  if (bad.length) return bad.map((entry) => `${entry.ref}: ${entry.reason}`).join("; ");
  return `report-status: ${JSON.stringify(result.report.refs)}`;
}
async function pushRefs(harnessed, commands, options = {}) {
  let objects = options.objects;
  if (objects === void 0 && options.pack === void 0) {
    const advertisement = await harnessed.client.advertisement(harnessed.owner, harnessed.repo, "git-receive-pack", {
      signal: harnessed.context.signal
    });
    if (advertisement.protocol !== 0) {
      throw new GitProtocolError("receive-pack answered a non-v0 advertisement", "push-protocol");
    }
    const onServer = /* @__PURE__ */ new Set();
    let complete = true;
    for (const ref of advertisement.refs) {
      if (!ref.oid || ref.oid === ZERO_OID) continue;
      try {
        for (const oid of collectReachable([ref.oid], harnessed.local.lookup)) onServer.add(oid);
      } catch {
        complete = false;
        break;
      }
    }
    if (!complete) onServer.clear();
    const send = [];
    const newTips = commands.filter((command) => command.newOid !== ZERO_OID).map((command) => command.newOid);
    for (const oid of collectReachable(newTips, harnessed.local.lookup)) {
      if (onServer.has(oid)) continue;
      const object = harnessed.local.objects.get(oid);
      if (object) send.push(object);
    }
    objects = send;
  }
  const result = await harnessed.client.push(harnessed.owner, harnessed.repo, commands, {
    objects,
    pack: options.pack,
    signal: harnessed.context.signal
  });
  if (result.report) {
    for (const report of result.report.refs) {
      if (!report.ok) continue;
      const command = commands.find((candidate) => candidate.ref === report.ref);
      if (!command) continue;
      if (command.newOid === ZERO_OID) harnessed.local.refs.delete(report.ref);
      else harnessed.local.refs.set(report.ref, command.newOid);
    }
  }
  return result;
}
function hashMismatches(objects) {
  const bad = [];
  for (const [oid, object] of objects) if (hashObject(object.type, object.data) !== oid) bad.push(oid);
  return bad;
}
function missingClosure(objects, roots) {
  try {
    collectReachable(roots, (oid) => objects.get(oid));
    return [];
  } catch (err) {
    if (err instanceof GitProtocolError && err.code === "missing-object") return [err.message];
    throw err;
  }
}
function compareReachable(local, actual, roots) {
  const expected = [...local.reachable(roots)].sort();
  const missing = [];
  const different = [];
  for (const oid of expected) {
    const found = actual.get(oid);
    if (!found) {
      missing.push(oid);
      continue;
    }
    const original = local.objects.get(oid);
    if (!original.data.equals(found.data) || original.type !== found.type) different.push(oid);
  }
  return { expected: expected.length, missing, different };
}
function short(oids, max = 3) {
  if (!oids.length) return "";
  const head = oids.slice(0, max).map((oid) => oid.slice(0, 8)).join(",");
  return oids.length > max ? `${head},…(${oids.length})` : head;
}
async function repoWithInitialCommit(context, slug2, files) {
  const harnessed = await harness(context, slug2);
  const meta = scenarioCommitMeta(context.scenario, 0, 0);
  const tip = harnessed.local.commit(files ?? [scenarioFile(context.scenario, 0, 0)], meta);
  const pushed = await pushRefs(harnessed, [{ oldOid: ZERO_OID, newOid: tip, ref: "refs/heads/main" }]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true) {
    throw new Error(`setup push to ${harnessed.repo} failed: ${pushFailure(pushed)}`);
  }
  harnessed.local.refs.set("refs/heads/main", tip);
  return { harnessed, tip };
}
define("advertise-v2", "protocol v2 capability advertisement is served and well formed", 5e3, async (context) => {
  const { harnessed } = await repoWithInitialCommit(context, "advertise-v2");
  const advertisement = await harnessed.client.advertisement(harnessed.owner, harnessed.repo, "git-upload-pack", {
    signal: context.signal
  });
  if (advertisement.protocol !== 2) {
    return detail(false, "the server answered protocol v0; the rules require Git-Protocol: version=2 to be honoured");
  }
  const capabilities = [...advertisement.capabilities.keys()].sort();
  const missing = ["fetch", "ls-refs"].filter((name) => !advertisement.capabilities.has(name));
  if (missing.length) return detail(false, `the v2 advertisement is missing ${missing.join(", ")} (saw ${capabilities.join(", ")})`);
  const format = advertisement.capabilities.get("object-format");
  if (format && format !== "sha1") return detail(false, `object-format ${format}: the rules require sha1`);
  return detail(true, `protocol v2; capabilities: ${capabilities.join(", ")}`);
});
define("advertise-receive-pack", "receive-pack serves a v0 ref advertisement with push capabilities", 5e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "advertise-receive-pack");
  const advertisement = await harnessed.client.advertisement(harnessed.owner, harnessed.repo, "git-receive-pack", {
    signal: context.signal
  });
  if (advertisement.protocol !== 0) return detail(false, `receive-pack answered protocol v${advertisement.protocol}; it is v0-only`);
  const main2 = advertisement.refs.find((ref) => ref.name === "refs/heads/main");
  if (!main2 || main2.oid !== tip) {
    return detail(false, `the advertisement does not list refs/heads/main at ${short([tip])} (refs: ${advertisement.refs.map((ref) => ref.name).join(", ") || "none"})`);
  }
  const required = ["report-status", "side-band-64k", "delete-refs"];
  const missing = required.filter((name) => !advertisement.capabilities.has(name));
  if (missing.length) {
    return detail(false, `receive-pack is missing ${missing.join(", ")} (saw ${[...advertisement.capabilities.keys()].sort().join(", ")})`);
  }
  return detail(true, `v0 advertisement lists ${advertisement.refs.length} ref(s); capabilities: ${[...advertisement.capabilities.keys()].sort().join(", ")}`);
});
define("advertise-headers", "info/refs answers the smart-HTTP content type and preamble", 5e3, async (context) => {
  const { harnessed } = await repoWithInitialCommit(context, "advertise-headers");
  const v0Client = new GitClient({
    baseUrl: context.baseUrl,
    token: context.token,
    signal: context.signal,
    timeoutMs: Math.min(context.timeoutMs || DEFAULT_GIT_TIMEOUT_MS, DEFAULT_GIT_TIMEOUT_MS),
    gitProtocol: 0
  });
  const v0 = await v0Client.infoRefs(harnessed.owner, harnessed.repo, "git-upload-pack", { signal: context.signal });
  const v2 = await harnessed.client.infoRefs(harnessed.owner, harnessed.repo, "git-upload-pack", { signal: context.signal });
  const receive = await harnessed.client.infoRefs(harnessed.owner, harnessed.repo, "git-receive-pack", { signal: context.signal });
  const problems = [];
  for (const [label, raw, expected] of [
    ["v0 upload-pack", v0, "application/x-git-upload-pack-advertisement"],
    ["v2 upload-pack", v2, "application/x-git-upload-pack-advertisement"],
    ["receive-pack", receive, "application/x-git-receive-pack-advertisement"]
  ]) {
    if (raw.status !== 200) problems.push(`${label} returned HTTP ${raw.status}`);
    if (!raw.contentType || !raw.contentType.toLowerCase().includes(expected)) {
      problems.push(`${label} content-type ${JSON.stringify(raw.contentType)} is not ${expected}`);
    }
  }
  const firstLine = (raw) => {
    const packet = raw.packets.find((candidate) => candidate.kind === "data");
    return packet && packet.kind === "data" ? packet.payload.toString("utf8").replace(/\n$/, "") : "";
  };
  const v0Line = firstLine(v0);
  if (v0Line !== "# service=git-upload-pack" && v0Line !== "version 2") problems.push(`the v0 request's body starts with ${JSON.stringify(v0Line)}, neither the service preamble nor "version 2"`);
  if (firstLine(receive) !== "# service=git-receive-pack") problems.push(`the receive-pack body starts with ${JSON.stringify(firstLine(receive))}, not the service preamble`);
  const v2Line = firstLine(v2);
  const v2IsV0 = v2Line === "# service=git-upload-pack";
  if (!v2IsV0 && v2Line !== "version 2") problems.push(`the v2 request's body starts with ${JSON.stringify(v2Line)}, not "version 2"`);
  if (problems.length) return detail(false, problems.join("; "));
  return detail(true, `content types and smart-HTTP preambles are correct for v0, v2 and receive-pack${v2IsV0 ? " (the server answered v0 to the v2 request; git.advertise-v2 owns that)" : ""}`);
});
define("unknown-repo-404", "a missing repository advertises 404 and the server stays up", 5e3, async (context) => {
  const { harnessed } = await repoWithInitialCommit(context, "unknown-repo");
  const missingName = `${harnessed.repo}-missing`;
  const upload = await harnessed.client.infoRefs(harnessed.owner, missingName, "git-upload-pack", { signal: context.signal });
  const receive = await harnessed.client.infoRefs(harnessed.owner, missingName, "git-receive-pack", { signal: context.signal });
  if (upload.status !== 404) return detail(false, `upload-pack advertisement of a missing repo returned HTTP ${upload.status}, not 404`);
  if (receive.status !== 404) return detail(false, `receive-pack advertisement of a missing repo returned HTTP ${receive.status}, not 404`);
  const healthy = await harnessed.client.infoRefs(harnessed.owner, harnessed.repo, "git-upload-pack", { signal: context.signal });
  if (healthy.status !== 200) return detail(false, `the server stopped serving a known repo afterwards (HTTP ${healthy.status})`);
  return detail(true, "a missing repo answers 404 on both services; a known repo still answers 200");
});
define("ls-refs", "v2 ls-refs reports refs, HEAD symref and peeled tags", 8e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "ls-refs");
  const meta = scenarioCommitMeta(context.scenario, 1, 0);
  const second = harnessed.local.commit([scenarioFile(context.scenario, 1, 1)], meta, [tip]);
  const tagMeta = scenarioCommitMeta(context.scenario, 2, 0);
  const tag = harnessed.local.tag("v1", second, tagMeta);
  const pushed = await pushRefs(harnessed, [
    { oldOid: tip, newOid: second, ref: "refs/heads/main" },
    { oldOid: ZERO_OID, newOid: tag, ref: "refs/tags/v1" }
  ]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true || reportFor(pushed, "refs/tags/v1")?.ok !== true) {
    return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  }
  const listed = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, {
    signal: context.signal,
    symrefs: true,
    peel: true
  });
  if (listed.protocol !== 2) return detail(false, `ls-refs needs protocol v2; the server answered v${listed.protocol}`);
  const main2 = listed.refs.find((ref) => ref.name === "refs/heads/main");
  if (!main2 || main2.oid !== second) return detail(false, `refs/heads/main is not ${short([second])} in ls-refs`);
  const head = listed.refs.find((ref) => ref.name === "HEAD");
  if (!head || head.symrefTarget !== "refs/heads/main") {
    return detail(false, `HEAD does not report symref-target refs/heads/main (saw ${JSON.stringify(head?.symrefTarget ?? null)})`);
  }
  const tagRef = listed.refs.find((ref) => ref.name === "refs/tags/v1");
  if (!tagRef || tagRef.oid !== tag) return detail(false, "refs/tags/v1 does not point at the tag object");
  if (tagRef.peeled !== second) return detail(false, `refs/tags/v1 peels to ${short([tagRef.peeled ?? "none"])}, not ${short([second])}`);
  return detail(true, `ls-refs returned ${listed.refs.length} ref(s); HEAD→refs/heads/main; refs/tags/v1 peeled to its commit`);
});
define("ls-refs-prefix", "v2 ls-refs honours ref-prefix filtering", 8e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "ls-refs-prefix");
  const tag = harnessed.local.tag("v1", tip, scenarioCommitMeta(context.scenario, 1, 0));
  const pushed = await pushRefs(harnessed, [{ oldOid: ZERO_OID, newOid: tag, ref: "refs/tags/v1" }]);
  if (reportFor(pushed, "refs/tags/v1")?.ok !== true) return detail(false, `setup tag push failed: ${pushFailure(pushed)}`);
  const heads = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal, prefixes: ["refs/heads/"] });
  if (heads.protocol !== 2) return detail(false, `ref-prefix needs protocol v2; the server answered v${heads.protocol}`);
  const tags = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal, prefixes: ["refs/tags/"] });
  const none = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, {
    signal: context.signal,
    prefixes: ["refs/does-not-exist/"]
  });
  const problems = [];
  if (heads.rawRefs.some((ref) => !ref.name.startsWith("refs/heads/"))) problems.push(`the server answered the refs/heads/ prefix with ${heads.rawRefs.map((ref) => ref.name).join(", ")}`);
  if (!heads.refs.some((ref) => ref.name === "refs/heads/main" && ref.oid === tip)) problems.push("refs/heads/main is missing from the heads prefix");
  if (tags.rawRefs.some((ref) => !ref.name.startsWith("refs/tags/"))) problems.push(`the server answered the refs/tags/ prefix with ${tags.rawRefs.map((ref) => ref.name).join(", ")}`);
  if (!tags.refs.some((ref) => ref.name === "refs/tags/v1" && ref.oid === tag)) problems.push("refs/tags/v1 is missing from the tags prefix");
  if (none.rawRefs.length !== 0) problems.push(`an unmatched prefix returned ${none.rawRefs.length} ref(s)`);
  if (problems.length) return detail(false, problems.join("; "));
  return detail(true, `heads=${heads.refs.length}, tags=${tags.refs.length}, unmatched=0`);
});
define("clone-empty", "a repository with no refs clones as an empty repository", 8e3, async (context) => {
  const harnessed = await harness(context, "clone-empty");
  const advertisement = await harnessed.client.advertisement(harnessed.owner, harnessed.repo, "git-upload-pack", {
    signal: context.signal
  });
  const refs = advertisement.protocol === 2 ? (await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal })).refs : advertisement.refs;
  const realRefs = refs.filter((ref) => ref.name.startsWith("refs/"));
  if (realRefs.length) return detail(false, `a fresh repo already advertises ${realRefs.map((ref) => ref.name).join(", ")}`);
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (clone.objects.size !== 0) return detail(false, `an empty clone fetched ${clone.objects.size} object(s)`);
  if (clone.pack !== null && clone.packBytes > 0) return detail(false, `an empty clone fetched a ${clone.packBytes}-byte pack`);
  const head = clone.head ?? refs.find((ref) => ref.name === "HEAD")?.symrefTarget ?? null;
  return detail(true, `0 refs; ${head ? `unborn HEAD → ${head}` : "no HEAD symref"}; no objects transferred`);
});
define("push-first-commit", "a first commit pushes to an unborn branch and becomes the tip", 8e3, async (context) => {
  const harnessed = await harness(context, "push-first-commit");
  const tip = harnessed.local.commit([scenarioFile(context.scenario, 0, 0)], scenarioCommitMeta(context.scenario, 0, 0));
  const pushed = await pushRefs(harnessed, [{ oldOid: ZERO_OID, newOid: tip, ref: "refs/heads/main" }]);
  if (pushed.report?.unpackOk !== true) return detail(false, `unpack failed: ${pushed.report?.unpackDetail ?? "no report"}`);
  if (!reportFor(pushed, "refs/heads/main")?.ok) return detail(false, `report-status did not accept the first push: ${pushFailure(pushed)}`);
  const after = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal });
  const main2 = after.refs.find((ref) => ref.name === "refs/heads/main");
  if (!main2 || main2.oid !== tip) return detail(false, "refs/heads/main does not advertise the pushed commit");
  const head = after.refs.find((ref) => ref.name === "HEAD");
  if (!head || head.symrefTarget !== "refs/heads/main") return detail(false, "HEAD does not resolve to refs/heads/main after the first push");
  return detail(true, `unborn branch accepted ${short([tip])}; HEAD → refs/heads/main`);
});
define("clone-object-hashes", "a full clone verifies object-for-object", 12e3, async (context) => {
  const files = [scenarioFile(context.scenario, 0, 0), scenarioFile(context.scenario, 1, 0)];
  const { harnessed, tip } = await repoWithInitialCommit(context, "clone-object-hashes", files);
  const second = harnessed.local.commit(
    [scenarioFile(context.scenario, 0, 1), scenarioFile(context.scenario, 1, 0)],
    scenarioCommitMeta(context.scenario, 1, 1),
    [tip]
  );
  const third = harnessed.local.commit(
    [scenarioFile(context.scenario, 0, 1), scenarioFile(context.scenario, 1, 2), scenarioFile(context.scenario, 2, 0)],
    scenarioCommitMeta(context.scenario, 2, 2),
    [second]
  );
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: third, ref: "refs/heads/main" }]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true) return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  const bad = hashMismatches(clone.objects);
  if (bad.length) return detail(false, `${bad.length} cloned object(s) do not recompute to their id: ${short(bad)}`);
  if (!clone.objects.has(third)) return detail(false, `the clone is missing the tip ${short([third])}`);
  const missing = missingClosure(clone.objects, [third]);
  if (missing.length) return detail(false, `the clone's reachable graph is incomplete: ${missing[0]}`);
  const expected = harnessed.local.reachable([third]);
  const absent = [...expected].filter((oid) => !clone.objects.has(oid));
  if (absent.length) return detail(false, `${absent.length} reachable object(s) are missing from the clone: ${short(absent)}`);
  return detail(true, `cloned ${clone.objects.size} objects (${clone.deltaCount} deltas, ${clone.packBytes} bytes); every SHA-1 recomputed; the closure of ${short([third])} is complete`);
});
define("clone-blob-bytes", "every cloned blob equals the pushed bytes", 12e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "clone-blob-bytes", [
    scenarioSizedFile(context.scenario, 0, 0, 4096),
    scenarioFile(context.scenario, 1, 0)
  ]);
  const second = harnessed.local.commit(
    [scenarioSizedFile(context.scenario, 0, 1, 4096), scenarioFile(context.scenario, 1, 0), scenarioFile(context.scenario, 2, 0)],
    scenarioCommitMeta(context.scenario, 1, 1),
    [tip]
  );
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: second, ref: "refs/heads/main" }]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true) return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  const comparison = compareReachable(harnessed.local, clone.objects, [second]);
  if (comparison.missing.length) return detail(false, `${comparison.missing.length} reachable object(s) missing: ${short(comparison.missing)}`);
  if (comparison.different.length) return detail(false, `${comparison.different.length} object(s) differ byte-for-byte: ${short(comparison.different)}`);
  const blobs = [...clone.objects].filter(([, object]) => object.type === "blob");
  return detail(true, `${blobs.length} blob(s) byte-identical across ${comparison.expected} objects`);
});
define("clone-tree-entries", "cloned trees round-trip paths, modes and nested directories", 12e3, async (context) => {
  const scenario = context.scenario;
  const nested = scenario.blobs[0].path.includes("/") ? scenario.blobs[0].path : `src/${scenario.blobs[0].path}`;
  const files = [
    { path: nested, data: Buffer.from(scenario.blobs[0].content, "utf8") },
    scenarioFile(scenario, 1, 0),
    scenarioFile(scenario, 2, 0),
    scenarioFile(scenario, 3, 0)
  ];
  const { harnessed, tip } = await repoWithInitialCommit(context, "clone-tree-entries", files);
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  const commit = clone.objects.get(tip);
  if (!commit) return detail(false, "the tip commit is missing from the clone");
  const rootTree = parseCommit(commit.data).tree;
  const root = clone.objects.get(rootTree);
  if (!root) return detail(false, "the root tree is missing from the clone");
  const entries = parseTree(root.data);
  const names = entries.map((entry) => entry.name).sort();
  const expectedNames = [...new Set(files.map((file) => file.path.split("/")[0]))].sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    return detail(false, `the root tree entries are ${JSON.stringify(names)}, expected ${JSON.stringify(expectedNames)}`);
  }
  const firstDir = expectedNames.find((name) => files.some((file) => file.path.startsWith(`${name}/`)));
  if (firstDir) {
    const dirEntry = entries.find((entry) => entry.name === firstDir);
    if (dirEntry.mode !== "40000") return detail(false, `${firstDir} has mode ${dirEntry.mode}, not 40000`);
    const dirTree = clone.objects.get(dirEntry.oid);
    if (!dirTree) return detail(false, `the ${firstDir} tree object is missing`);
    const dirNames = parseTree(dirTree.data).map((entry) => entry.name).sort();
    const expectedDirNames = files.filter((file) => file.path.startsWith(`${firstDir}/`)).map((file) => file.path.slice(firstDir.length + 1).split("/")[0]);
    if (JSON.stringify(dirNames) !== JSON.stringify([...new Set(expectedDirNames)].sort())) {
      return detail(false, `the ${firstDir} tree entries are ${JSON.stringify(dirNames)}`);
    }
  }
  const comparison = compareReachable(harnessed.local, clone.objects, [tip]);
  if (comparison.different.length) return detail(false, `${comparison.different.length} tree/object(s) differ byte-for-byte`);
  return detail(true, `${entries.length} root entries, nested ${firstDir ?? "(flat)"} present, every tree byte-identical`);
});
define("clone-commit-bytes", "commit objects round-trip byte-exactly with their metadata", 12e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "clone-commit-bytes", [scenarioFile(context.scenario, 0, 0)]);
  const meta = scenarioCommitMeta(context.scenario, 1, 3);
  const second = harnessed.local.commit([scenarioFile(context.scenario, 0, 1)], meta, [tip]);
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: second, ref: "refs/heads/main" }]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true) return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  const cloned = clone.objects.get(second);
  if (!cloned) return detail(false, "the tip commit is missing from the clone");
  if (!harnessed.local.objects.get(second).data.equals(cloned.data)) {
    return detail(false, "the tip commit bytes differ from the pushed bytes");
  }
  const parsed = parseCommit(cloned.data);
  if (parsed.parents.length !== 1 || parsed.parents[0] !== tip) return detail(false, `the parent list is ${JSON.stringify(parsed.parents)}`);
  const expectedMessage = meta.message.endsWith("\n") ? meta.message : `${meta.message}
`;
  if (parsed.message !== expectedMessage) {
    return detail(false, `the message is ${JSON.stringify(parsed.message)}`);
  }
  const stamp = `${meta.timestamp} +0000`;
  if (!parsed.author.includes(stamp) || !parsed.committer.includes(stamp)) {
    return detail(false, `the author/committer timestamps are ${JSON.stringify([parsed.author, parsed.committer])}`);
  }
  if (!parsed.author.includes(context.scenario.viewer.email)) {
    return detail(false, `the author identity is ${JSON.stringify(parsed.author)}`);
  }
  return detail(true, "the tip commit bytes, parents, message and author/committer lines round-trip exactly");
});
define("clone-annotated-tag", "an annotated tag object round-trips and peels to its commit", 1e4, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "clone-annotated-tag");
  const tagMeta = scenarioCommitMeta(context.scenario, 1, 0);
  const tag = harnessed.local.tag("v1", tip, tagMeta);
  const pushed = await pushRefs(harnessed, [{ oldOid: ZERO_OID, newOid: tag, ref: "refs/tags/v1" }]);
  if (reportFor(pushed, "refs/tags/v1")?.ok !== true) return detail(false, `tag push failed: ${pushFailure(pushed)}`);
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  const cloned = clone.objects.get(tag);
  if (!cloned) return detail(false, "the tag object is missing from the clone");
  if (!cloned.data.equals(harnessed.local.objects.get(tag).data)) return detail(false, "the tag object bytes differ");
  const parsed = parseTag(cloned.data);
  if (parsed.object !== tip || parsed.type !== "commit" || parsed.tag !== "v1") {
    return detail(false, `the tag headers are ${JSON.stringify({ object: parsed.object, type: parsed.type, tag: parsed.tag })}`);
  }
  if (!parsed.tagger.includes(context.scenario.viewer.email)) return detail(false, `the tagger is ${JSON.stringify(parsed.tagger)}`);
  const listed = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal, peel: true });
  const ref = listed.refs.find((entry) => entry.name === "refs/tags/v1");
  if (!ref || ref.oid !== tag) return detail(false, "refs/tags/v1 does not advertise the tag object");
  if (ref.peeled !== tip) return detail(false, `refs/tags/v1 peels to ${short([ref.peeled ?? "none"])}, not ${short([tip])}`);
  return detail(true, `tag object byte-identical; object/type/tag headers correct; peeled to ${short([tip])}`);
});
define("fetch-incremental", "an incremental fetch sends only the new objects and advances the tip", 12e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "fetch-incremental", [
    scenarioFile(context.scenario, 0, 0),
    scenarioFile(context.scenario, 1, 0)
  ]);
  const firstClone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (!firstClone.objects.has(tip)) return detail(false, "the first clone is missing the tip");
  const second = harnessed.local.commit(
    [scenarioFile(context.scenario, 0, 1), scenarioFile(context.scenario, 1, 0), scenarioFile(context.scenario, 2, 0)],
    scenarioCommitMeta(context.scenario, 1, 1),
    [tip]
  );
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: second, ref: "refs/heads/main" }]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true) return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  const fetched = await harnessed.client.fetch(harnessed.owner, harnessed.repo, {
    wants: [second],
    haves: [tip],
    haveObjects: firstClone.objects,
    signal: context.signal
  });
  if (!fetched.objects.has(second)) return detail(false, "the incremental fetch did not deliver the new tip");
  if (fetched.objects.has(tip)) return detail(false, `the incremental fetch re-sent the old tip ${short([tip])}`);
  const bad = hashMismatches(fetched.objects);
  if (bad.length) return detail(false, `${bad.length} fetched object(s) do not recompute to their id`);
  const old = harnessed.local.reachable([tip]);
  const expectedNew = [...harnessed.local.reachable([second])].filter((oid) => !old.has(oid));
  const missing = expectedNew.filter((oid) => !fetched.objects.has(oid));
  if (missing.length) return detail(false, `${missing.length} new object(s) were not delivered: ${short(missing)}`);
  const extraOld = [...fetched.objects.keys()].filter((oid) => old.has(oid));
  if (extraOld.length) return detail(false, `${extraOld.length} already-held object(s) were re-sent: ${short(extraOld)}`);
  return detail(true, `${fetched.objects.size} new object(s) (${fetched.packBytes} bytes, ${fetched.deltaCount} deltas); the old tip was not re-sent`);
});
define("fetch-nothing-new", "a fetch with the tip already held transfers no objects", 1e4, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "fetch-nothing-new");
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (!clone.objects.has(tip)) return detail(false, "the clone is missing the tip");
  const fetched = await harnessed.client.fetch(harnessed.owner, harnessed.repo, {
    wants: [tip],
    haves: [tip],
    haveObjects: clone.objects,
    signal: context.signal
  });
  if (fetched.objects.size !== 0) return detail(false, `the fetch delivered ${fetched.objects.size} object(s) that were already held`);
  return detail(true, `no objects delivered (a ${fetched.packBytes}-byte pack with no entries)`);
});
define("fetch-shallow-depth1", "a depth-1 shallow clone lands the tip only", 12e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "fetch-shallow-depth1", [scenarioFile(context.scenario, 0, 0)]);
  const second = harnessed.local.commit([scenarioFile(context.scenario, 1, 0)], scenarioCommitMeta(context.scenario, 1, 1), [tip]);
  const third = harnessed.local.commit([scenarioFile(context.scenario, 2, 0)], scenarioCommitMeta(context.scenario, 2, 2), [second]);
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: third, ref: "refs/heads/main" }]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true) return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  const shallow = await harnessed.client.clone(harnessed.owner, harnessed.repo, { depth: 1, signal: context.signal });
  if (!shallow.objects.has(third)) return detail(false, "the shallow clone is missing the tip");
  if (shallow.objects.has(second) || shallow.objects.has(tip)) {
    return detail(false, `the shallow clone carried history beyond depth 1 (${shallow.objects.has(second) ? "parent" : ""}${shallow.objects.has(tip) ? " grandparent" : ""})`);
  }
  if (!shallow.objects.get(third).data.equals(harnessed.local.objects.get(third).data)) return detail(false, "the shallow tip commit bytes differ");
  const commit = parseCommit(shallow.objects.get(third).data);
  const tree = shallow.objects.get(commit.tree);
  if (!tree) return detail(false, "the tip's tree is missing from the shallow clone");
  const missingBlobs = parseTree(tree.data).filter((entry) => !shallow.objects.has(entry.oid));
  if (missingBlobs.length) return detail(false, `the tip's tree names ${missingBlobs.length} missing blob(s)`);
  if (!shallow.shallow.includes(third)) return detail(false, `shallow-info did not name the tip (shallow: ${shallow.shallow.join(",") || "none"})`);
  return detail(true, `tip ${short([third])} only; parent and grandparent absent; shallow-info names the tip; the tip's tree (${parseTree(tree.data).length} entries) and blobs are present`);
});
define("fetch-shallow-deepen", "deepen 2 extends a shallow clone by exactly one generation", 12e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "fetch-shallow-deepen", [scenarioFile(context.scenario, 0, 0)]);
  const second = harnessed.local.commit([scenarioFile(context.scenario, 1, 0)], scenarioCommitMeta(context.scenario, 1, 1), [tip]);
  const third = harnessed.local.commit([scenarioFile(context.scenario, 2, 0)], scenarioCommitMeta(context.scenario, 2, 2), [second]);
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: third, ref: "refs/heads/main" }]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true) return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  const shallow = await harnessed.client.clone(harnessed.owner, harnessed.repo, { depth: 1, signal: context.signal });
  if (!shallow.objects.has(third) || shallow.objects.has(second)) return detail(false, "the depth-1 setup clone is not at depth 1");
  const deepened = await harnessed.client.fetch(harnessed.owner, harnessed.repo, {
    wants: [third],
    haves: [third],
    shallow: shallow.shallow,
    depth: 2,
    haveObjects: shallow.objects,
    signal: context.signal
  });
  if (!deepened.objects.has(second)) return detail(false, "deepen 2 did not deliver the parent commit");
  if (!deepened.objects.get(second).data.equals(harnessed.local.objects.get(second).data)) {
    return detail(false, "the deepened parent commit bytes differ");
  }
  if (deepened.objects.has(tip)) return detail(false, `deepen 2 delivered the grandparent ${short([tip])}`);
  if (!deepened.shallow.includes(second) && !deepened.unshallow.includes(third)) {
    return detail(false, `shallow-info did not move the boundary (shallow=${deepened.shallow.join(",") || "none"} unshallow=${deepened.unshallow.join(",") || "none"})`);
  }
  const parentTree = parseCommit(deepened.objects.get(second).data).tree;
  const tree = deepened.objects.get(parentTree);
  if (!tree) return detail(false, "the delivered parent's tree is missing");
  return detail(true, `parent ${short([second])} delivered with its tree (${parseTree(tree.data).length} entries); the grandparent is still absent; the boundary moved`);
});
define("fetch-shallow-new-tip", "a shallow fetch of a new tip does not pull the old history", 12e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "fetch-shallow-new-tip", [scenarioFile(context.scenario, 0, 0)]);
  const second = harnessed.local.commit([scenarioFile(context.scenario, 1, 0)], scenarioCommitMeta(context.scenario, 1, 1), [tip]);
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: second, ref: "refs/heads/main" }]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true) return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  const shallow = await harnessed.client.clone(harnessed.owner, harnessed.repo, { depth: 1, signal: context.signal });
  const third = harnessed.local.commit([scenarioFile(context.scenario, 2, 0)], scenarioCommitMeta(context.scenario, 2, 2), [second]);
  const pushedTip = await pushRefs(harnessed, [{ oldOid: second, newOid: third, ref: "refs/heads/main" }]);
  if (reportFor(pushedTip, "refs/heads/main")?.ok !== true) return detail(false, `setup tip push failed: ${pushFailure(pushedTip)}`);
  const fetched = await harnessed.client.fetch(harnessed.owner, harnessed.repo, {
    wants: [third],
    haves: [second],
    shallow: shallow.shallow,
    depth: 1,
    haveObjects: shallow.objects,
    signal: context.signal
  });
  if (!fetched.objects.has(third)) return detail(false, "the new tip was not delivered");
  if (fetched.objects.has(tip)) return detail(false, `the shallow fetch pulled the old history (${short([tip])})`);
  if (fetched.objects.has(second)) return detail(false, "the shallow fetch re-sent the already-held parent");
  return detail(true, `${fetched.objects.size} object(s) for the new tip; the old history is absent`);
});
define("push-update-ref", "a fast-forward update moves a branch and clones see it", 1e4, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "push-update-ref");
  const second = harnessed.local.commit([scenarioFile(context.scenario, 1, 0)], scenarioCommitMeta(context.scenario, 1, 1), [tip]);
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: second, ref: "refs/heads/main" }]);
  if (pushed.report?.unpackOk !== true) return detail(false, `unpack failed: ${pushed.report?.unpackDetail ?? "no report"}`);
  if (!reportFor(pushed, "refs/heads/main")?.ok) return detail(false, `the fast-forward update was refused: ${pushFailure(pushed)}`);
  const listed = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (listed.refs.find((ref) => ref.name === "refs/heads/main")?.oid !== second) {
    return detail(false, "refs/heads/main does not advertise the new tip");
  }
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (!clone.objects.has(second)) return detail(false, "a clone does not see the updated tip");
  return detail(true, `refs/heads/main advanced ${short([tip])} → ${short([second])}; a clone sees it`);
});
define("push-create-branch", "creating a branch from an existing commit is reported and advertised", 1e4, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "push-create-branch");
  const pushed = await pushRefs(harnessed, [{ oldOid: ZERO_OID, newOid: tip, ref: "refs/heads/feature" }]);
  if (pushed.report?.unpackOk !== true) return detail(false, `unpack failed: ${pushed.report?.unpackDetail ?? "no report"}`);
  if (!reportFor(pushed, "refs/heads/feature")?.ok) return detail(false, `the branch create was refused: ${pushFailure(pushed)}`);
  const listed = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal });
  const feature = listed.refs.find((ref) => ref.name === "refs/heads/feature");
  if (!feature || feature.oid !== tip) return detail(false, "refs/heads/feature is not advertised at the created commit");
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (!clone.refs.some((ref) => ref.name === "refs/heads/feature" && ref.oid === tip)) {
    return detail(false, "a clone does not see the new branch");
  }
  return detail(true, `refs/heads/feature created at ${short([tip])}, advertised and cloned`);
});
define("push-delete-branch", "deleting a branch is reported and removes the ref", 1e4, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "push-delete-branch");
  const created = await pushRefs(harnessed, [{ oldOid: ZERO_OID, newOid: tip, ref: "refs/heads/feature" }]);
  if (!reportFor(created, "refs/heads/feature")?.ok) return detail(false, `setup branch create failed: ${pushFailure(created)}`);
  const deleted = await pushRefs(harnessed, [{ oldOid: tip, newOid: ZERO_OID, ref: "refs/heads/feature" }]);
  if (deleted.report?.unpackOk !== true) return detail(false, `unpack failed: ${deleted.report?.unpackDetail ?? "no report"}`);
  if (!reportFor(deleted, "refs/heads/feature")?.ok) return detail(false, `the branch delete was refused: ${pushFailure(deleted)}`);
  const listed = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (listed.refs.some((ref) => ref.name === "refs/heads/feature")) return detail(false, "refs/heads/feature is still advertised after the delete");
  if (listed.refs.find((ref) => ref.name === "refs/heads/main")?.oid !== tip) return detail(false, "the delete damaged refs/heads/main");
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (!clone.objects.has(tip)) return detail(false, "the repository is no longer clonable after the delete");
  return detail(true, "refs/heads/feature deleted; refs/heads/main intact; the repo is still clonable");
});
define("push-non-fast-forward", "a non-fast-forward update is refused per-ref and changes nothing", 1e4, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "push-non-fast-forward");
  const second = harnessed.local.commit([scenarioFile(context.scenario, 1, 0)], scenarioCommitMeta(context.scenario, 1, 1), [tip]);
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: second, ref: "refs/heads/main" }]);
  if (!reportFor(pushed, "refs/heads/main")?.ok) return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  const sibling = harnessed.local.commit([scenarioFile(context.scenario, 2, 0)], scenarioCommitMeta(context.scenario, 2, 2), [tip]);
  const refused = await harnessed.client.push(
    harnessed.owner,
    harnessed.repo,
    [{ oldOid: second, newOid: sibling, ref: "refs/heads/main" }],
    { objects: [...harnessed.local.reachable([sibling])].map((oid) => harnessed.local.objects.get(oid)), signal: context.signal }
  );
  if (refused.report?.unpackOk !== true) return detail(false, `a refused update must still unpack: ${refused.report?.unpackDetail ?? "no report"}`);
  const report = reportFor(refused, "refs/heads/main");
  if (!report || report.ok) return detail(false, `the non-fast-forward update was accepted: ${JSON.stringify(refused.report?.refs)}`);
  if (report.reason !== "non-fast-forward") return detail(false, `the refusal reason is ${JSON.stringify(report.reason)}, not non-fast-forward`);
  const listed = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (listed.refs.find((ref) => ref.name === "refs/heads/main")?.oid !== second) return detail(false, "the refused push moved refs/heads/main");
  const healthy = await harnessed.client.infoRefs(harnessed.owner, harnessed.repo, "git-upload-pack", { signal: context.signal });
  if (healthy.status !== 200) return detail(false, `the server stopped serving advertisements (HTTP ${healthy.status})`);
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (!clone.objects.has(second)) return detail(false, "a clone after the refusal does not see the unchanged tip");
  return detail(true, `refused with ng refs/heads/main non-fast-forward; main stayed ${short([second])}; the server is healthy; the clone is intact`);
});
define("push-mixed-report", "one command list reports ok and ng per ref, and applies only the ok one", 12e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "push-mixed-report");
  const second = harnessed.local.commit([scenarioFile(context.scenario, 1, 0)], scenarioCommitMeta(context.scenario, 1, 1), [tip]);
  const setup = await pushRefs(harnessed, [
    { oldOid: tip, newOid: second, ref: "refs/heads/main" },
    { oldOid: ZERO_OID, newOid: second, ref: "refs/heads/side" }
  ]);
  if (!reportFor(setup, "refs/heads/main")?.ok || !reportFor(setup, "refs/heads/side")?.ok) {
    return detail(false, `setup push failed: ${pushFailure(setup)}`);
  }
  const forward = harnessed.local.commit([scenarioFile(context.scenario, 2, 0)], scenarioCommitMeta(context.scenario, 2, 2), [second]);
  const sibling = harnessed.local.commit([scenarioFile(context.scenario, 3, 0)], scenarioCommitMeta(context.scenario, 3, 3), [tip]);
  const objects = [.../* @__PURE__ */ new Set([...harnessed.local.reachable([forward]), ...harnessed.local.reachable([sibling])])].map(
    (oid) => harnessed.local.objects.get(oid)
  );
  const mixed = await harnessed.client.push(
    harnessed.owner,
    harnessed.repo,
    [
      { oldOid: second, newOid: forward, ref: "refs/heads/main" },
      { oldOid: second, newOid: sibling, ref: "refs/heads/side" }
    ],
    { objects, signal: context.signal }
  );
  if (mixed.report?.unpackOk !== true) return detail(false, `unpack failed: ${mixed.report?.unpackDetail ?? "no report"}`);
  const mainReport = reportFor(mixed, "refs/heads/main");
  const sideReport = reportFor(mixed, "refs/heads/side");
  if (!mainReport?.ok) return detail(false, `the fast-forward half was refused: ${mainReport?.reason ?? "missing"}`);
  if (!sideReport || sideReport.ok) return detail(false, "the non-fast-forward half was accepted");
  if (sideReport.reason !== "non-fast-forward") return detail(false, `the refused half's reason is ${JSON.stringify(sideReport.reason)}`);
  if (mixed.report.refs.length !== 2) return detail(false, `the report has ${mixed.report.refs.length} ref line(s), expected 2`);
  const listed = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (listed.refs.find((ref) => ref.name === "refs/heads/main")?.oid !== forward) return detail(false, "the accepted ref did not advance");
  if (listed.refs.find((ref) => ref.name === "refs/heads/side")?.oid !== second) return detail(false, "the refused ref moved");
  return detail(true, "report-status: ok refs/heads/main, ng refs/heads/side non-fast-forward; only main advanced");
});
define("push-delete-tag", "deleting a tag ref is reported and removes the ref", 1e4, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "push-delete-tag");
  const tag = harnessed.local.tag("v1", tip, scenarioCommitMeta(context.scenario, 1, 0));
  const created = await pushRefs(harnessed, [{ oldOid: ZERO_OID, newOid: tag, ref: "refs/tags/v1" }]);
  if (!reportFor(created, "refs/tags/v1")?.ok) return detail(false, `setup tag create failed: ${pushFailure(created)}`);
  const deleted = await pushRefs(harnessed, [{ oldOid: tag, newOid: ZERO_OID, ref: "refs/tags/v1" }]);
  if (deleted.report?.unpackOk !== true) return detail(false, `unpack failed: ${deleted.report?.unpackDetail ?? "no report"}`);
  if (!reportFor(deleted, "refs/tags/v1")?.ok) return detail(false, `the tag delete was refused: ${pushFailure(deleted)}`);
  const listed = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (listed.refs.some((ref) => ref.name === "refs/tags/v1")) return detail(false, "refs/tags/v1 is still advertised after the delete");
  return detail(true, "refs/tags/v1 deleted; refs/heads/main untouched");
});
define("push-100-files", "a 100-file single-commit push round-trips byte-exactly", 15e3, async (context) => {
  const harnessed = await harness(context, "push-100-files");
  const files = scenarioManyFiles(context.scenario, 100, 1);
  const tip = harnessed.local.commit(files, scenarioCommitMeta(context.scenario, 0, 1));
  const pushed = await pushRefs(harnessed, [{ oldOid: ZERO_OID, newOid: tip, ref: "refs/heads/main" }]);
  if (pushed.report?.unpackOk !== true) return detail(false, `unpack failed: ${pushed.report?.unpackDetail ?? "no report"}`);
  if (!reportFor(pushed, "refs/heads/main")?.ok) return detail(false, `the 100-file push was refused: ${pushFailure(pushed)}`);
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  const comparison = compareReachable(harnessed.local, clone.objects, [tip]);
  if (comparison.missing.length) return detail(false, `${comparison.missing.length} object(s) missing after the 100-file clone: ${short(comparison.missing)}`);
  if (comparison.different.length) return detail(false, `${comparison.different.length} object(s) differ byte-for-byte: ${short(comparison.different)}`);
  const commit = parseCommit(clone.objects.get(tip).data);
  let checked = 0;
  for (const file of files) {
    let oid = commit.tree;
    let found = true;
    for (const segment of file.path.split("/")) {
      const treeObject = clone.objects.get(oid);
      if (!treeObject) {
        found = false;
        break;
      }
      const entry = parseTree(treeObject.data).find((candidate) => candidate.name === segment);
      if (!entry) {
        found = false;
        break;
      }
      oid = entry.oid;
    }
    if (!found) return detail(false, `the cloned tree is missing the path ${file.path}`);
    const blob = clone.objects.get(oid);
    if (!blob || blob.type !== "blob" || !blob.data.equals(file.data)) {
      return detail(false, `the cloned bytes for ${file.path} differ`);
    }
    checked += 1;
  }
  return detail(true, `${checked} files byte-identical; ${comparison.expected} objects; every SHA-1 recomputed`);
});
define("pack-integrity", "a fetched pack is structurally valid and checksummed", 12e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "pack-integrity", [
    scenarioSizedFile(context.scenario, 0, 0, 2048)
  ]);
  const second = harnessed.local.commit([scenarioSizedFile(context.scenario, 0, 1, 2048)], scenarioCommitMeta(context.scenario, 1, 1), [tip]);
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: second, ref: "refs/heads/main" }]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true) return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  const fetched = await harnessed.client.fetch(harnessed.owner, harnessed.repo, {
    wants: [second],
    parse: false,
    signal: context.signal
  });
  if (!fetched.pack) return detail(false, "the fetch delivered no pack");
  const checksum = verifyPackChecksum(fetched.pack);
  if (!checksum.ok) return detail(false, `the pack trailer ${checksum.actual} does not match the bytes ${checksum.expected}`);
  const parsed = readPack(fetched.pack);
  if (parsed.declaredCount !== parsed.entries.length) return detail(false, `the header declares ${parsed.declaredCount} objects, ${parsed.entries.length} parsed`);
  if (parsed.objects.size !== parsed.declaredCount) return detail(false, `${parsed.declaredCount} entries resolved to ${parsed.objects.size} unique objects`);
  if (parsed.version !== 2 && parsed.version !== 3) return detail(false, `pack version ${parsed.version}`);
  const bad = hashMismatches(parsed.objects);
  if (bad.length) return detail(false, `${bad.length} pack object(s) do not recompute to their id`);
  return detail(true, `${fetched.packBytes} bytes, version ${parsed.version}, ${parsed.declaredCount} objects (${parsed.deltaCount} deltas), trailer ${checksum.actual.slice(0, 12)} verified`);
});
define("pack-deltas", "delta-compressed objects resolve correctly (when the server sends them)", 15e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "pack-deltas", [scenarioSizedFile(context.scenario, 0, 0, 2e4)]);
  let parent = tip;
  for (let revision = 1; revision <= 3; revision += 1) {
    const child = harnessed.local.commit(
      [scenarioSizedFile(context.scenario, 0, revision, 2e4)],
      scenarioCommitMeta(context.scenario, revision, revision),
      [parent]
    );
    const pushed = await pushRefs(harnessed, [{ oldOid: parent, newOid: child, ref: "refs/heads/main" }]);
    if (reportFor(pushed, "refs/heads/main")?.ok !== true) return detail(false, `setup push ${revision} failed: ${pushFailure(pushed)}`);
    parent = child;
  }
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (!clone.objects.has(parent)) return detail(false, "the clone is missing the tip");
  const bad = hashMismatches(clone.objects);
  if (bad.length) return detail(false, `${bad.length} object(s) (including any delta-resolved ones) do not recompute to their id`);
  const comparison = compareReachable(harnessed.local, clone.objects, [parent]);
  if (comparison.different.length) return detail(false, `${comparison.different.length} delta-resolved object(s) differ byte-for-byte`);
  return detail(true, `${clone.objects.size} objects, ${clone.deltaCount} delta object(s) resolved; every object verified; ${clone.packBytes} bytes`);
});
define("sideband-framing", "the fetch packfile section is valid sideband framing", 12e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "sideband-framing", [scenarioSizedFile(context.scenario, 0, 0, 4096)]);
  const second = harnessed.local.commit([scenarioSizedFile(context.scenario, 0, 1, 4096)], scenarioCommitMeta(context.scenario, 1, 1), [tip]);
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: second, ref: "refs/heads/main" }]);
  if (reportFor(pushed, "refs/heads/main")?.ok !== true) return detail(false, `setup push failed: ${pushFailure(pushed)}`);
  const packets = [];
  await harnessed.client.fetch(harnessed.owner, harnessed.repo, {
    wants: [second],
    parse: false,
    signal: context.signal,
    observe: (packet) => packets.push(packet)
  });
  const packChunks = [];
  let progressBytes = 0;
  let sidebandPackets = 0;
  let section = "";
  for (const packet of packets) {
    if (packet.kind !== "data") {
      if (packet.kind === "flush" || packet.kind === "delim") section = "";
      continue;
    }
    if (packet.raw.length > PKT_LINE_MAX) return detail(false, `a pkt-line is ${packet.raw.length} bytes, over ${PKT_LINE_MAX}`);
    const text = packet.payload.toString("utf8");
    if (section === "") {
      if (text === "packfile\n") {
        section = "packfile";
        continue;
      }
      if (text === "acknowledgments\n" || text === "shallow-info\n" || text === "wanted-refs\n") {
        section = "control";
        continue;
      }
      const band2 = packet.payload[0];
      if (band2 !== 1 && band2 !== 2 && band2 !== 3) continue;
    } else if (section !== "packfile") {
      continue;
    }
    sidebandPackets += 1;
    if (packet.payload.length < 1) return detail(false, "an empty sideband packet in the packfile section");
    const band = packet.payload[0];
    if (band === 1) packChunks.push(packet.payload.subarray(1));
    else if (band === 2) progressBytes += packet.payload.length - 1;
    else if (band === 3) return detail(false, `the server sent a sideband error: ${packet.payload.subarray(1).toString("utf8").trim()}`);
    else return detail(false, `invalid sideband band ${band}`);
  }
  if (sidebandPackets === 0) return detail(false, "the fetch response had no packfile sideband packets");
  const pack = Buffer.concat(packChunks);
  if (!pack.length) return detail(false, "the packfile section carried no band-1 data");
  const parsed = readPack(pack);
  if (!verifyPackChecksum(pack).ok) return detail(false, "the reassembled pack fails its trailer checksum");
  return detail(true, `${sidebandPackets} sideband packet(s); ${pack.length} band-1 bytes, ${progressBytes} progress bytes; pack ${parsed.declaredCount} objects, checksum verified`);
});
define("push-sideband-report", "the push report arrives in valid sideband frames", 12e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "push-sideband-report");
  const second = harnessed.local.commit([scenarioFile(context.scenario, 1, 0)], scenarioCommitMeta(context.scenario, 1, 1), [tip]);
  const pushed = await pushRefs(harnessed, [{ oldOid: tip, newOid: second, ref: "refs/heads/main" }]);
  if (!pushed.sideband) return detail(false, "the server did not advertise side-band-64k for receive-pack");
  if (pushed.report?.unpackOk !== true) return detail(false, `unpack failed inside the sideband report: ${pushed.report?.unpackDetail ?? "no report"}`);
  if (!reportFor(pushed, "refs/heads/main")?.ok) return detail(false, `the push was refused: ${pushFailure(pushed)}`);
  return detail(true, `report-status demuxed from band 1; unpack ok; refs/heads/main ok; ${pushed.progress.length} progress byte(s)`);
});
define("repo-survives-errors", "the server stays healthy through 404s, refusals and a malformed request", 15e3, async (context) => {
  const { harnessed, tip } = await repoWithInitialCommit(context, "repo-survives-errors", [scenarioFile(context.scenario, 0, 0)]);
  const missing = await harnessed.client.infoRefs(harnessed.owner, `${harnessed.repo}-missing`, "git-upload-pack", {
    signal: context.signal
  });
  if (missing.status !== 404) return detail(false, `a missing repo returned HTTP ${missing.status}`);
  const second = harnessed.local.commit([scenarioFile(context.scenario, 1, 0)], scenarioCommitMeta(context.scenario, 1, 1), [tip]);
  const setup = await pushRefs(harnessed, [{ oldOid: tip, newOid: second, ref: "refs/heads/main" }]);
  if (reportFor(setup, "refs/heads/main")?.ok !== true) return detail(false, `setup push failed: ${pushFailure(setup)}`);
  const sibling = harnessed.local.commit([scenarioFile(context.scenario, 2, 0)], scenarioCommitMeta(context.scenario, 2, 2), [tip]);
  const probe = await harnessed.client.push(
    harnessed.owner,
    harnessed.repo,
    [{ oldOid: second, newOid: sibling, ref: "refs/heads/main" }],
    { objects: [...harnessed.local.reachable([sibling])].map((oid) => harnessed.local.objects.get(oid)), signal: context.signal }
  );
  const probeReport = reportFor(probe, "refs/heads/main");
  const probeNote = probeReport?.ok ? "an accepted non-fast-forward update" : `ng ${probeReport?.reason ?? "unreported"}`;
  let malformedNote = "";
  try {
    const malformed = await harnessed.client.postRaw(
      harnessed.owner,
      harnessed.repo,
      "git-upload-pack",
      Buffer.from("zzzznot-a-pkt-line", "ascii"),
      { signal: context.signal }
    );
    malformedNote = `HTTP ${malformed.status}`;
  } catch (err) {
    malformedNote = describeError(err);
  }
  const healthy = await harnessed.client.infoRefs(harnessed.owner, harnessed.repo, "git-upload-pack", { signal: context.signal });
  if (healthy.status !== 200) return detail(false, `after the errors a known repo answers HTTP ${healthy.status}`);
  const listed = await harnessed.client.lsRefs(harnessed.owner, harnessed.repo, { signal: context.signal });
  const mainTip = listed.refs.find((ref) => ref.name === "refs/heads/main")?.oid;
  if (!mainTip) return detail(false, "after the errors refs/heads/main no longer exists");
  const clone = await harnessed.client.clone(harnessed.owner, harnessed.repo, { signal: context.signal });
  if (!clone.objects.has(mainTip)) return detail(false, `after the errors a clone is missing the advertised tip ${short([mainTip])}`);
  const bad = hashMismatches(clone.objects);
  if (bad.length) return detail(false, `after the errors ${bad.length} cloned object(s) are corrupt`);
  const missingObjects = missingClosure(clone.objects, [mainTip]);
  if (missingObjects.length) return detail(false, `after the errors the clone's graph is incomplete: ${missingObjects[0]}`);
  return detail(true, `404, ${probeNote} and a malformed POST (${malformedNote}) were handled; the clone at ${short([mainTip])} is intact`);
});
var GIT_CHECKS = Object.freeze(specs);
var GIT_CHECK_IDS = Object.freeze(specs.map((spec2) => spec2.id));
if (GIT_CHECKS.length !== GIT_GROUP_SIZE) {
  throw new Error(`checks-git registers ${GIT_CHECKS.length} checks; the manifest's git group is ${GIT_GROUP_SIZE}`);
}

// env/src/rest-client.ts
var DEFAULT_TIMEOUT_MS = 5e3;
var MAX_RESPONSE_BYTES = 1 << 20;
var MAX_DETAIL_BODY_CHARS = 240;
var REDIRECT_STATUSES = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
var API_PREFIX = "/api/v3";
var JSON_CONTENT_TYPE = "application/json";
var shapes = {
  any: () => ({ kind: "any" }),
  object: (props = {}, required) => ({
    kind: "object",
    props,
    required: required ?? Object.keys(props)
  }),
  looseObject: () => ({ kind: "object", props: {}, required: [], allowExtra: true }),
  array: (items, bounds = {}) => ({ kind: "array", items, ...bounds }),
  string: (opts = {}) => ({ kind: "string", ...opts }),
  number: (opts = {}) => ({ kind: "number", ...opts }),
  boolean: () => ({ kind: "boolean" }),
  null: () => ({ kind: "null" })
};
function isJsonContentType(value) {
  if (value === null) return false;
  return /^application\/(?:[A-Za-z0-9!#$&^_.+-]+\+)?json(?:\s*;.*)?$/i.test(value.trim());
}
function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
function parseLinkHeader(value) {
  const out = { next: null, prev: null, first: null, last: null };
  if (value === null || value.trim() === "") return out;
  for (const part of value.split(",")) {
    const match = /<([^>]*)>\s*;\s*rel\s*=\s*"?([A-Za-z]+)"?/.exec(part.trim());
    if (match === null) continue;
    const url = match[1] ?? "";
    const rel = (match[2] ?? "").toLowerCase();
    if (rel === "next" || rel === "prev" || rel === "first" || rel === "last") out[rel] = url;
  }
  return out;
}
function encodeSegment(segment) {
  return segment.split("/").map((piece) => encodeURIComponent(piece)).join("/");
}
function apiPath(...segments) {
  const tail = segments.map((segment) => encodeSegment(String(segment))).join("/");
  return tail === "" ? API_PREFIX : `${API_PREFIX}/${tail}`;
}
function b64encode(text) {
  return Buffer.from(text, "utf8").toString("base64");
}
function b64decode(content) {
  return Buffer.from(content.replace(/[\r\n\t ]+/g, ""), "base64").toString("utf8");
}
function describeResponse(response) {
  if (response.status === 0) return `no response: ${response.error ?? "unknown transport error"}`;
  const status = `${response.status}${response.statusText === "" ? "" : ` ${response.statusText}`}`;
  const body = response.text.length > MAX_DETAIL_BODY_CHARS ? `${response.text.slice(0, MAX_DETAIL_BODY_CHARS)}…` : response.text;
  return body === "" ? status : `${status}; body ${body}`;
}
function formatExpectation(expected) {
  return typeof expected === "number" ? String(expected) : expected.join(" or ");
}
function expectStatus(response, expected, label) {
  const wanted = typeof expected === "number" ? [expected] : expected;
  if (wanted.includes(response.status)) return null;
  return `${label}: expected status ${formatExpectation(expected)}, got ${describeResponse(response)}`;
}
function expectHeader(response, name, label, options = {}) {
  const value = response.headers.get(name);
  if (value === null) return `${label}: expected header ${name}, but the response did not carry it`;
  if (options.nonEmpty === true && value.trim() === "") return `${label}: expected a non-empty ${name} header, got an empty one`;
  return null;
}
function expectNoHtml(response, label) {
  const type = response.contentType ?? "";
  if (/^text\/html\b/i.test(type.trim())) return `${label}: expected JSON, got ${type}`;
  if (/^\s*</.test(response.text)) return `${label}: expected JSON, got an HTML body (${response.text.slice(0, 80)}…)`;
  return null;
}
function expectJsonResponse(response, expected, shape, label) {
  const status = expectStatus(response, expected, label);
  if (status !== null) return status;
  const html = expectNoHtml(response, label);
  if (html !== null) return html;
  if (!isJsonContentType(response.contentType)) {
    return `${label}: expected a JSON content type, got ${response.contentType ?? "none"} (body ${response.text.slice(0, MAX_DETAIL_BODY_CHARS)})`;
  }
  if (response.parseError !== null) return `${label}: response body is not valid JSON: ${response.parseError}`;
  if (shape !== null) {
    const problem = checkShape(response.body, shape, `${label} body`);
    if (problem !== null) return problem;
  }
  return null;
}
function checkShape(value, shape, path = "body") {
  switch (shape.kind) {
    case "any":
      return null;
    case "null":
      return value === null ? null : `${path}: expected null, got ${typeName(value)}`;
    case "boolean":
      return typeof value === "boolean" ? null : `${path}: expected boolean, got ${typeName(value)}`;
    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) return `${path}: expected number, got ${typeName(value)}`;
      if (shape.integer === true && !Number.isInteger(value)) return `${path}: expected an integer, got ${value}`;
      if (shape.min !== void 0 && value < shape.min) return `${path}: expected at least ${shape.min}, got ${value}`;
      if (shape.max !== void 0 && value > shape.max) return `${path}: expected at most ${shape.max}, got ${value}`;
      return null;
    }
    case "string": {
      if (typeof value !== "string") return `${path}: expected string, got ${typeName(value)}`;
      if (shape.nonEmpty === true && value === "") return `${path}: expected a non-empty string, got an empty one`;
      if (shape.oneOf !== void 0 && !shape.oneOf.includes(value)) {
        return `${path}: expected one of ${shape.oneOf.map((item) => JSON.stringify(item)).join(", ")}, got ${JSON.stringify(value)}`;
      }
      if (shape.pattern !== void 0 && !shape.pattern.test(value)) {
        return `${path}: ${JSON.stringify(value)} does not match ${shape.pattern}`;
      }
      return null;
    }
    case "array": {
      if (!Array.isArray(value)) return `${path}: expected array, got ${typeName(value)}`;
      if (shape.min !== void 0 && value.length < shape.min) return `${path}: expected at least ${shape.min} items, got ${value.length}`;
      if (shape.max !== void 0 && value.length > shape.max) return `${path}: expected at most ${shape.max} items, got ${value.length}`;
      if (shape.items !== void 0) {
        for (let index = 0; index < value.length; index += 1) {
          const problem = checkShape(value[index], shape.items, `${path}[${index}]`);
          if (problem !== null) return problem;
        }
      }
      return null;
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return `${path}: expected object, got ${typeName(value)}`;
      const object = value;
      const required = shape.required ?? Object.keys(shape.props ?? {});
      for (const key of required) {
        if (!(key in object)) return `${path}.${key}: missing required property`;
      }
      if (shape.props !== void 0) {
        for (const [key, childShape] of Object.entries(shape.props)) {
          if (!(key in object)) continue;
          const problem = checkShape(object[key], childShape, `${path}.${key}`);
          if (problem !== null) return problem;
        }
      }
      if (shape.allowExtra === false && shape.props !== void 0) {
        for (const key of Object.keys(object)) {
          if (!(key in shape.props)) return `${path}.${key}: unexpected property`;
        }
      }
      return null;
    }
  }
}
function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
function truncatedMessage(err) {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
var RestClient = class _RestClient {
  baseUrl;
  token;
  timeoutMs;
  signal;
  defaultHeaders;
  constructor(options) {
    const base = options.baseUrl.trim().replace(/\/+$/, "");
    let parsed;
    try {
      parsed = new URL(base);
    } catch {
      throw new TypeError(`RestClient: baseUrl is not an absolute URL: ${JSON.stringify(options.baseUrl)}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new TypeError(`RestClient: baseUrl must be http or https, got ${parsed.protocol}`);
    }
    this.baseUrl = base;
    this.token = options.token ?? null;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultHeaders = options.headers ?? {};
    this.signal = options.signal;
  }
  /** The same base URL with another token (`null` for none). */
  withToken(token) {
    return new _RestClient({ baseUrl: this.baseUrl, token, timeoutMs: this.timeoutMs, headers: this.defaultHeaders, signal: this.signal });
  }
  /** The absolute URL a path (or an absolute same-origin URL) and query resolve to. */
  url(path, query) {
    const absolute = /^https?:\/\//i.test(path) ? path : `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    const url = new URL(absolute);
    if (query !== void 0) {
      for (const [key, value] of Object.entries(query)) {
        if (value === void 0 || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
  /** One exchange; never throws for an HTTP or transport outcome. */
  async request(path, options = {}) {
    const started = performance.now();
    const method = (options.method ?? "GET").toUpperCase();
    const url = this.url(path, options.query);
    const token = options.token === void 0 ? this.token : options.token;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    if (!sameOrigin(url, this.baseUrl)) {
      return this.failure(url, `refused to leave the entry's origin: ${url}`, started);
    }
    const headers = new Headers(this.defaultHeaders);
    headers.set("accept", "application/vnd.github+json");
    if (token !== null) headers.set("authorization", `Bearer ${token}`);
    for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
    let body;
    if (options.rawBody !== void 0) {
      body = typeof options.rawBody === "string" ? options.rawBody : new Uint8Array(options.rawBody);
    } else if (options.body !== void 0) {
      body = JSON.stringify(options.body);
      if (!headers.has("content-type")) headers.set("content-type", JSON_CONTENT_TYPE);
    }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onExternalAbort = () => controller.abort();
    const signals = [this.signal, options.signal].filter((signal) => signal !== void 0);
    for (const signal of signals) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", onExternalAbort, { once: true });
    }
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        redirect: "follow"
      });
      const contentType = response.headers.get("content-type");
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const truncated = bytes.byteLength > MAX_RESPONSE_BYTES;
      const text = new TextDecoder("utf-8").decode(truncated ? bytes.subarray(0, MAX_RESPONSE_BYTES) : bytes);
      const out = {
        status: response.status,
        statusText: response.statusText,
        url,
        ok: response.status >= 200 && response.status <= 299,
        headers: response.headers,
        contentType,
        body: void 0,
        text,
        parseError: null,
        error: null,
        elapsedMs: performance.now() - started
      };
      if (isJsonContentType(contentType) && text.trim() !== "" && !truncated && !REDIRECT_STATUSES.has(response.status)) {
        try {
          out.body = JSON.parse(text);
        } catch (err) {
          out.parseError = truncatedMessage(err);
        }
      }
      return out;
    } catch (err) {
      const reason = timedOut ? `timeout after ${timeoutMs}ms` : controller.signal.aborted ? "aborted" : truncatedMessage(err);
      return this.failure(url, reason, started);
    } finally {
      clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener("abort", onExternalAbort);
    }
  }
  get(path, options = {}) {
    return this.request(path, { ...options, method: "GET" });
  }
  post(path, options = {}) {
    return this.request(path, { ...options, method: "POST" });
  }
  patch(path, options = {}) {
    return this.request(path, { ...options, method: "PATCH" });
  }
  put(path, options = {}) {
    return this.request(path, { ...options, method: "PUT" });
  }
  delete(path, options = {}) {
    return this.request(path, { ...options, method: "DELETE" });
  }
  failure(url, error, started) {
    return {
      status: 0,
      statusText: "",
      url,
      ok: false,
      headers: new Headers(),
      contentType: null,
      body: void 0,
      text: "",
      parseError: null,
      error,
      elapsedMs: performance.now() - started
    };
  }
};

// env/src/checks-rest.ts
function restScenarioOf(scenario) {
  const first = scenario.repos[0];
  const blobA = scenario.blobs[0];
  const blobB = scenario.blobs[1] ?? scenario.blobs[0];
  const issue = scenario.issues[0];
  const issueAlt = scenario.issues[1] ?? scenario.issues[0];
  const pull = scenario.pulls[0];
  if (first === void 0 || blobA === void 0 || blobB === void 0 || issue === void 0 || issueAlt === void 0 || pull === void 0) {
    throw new Error("wire.ts buildScenario() returned an empty repos, blobs, issues or pulls list");
  }
  const dirBlob = scenario.blobs.find((blob) => blob.path.includes("/"));
  const dirPath = dirBlob === void 0 ? "src" : dirBlob.path.slice(0, dirBlob.path.lastIndexOf("/"));
  const branchName = scenario.branches.find((name) => name !== first.defaultBranch && !name.endsWith("/")) ?? "feature";
  const label = scenario.labels[0] ?? "bug";
  return {
    owner: scenario.viewer.login,
    otherOwner: scenario.stranger.login,
    repoPrefix: first.name,
    paginationRepos: scenario.repos.map((repo) => repo.name),
    filePath: blobA.path,
    dirPath,
    fileContent: blobA.content,
    fileContentAlt: blobB.content,
    commitMessage: scenario.commits[0]?.message ?? "seeded commit",
    branchName,
    issueTitle: issue.title,
    issueBody: issue.body,
    commentBody: issueAlt.body,
    pullTitle: pull.title,
    pullBody: pull.body,
    label,
    badLabel: `${label}-not-a-label`,
    description: first.description,
    descriptionAlt: `${first.description} (updated)`
  };
}
function restChecks() {
  return [
    check("repos", "pagination", 'GET /user/repos pages 30 seeded repos at per_page=10 through Link rel="next"', reposPagination),
    check("repos", "root", "GET /api/v3/ answers 200 JSON with X-OAuth-Scopes", reposRoot),
    check("repos", "meta", "GET /api/v3/meta reports installed_version", reposMeta),
    check("repos", "create", "POST /user/repos creates and GET round-trips name, private and default_branch", reposCreate),
    check("repos", "not-found", "GET a missing repository is a JSON 404", reposNotFound),
    check("repos", "patch", "PATCH /repos/{o}/{r} updates the description", reposPatch),
    check("repos", "delete", "DELETE /repos/{o}/{r} deletes it and a later GET is 404", reposDelete),
    check("repos", "branches", "GET /branches lists a branch created through POST /git/refs", reposBranches),
    check("repos", "commits", "GET /commits reflects a commit made on a branch and not the default branch", reposCommits),
    check("repos", "unauthorized", "a request without a token is 401", reposUnauthorized),
    check("repos", "foreign-token", "the same repository name under another owner is a 404 for this token", reposForeignToken),
    check("repos", "contents-create", "PUT /contents creates a file with a commit; GET returns base64 content and sha", reposContentsCreate),
    check("repos", "contents-directory", "GET /contents on a directory lists its entries", reposContentsDirectory),
    check("repos", "contents-stale-sha", "PUT /contents with a stale sha is 409", reposContentsStaleSha),
    check("repos", "contents-delete", "DELETE /contents removes the file with a commit and GET is 404", reposContentsDelete),
    check("issues", "create", "POST /issues creates a 201 open issue with a number", issuesCreate),
    check("issues", "create-title-body", "POST /issues echoes the title and body", issuesCreateTitleBody),
    check("issues", "create-labels", "POST /issues attaches an existing label", issuesCreateLabels),
    check("issues", "numbers-increment", "issue numbers increment by one", issuesNumbersIncrement),
    check("issues", "list-open", "GET /issues?state=open lists the open issue", issuesListOpen),
    check("issues", "list-open-excludes-closed", "GET /issues?state=open omits a closed issue", issuesListOpenExcludesClosed),
    check("issues", "list-sort-asc", "GET /issues?sort=created&direction=asc orders by creation", issuesListSortAsc),
    check("issues", "list-sort-desc", "GET /issues?sort=created&direction=desc reverses it", issuesListSortDesc),
    check("issues", "list-shape", "GET /issues returns the GitHub issue shape", issuesListShape),
    check("issues", "get-one", "GET /issues/{n} returns the issue", issuesGetOne),
    check("issues", "patch-close", "PATCH /issues/{n} closes it", issuesPatchClose),
    check("issues", "patch-close-persists", "the close survives a later GET", issuesPatchClosePersists),
    check("issues", "comment-create", "POST /issues/{n}/comments creates a comment", issuesCommentCreate),
    check("issues", "comments-list", "GET /issues/{n}/comments lists the comment", issuesCommentsList),
    check("issues", "bad-label", "POST /issues with an unknown label is 422", issuesBadLabel),
    check("pulls", "create", "POST /pulls creates an open pull request from a head branch", pullsCreate),
    check("pulls", "create-body", "POST /pulls echoes the title and body", pullsCreateBody),
    check("pulls", "create-head-sha", "the pull head.sha is the head branch tip", pullsCreateHeadSha),
    check("pulls", "create-base-sha", "the pull base.sha is the base branch tip", pullsCreateBaseSha),
    check("pulls", "get-one", "GET /pulls/{n} returns the pull request", pullsGetOne),
    check("pulls", "files-list", "GET /pulls/{n}/files lists the changed path", pullsFilesList),
    check("pulls", "files-shape", "pull files carry filename, status and the change counts", pullsFilesShape),
    check("pulls", "files-multiple", "GET /pulls/{n}/files lists every changed path", pullsFilesMultiple),
    check("pulls", "merge-status", "PUT /pulls/{n}/merge with merge_method=squash is 200", pullsMergeStatus),
    check("pulls", "merge-body", "the merge reply is {merged:true, sha, message}", pullsMergeBody),
    check("pulls", "merge-closes", "the merged pull is closed, merged and carries merged_at", pullsMergeCloses),
    check("pulls", "merge-commit-on-default", "the merge commit appears on the default branch", pullsMergeCommitOnDefault),
    check("pulls", "merge-content-on-default", "the squash content is on the default branch", pullsMergeContentOnDefault),
    check("pulls", "merge-commit-sha", "the pull reports merge_commit_sha equal to the merge sha", pullsMergeCommitSha),
    check("pulls", "merge-unknown", "merging an unknown pull request is 404", pullsMergeUnknown),
    check("pulls", "merge-conflict", "merging a conflicted pull request is 405", pullsMergeConflict),
    check("pulls", "list-state-all", "GET /pulls?state=all lists open and merged pull requests", pullsListStateAll),
    check("pulls", "list-default-open", "GET /pulls defaults to open pull requests", pullsListDefaultOpen),
    check("pulls", "list-shape", "GET /pulls returns the GitHub pull-request shape", pullsListShape),
    check("pulls", "get-unknown", "GET an unknown pull request is 404", pullsGetUnknown)
  ].map(spec);
}
function restProtocolChecks() {
  return [
    check("protocol", "content-type-json", "every REST reply is application/json, never HTML", protocolContentType),
    check("protocol", "unknown-route-json-404", "an unknown /api/v3 route is a JSON 404", protocolUnknownRoute),
    check("protocol", "malformed-body-400", "a malformed JSON body is a 400", protocolMalformedBody),
    check("protocol", "request-id", "every reply carries a non-empty X-GitHub-Request-Id", protocolRequestId),
    check("protocol", "error-message", "401, 404 and 422 bodies carry a string message", protocolErrorMessage)
  ].map(spec);
}
function check(group, slug2, title, run) {
  return { slug: slug2, group, title, run };
}
function spec(definition) {
  return {
    id: checkId(definition.group, definition.slug),
    group: definition.group,
    title: definition.title,
    fn: (context) => runDefinition(context, definition)
  };
}
var CheckFailure = class extends Error {
};
function fail2(detail2) {
  throw new CheckFailure(detail2);
}
function expect(detail2) {
  if (detail2 !== null) throw new CheckFailure(detail2);
}
function clip(text, max = 600) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
function clientSet(context) {
  const timeoutMs = Math.max(1e3, Math.min(context.timeoutMs, 5e3));
  const scenario = restScenarioOf(context.scenario);
  const shared = { baseUrl: context.baseUrl, timeoutMs, signal: context.signal };
  return {
    scenario,
    owner: scenario.owner,
    otherOwner: scenario.otherOwner,
    baseUrl: context.baseUrl,
    client: new RestClient({ ...shared, token: context.token }),
    anon: new RestClient({ ...shared, token: null })
  };
}
async function runDefinition(context, definition) {
  try {
    await definition.run(clientSet(context));
    return { ok: true, detail: `${definition.title}: ok` };
  } catch (err) {
    if (err instanceof CheckFailure) return { ok: false, detail: clip(err.message) };
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return { ok: false, detail: clip(`${definition.slug}: threw ${message}`) };
  }
}
var SHA40 = /^[0-9a-f]{40}$/i;
var shaShape = () => shapes.string({ nonEmpty: true, pattern: SHA40 });
var messageShape = () => shapes.object({ message: shapes.string({ nonEmpty: true }) });
var labelShape = () => shapes.object({ name: shapes.string({ nonEmpty: true }) });
function slug(id) {
  return id.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}
function repoName(set, id) {
  const name = `${set.scenario.repoPrefix}-${slug(id)}`;
  return name.length <= 100 ? name : name.slice(0, 100);
}
function paginationNames(set) {
  return set.scenario.paginationRepos;
}
function variantPath(path, suffix) {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const base = slash === -1 ? path : path.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  const stem = dot <= 0 ? base : base.slice(0, dot);
  const ext = dot <= 0 ? "" : base.slice(dot);
  return `${dir}${stem}-${suffix}${ext}`;
}
function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}
function numberField(object, field) {
  const value = object[field];
  return typeof value === "number" ? value : Number.NaN;
}
function stringField(object, field) {
  const value = object[field];
  return typeof value === "string" ? value : "";
}
function objectBody(response, label) {
  const value = response.body;
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail2(`${label}: expected a JSON object body`);
  return value;
}
function arrayBody(response, label) {
  const value = response.body;
  if (!Array.isArray(value)) fail2(`${label}: expected a JSON array body`);
  return value;
}
var contentCommitShape = () => shapes.object({
  content: shapes.object({ sha: shaShape(), encoding: shapes.string({ oneOf: ["base64"] }) }),
  commit: shapes.object({ sha: shaShape() })
});
async function prepareRepo(set, id, options = {}) {
  const name = repoName(set, id);
  const created = await set.client.post(apiPath("user", "repos"), {
    body: { name, private: options.private ?? true, description: options.description ?? set.scenario.description }
  });
  expect(expectJsonResponse(created, 201, shapes.object({ name: shapes.string({ oneOf: [name] }), private: shapes.boolean() }), `POST /api/v3/user/repos (${name})`));
  const path = apiPath("repos", set.owner, name);
  const put = await putContent(set, { owner: set.owner, name }, { filePath: options.filePath ?? set.scenario.filePath, content: options.content ?? set.scenario.fileContent, message: set.scenario.commitMessage });
  const commit = contentCommit(put, `PUT ${path}/contents/${options.filePath ?? set.scenario.filePath}`);
  const got = await set.client.get(path);
  expect(expectJsonResponse(got, 200, shapes.object({ default_branch: shapes.string({ nonEmpty: true }) }), `GET ${path}`));
  const defaultBranch = stringField(objectBody(got, `GET ${path}`), "default_branch");
  return { owner: set.owner, name, path, defaultBranch, initialCommitSha: commit.commitSha };
}
async function putContent(set, repo, options) {
  const body = { message: options.message, content: b64encode(options.content) };
  if (options.branch !== void 0) body.branch = options.branch;
  if (options.sha !== void 0) body.sha = options.sha;
  return set.client.put(apiPath("repos", repo.owner, repo.name, "contents", options.filePath), { body });
}
function contentCommit(response, label, expected = 201) {
  expect(expectJsonResponse(response, expected, contentCommitShape(), label));
  const body = objectBody(response, label);
  const content = body.content;
  const commit = body.commit;
  return { commitSha: stringField(commit, "sha"), contentSha: stringField(content, "sha") };
}
async function getContent(set, repo, filePath, ref) {
  const path = apiPath("repos", repo.owner, repo.name, "contents", filePath);
  const response = await set.client.get(path, ref === void 0 ? {} : { query: { ref } });
  const label = `GET ${path}${ref === void 0 ? "" : `?ref=${ref}`}`;
  expect(
    expectJsonResponse(
      response,
      200,
      shapes.object({
        type: shapes.string({ oneOf: ["file"] }),
        encoding: shapes.string({ oneOf: ["base64"] }),
        content: shapes.string(),
        sha: shaShape(),
        size: shapes.number({ integer: true, min: 0 })
      }),
      label
    )
  );
  const body = objectBody(response, label);
  return { sha: stringField(body, "sha"), content: stringField(body, "content"), size: numberField(body, "size") };
}
async function createBranch(set, repo, branch, sha) {
  const path = `${repo.path}/git/refs`;
  const response = await set.client.post(path, { body: { ref: `refs/heads/${branch}`, sha } });
  expect(
    expectJsonResponse(
      response,
      201,
      shapes.object({ ref: shapes.string({ oneOf: [`refs/heads/${branch}`] }), object: shapes.object({ sha: shaShape() }) }),
      `POST ${path} (${branch})`
    )
  );
}
async function commitOnBranch(set, repo, options) {
  const sha = options.update === true ? (await getContent(set, repo, options.filePath, options.branch)).sha : void 0;
  const response = await putContent(set, repo, { filePath: options.filePath, content: options.content, message: options.message, branch: options.branch, sha });
  return contentCommit(response, `PUT ${repo.path}/contents/${options.filePath}?branch=${options.branch}`, options.update === true ? [200, 201] : 201);
}
var pullShape = () => shapes.object({
  number: shapes.number({ integer: true, min: 1 }),
  state: shapes.string({ oneOf: ["open", "closed"] }),
  title: shapes.string(),
  body: shapes.string(),
  head: shapes.object({ ref: shapes.string({ nonEmpty: true }), sha: shaShape() }),
  base: shapes.object({ ref: shapes.string({ nonEmpty: true }), sha: shaShape() })
});
async function createPull(set, repo, input) {
  const response = await set.client.post(`${repo.path}/pulls`, { body: input });
  const label = `POST ${repo.path}/pulls (head ${input.head})`;
  expect(expectJsonResponse(response, 201, pullShape(), label));
  return objectBody(response, label);
}
async function mergePull(set, repo, number) {
  return set.client.put(`${repo.path}/pulls/${number}/merge`, { body: { merge_method: "squash" } });
}
async function preparePull(set, id, files) {
  const repo = await prepareRepo(set, id);
  const head = `${set.scenario.branchName}-${slug(id)}`;
  await createBranch(set, repo, head, repo.initialCommitSha);
  const changes = files ?? [{ path: variantPath(set.scenario.filePath, slug(id)), content: set.scenario.fileContentAlt }];
  let headCommitSha = repo.initialCommitSha;
  for (const change of changes) {
    const commit = await commitOnBranch(set, repo, { branch: head, filePath: change.path, content: change.content, message: `${set.scenario.commitMessage} (${slug(id)})` });
    headCommitSha = commit.commitSha;
  }
  const pull = await createPull(set, repo, { head, base: repo.defaultBranch, title: set.scenario.pullTitle, body: set.scenario.pullBody });
  return { repo, head, base: repo.defaultBranch, number: numberField(pull, "number"), headCommitSha, changedPaths: changes.map((change) => change.path) };
}
async function secondBranchPull(set, repo, id) {
  const head = `${set.scenario.branchName}-${slug(id)}-b`;
  await createBranch(set, repo, head, repo.initialCommitSha);
  await commitOnBranch(set, repo, { branch: head, filePath: variantPath(set.scenario.filePath, `${slug(id)}-b`), content: set.scenario.fileContentAlt, message: `${set.scenario.commitMessage} (${slug(id)}-b)` });
  const pull = await createPull(set, repo, { head, base: repo.defaultBranch, title: set.scenario.pullTitle, body: set.scenario.pullBody });
  return numberField(pull, "number");
}
var issueShape = () => shapes.object({
  number: shapes.number({ integer: true, min: 1 }),
  title: shapes.string(),
  body: shapes.string(),
  state: shapes.string({ oneOf: ["open", "closed"] }),
  labels: shapes.array(labelShape())
});
async function prepareIssueRepo(set, id) {
  const repo = await prepareRepo(set, id);
  const label = set.scenario.label;
  const response = await set.client.post(`${repo.path}/labels`, { body: { name: label, color: "ededed" } });
  expect(expectJsonResponse(response, 201, labelShape(), `POST ${repo.path}/labels (${label})`));
  return { repo, label };
}
async function createIssue(set, repo, input) {
  const response = await set.client.post(`${repo.path}/issues`, { body: input });
  const label = `POST ${repo.path}/issues (${input.title})`;
  expect(expectJsonResponse(response, 201, issueShape(), label));
  return objectBody(response, label);
}
async function listIssues(set, repo, query) {
  const response = await set.client.get(`${repo.path}/issues`, { query });
  const rendered = Object.entries(query).map(([key, value]) => `${key}=${value}`).join("&");
  const label = `GET ${repo.path}/issues${rendered === "" ? "" : `?${rendered}`}`;
  expect(expectJsonResponse(response, 200, shapes.array(issueShape()), label));
  return arrayBody(response, label);
}
async function setIssueState(set, repo, number, state) {
  const response = await set.client.patch(`${repo.path}/issues/${number}`, { body: { state } });
  const label = `PATCH ${repo.path}/issues/${number} {state:${state}}`;
  expect(expectJsonResponse(response, 200, shapes.object({ number: shapes.number({ integer: true, min: 1 }), state: shapes.string({ oneOf: [state] }) }), label));
  return objectBody(response, label);
}
function issueNumber(issue) {
  return numberField(issue, "number");
}
function positionOf(list, number) {
  return list.findIndex((item) => issueNumber(item) === number);
}
async function reposRoot(set) {
  const response = await set.client.get(`${apiPath()}/`);
  const label = "GET /api/v3/";
  expect(expectJsonResponse(response, 200, shapes.looseObject(), label));
  expect(expectHeader(response, "x-oauth-scopes", label));
}
async function reposMeta(set) {
  const response = await set.client.get(apiPath("meta"));
  expect(expectJsonResponse(response, 200, shapes.object({ installed_version: shapes.string({ nonEmpty: true }) }), "GET /api/v3/meta"));
}
async function reposCreate(set) {
  const name = repoName(set, "repos-create");
  const path = apiPath("repos", set.owner, name);
  const created = await set.client.post(apiPath("user", "repos"), { body: { name, private: true, description: set.scenario.description } });
  expect(expectJsonResponse(created, 201, shapes.object({ name: shapes.string({ oneOf: [name] }), private: shapes.boolean() }), `POST /api/v3/user/repos (${name})`));
  const createdBody = objectBody(created, "POST /api/v3/user/repos");
  if (createdBody.private !== true) fail2(`POST /api/v3/user/repos (${name}) body.private: expected true, got ${JSON.stringify(createdBody.private)}`);
  const first = await set.client.get(path);
  expect(expectJsonResponse(first, 200, shapes.object({ name: shapes.string(), private: shapes.boolean(), default_branch: shapes.string({ nonEmpty: true }) }), `GET ${path}`));
  const repo = objectBody(first, `GET ${path}`);
  if (repo.name !== name) fail2(`GET ${path} body.name: expected ${JSON.stringify(name)}, got ${JSON.stringify(repo.name)}`);
  if (repo.private !== true) fail2(`GET ${path} body.private: expected true, got ${JSON.stringify(repo.private)}`);
  const defaultBranch = stringField(repo, "default_branch");
  const second = await set.client.get(path);
  expect(expectJsonResponse(second, 200, shapes.object({ default_branch: shapes.string({ nonEmpty: true }) }), `GET ${path} (second read)`));
  const again = stringField(objectBody(second, `GET ${path} (second read)`), "default_branch");
  if (again !== defaultBranch) fail2(`GET ${path} body.default_branch changed between reads: ${JSON.stringify(defaultBranch)} then ${JSON.stringify(again)}`);
}
async function reposNotFound(set) {
  const missing = `${set.scenario.repoPrefix}-never-created`;
  const path = apiPath("repos", set.owner, missing);
  const response = await set.client.get(path);
  expect(expectJsonResponse(response, 404, messageShape(), `GET ${path}`));
}
async function reposPatch(set) {
  const repo = await prepareRepo(set, "repos-patch");
  const patched = await set.client.patch(repo.path, { body: { description: set.scenario.descriptionAlt } });
  expect(expectJsonResponse(patched, 200, shapes.object({ description: shapes.string({ oneOf: [set.scenario.descriptionAlt] }) }), `PATCH ${repo.path}`));
  const read = await set.client.get(repo.path);
  expect(expectJsonResponse(read, 200, shapes.object({ description: shapes.string({ oneOf: [set.scenario.descriptionAlt] }) }), `GET ${repo.path} after PATCH`));
}
async function reposDelete(set) {
  const repo = await prepareRepo(set, "repos-delete");
  const deleted = await set.client.delete(repo.path);
  expect(expectStatus(deleted, 204, `DELETE ${repo.path}`));
  const after = await set.client.get(repo.path);
  expect(expectJsonResponse(after, 404, messageShape(), `GET ${repo.path} after DELETE`));
}
async function reposPagination(set) {
  const names = paginationNames(set);
  for (const name of names) {
    const created = await set.client.post(apiPath("user", "repos"), { body: { name, private: true, description: set.scenario.description } });
    if (created.status === 201) {
      expect(expectJsonResponse(created, 201, shapes.object({ name: shapes.string({ oneOf: [name] }) }), `POST /api/v3/user/repos (${name})`));
    } else if (created.status !== 422) {
      fail2(`POST /api/v3/user/repos (${name}): expected status 201, got ${describeResponse(created)}`);
    }
    const present = await set.client.get(apiPath("repos", set.owner, name));
    expect(expectJsonResponse(present, 200, shapes.object({ name: shapes.string({ oneOf: [name] }) }), `GET /api/v3/repos/${set.owner}/${name}`));
  }
  const seen = [];
  const pageSizes = [];
  let next = set.client.url(apiPath("user", "repos"), { per_page: 10 });
  for (let page = 1; next !== null; page += 1) {
    if (page > 20) fail2("pagination did not end within 20 pages");
    if (!sameOrigin(next, set.baseUrl)) fail2(`Link rel="next" left the entry's origin: ${next}`);
    const response = await set.client.get(next);
    const label = `GET ${next}`;
    expect(expectJsonResponse(response, 200, shapes.array(shapes.object({ name: shapes.string({ nonEmpty: true }) })), label));
    const items = arrayBody(response, label);
    if (items.length > 10) fail2(`${label}: returned ${items.length} repositories with per_page=10`);
    pageSizes.push(items.length);
    for (const item of items) seen.push(stringField(item, "name"));
    next = parseLinkHeader(response.headers.get("link")).next;
  }
  const unique = new Set(seen);
  if (unique.size !== seen.length) fail2(`the followed pages repeated a repository (${seen.length} entries, ${unique.size} distinct)`);
  const missing = names.filter((name) => !unique.has(name));
  if (missing.length > 0) fail2(`the followed pages are missing ${missing.length} of the 30 created repositories (first: ${JSON.stringify(missing[0])})`);
  if (pageSizes.length < 3) fail2(`30 repositories at per_page=10 were served in ${pageSizes.length} page(s), expected at least 3`);
}
async function reposBranches(set) {
  const repo = await prepareRepo(set, "repos-branches");
  const branch = `${set.scenario.branchName}-branches`;
  await createBranch(set, repo, branch, repo.initialCommitSha);
  const response = await set.client.get(`${repo.path}/branches`);
  const label = `GET ${repo.path}/branches`;
  expect(expectJsonResponse(response, 200, shapes.array(shapes.object({ name: shapes.string({ nonEmpty: true }), commit: shapes.object({ sha: shaShape() }) })), label));
  const branches = arrayBody(response, label);
  const names = branches.map((entry) => stringField(entry, "name"));
  if (!names.includes(branch)) fail2(`${label}: does not list ${JSON.stringify(branch)} (got ${JSON.stringify(names)})`);
  if (!names.includes(repo.defaultBranch)) fail2(`${label}: does not list the default branch ${JSON.stringify(repo.defaultBranch)}`);
  const found = branches.find((entry) => stringField(entry, "name") === branch);
  const sha = lower((found?.commit ?? {}).sha);
  if (sha !== lower(repo.initialCommitSha)) fail2(`${label}: ${branch} points at ${JSON.stringify(sha)}, expected ${JSON.stringify(repo.initialCommitSha)}`);
}
async function reposCommits(set) {
  const repo = await prepareRepo(set, "repos-commits");
  const branch = `${set.scenario.branchName}-commits`;
  await createBranch(set, repo, branch, repo.initialCommitSha);
  const filePath = variantPath(set.scenario.filePath, "commits");
  const commit = await commitOnBranch(set, repo, { branch, filePath, content: set.scenario.fileContentAlt, message: `${set.scenario.commitMessage} (commits)` });
  const label = `GET ${repo.path}/commits?sha=${branch}`;
  const response = await set.client.get(`${repo.path}/commits`, { query: { sha: branch } });
  expect(expectJsonResponse(response, 200, shapes.array(shapes.object({ sha: shaShape(), commit: shapes.object({ message: shapes.string() }) })), label));
  const commits = arrayBody(response, label);
  const found = commits.find((entry) => lower(entry.sha) === lower(commit.commitSha));
  if (found === void 0) fail2(`${label}: does not list the commit ${commit.commitSha} created on ${branch}`);
  const message = stringField(found.commit, "message");
  if (message !== `${set.scenario.commitMessage} (commits)`) fail2(`${label}: commit message is ${JSON.stringify(message)}`);
  const baseLabel = `GET ${repo.path}/commits`;
  const baseResponse = await set.client.get(`${repo.path}/commits`);
  expect(expectJsonResponse(baseResponse, 200, shapes.array(shapes.object({ sha: shaShape() })), baseLabel));
  const baseCommits = arrayBody(baseResponse, baseLabel);
  if (baseCommits.some((entry) => lower(entry.sha) === lower(commit.commitSha))) {
    fail2(`${baseLabel}: lists ${commit.commitSha}, which was committed to ${branch} only (before any merge)`);
  }
}
async function reposUnauthorized(set) {
  const repo = await prepareRepo(set, "repos-unauthorized", { private: true });
  const response = await set.anon.get(repo.path);
  expect(expectJsonResponse(response, 401, messageShape(), `GET ${repo.path} without a token`));
}
async function reposForeignToken(set) {
  const name = repoName(set, "repos-foreign");
  const own = apiPath("repos", set.owner, name);
  const created = await set.client.post(apiPath("user", "repos"), { body: { name, private: true, description: set.scenario.description } });
  expect(expectJsonResponse(created, 201, shapes.object({ name: shapes.string({ oneOf: [name] }) }), `POST /api/v3/user/repos (${name})`));
  const ownerRead = await set.client.get(own);
  expect(expectJsonResponse(ownerRead, 200, shapes.object({ name: shapes.string({ oneOf: [name] }) }), `GET ${own}`));
  const foreignPath = apiPath("repos", set.otherOwner, name);
  const foreignRead = await set.client.get(foreignPath);
  expect(expectJsonResponse(foreignRead, 404, messageShape(), `GET ${foreignPath} (the same name under ${set.otherOwner})`));
}
async function reposContentsCreate(set) {
  const repo = await prepareRepo(set, "repos-contents-create");
  const filePath = variantPath(set.scenario.filePath, "created");
  const content = set.scenario.fileContentAlt;
  const response = await putContent(set, repo, { filePath, content, message: set.scenario.commitMessage });
  const commit = contentCommit(response, `PUT ${repo.path}/contents/${filePath}`);
  const entry = await getContent(set, repo, filePath);
  if (b64decode(entry.content) !== content) fail2(`GET ${repo.path}/contents/${filePath}: content does not decode to the committed bytes`);
  if (lower(entry.sha) !== lower(commit.contentSha)) fail2(`GET ${repo.path}/contents/${filePath}: sha is ${entry.sha}, expected the PUT's content sha ${commit.contentSha}`);
  if (entry.size !== Buffer.byteLength(content, "utf8")) fail2(`GET ${repo.path}/contents/${filePath}: size is ${entry.size}, expected ${Buffer.byteLength(content, "utf8")}`);
}
async function reposContentsDirectory(set) {
  const repo = await prepareRepo(set, "repos-contents-dir", { filePath: `${set.scenario.dirPath}/seed.txt` });
  const names = ["one.txt", "two.txt"];
  for (const name of names) {
    const filePath = `${set.scenario.dirPath}/${name}`;
    const commit = await putContent(set, repo, { filePath, content: set.scenario.fileContentAlt, message: `${set.scenario.commitMessage} (${name})` });
    contentCommit(commit, `PUT ${repo.path}/contents/${filePath}`);
  }
  const path = apiPath("repos", set.owner, repo.name, "contents", set.scenario.dirPath);
  const response = await set.client.get(path);
  const label = `GET ${path}`;
  expect(expectJsonResponse(response, 200, shapes.array(shapes.object({ type: shapes.string({ oneOf: ["file", "dir"] }), name: shapes.string({ nonEmpty: true }), path: shapes.string({ nonEmpty: true }), sha: shaShape() })), label));
  const entries = arrayBody(response, label);
  const listed = entries.map((entry) => stringField(entry, "name"));
  for (const name of [...names, "seed.txt"]) {
    if (!listed.includes(name)) fail2(`${label}: does not list ${JSON.stringify(name)} (got ${JSON.stringify(listed)})`);
  }
}
async function reposContentsStaleSha(set) {
  const repo = await prepareRepo(set, "repos-contents-stale");
  const current = await getContent(set, repo, set.scenario.filePath);
  const update = await putContent(set, repo, { filePath: set.scenario.filePath, content: set.scenario.fileContentAlt, message: set.scenario.commitMessage, sha: current.sha });
  const updated = contentCommit(update, `PUT ${repo.path}/contents/${set.scenario.filePath} (update)`, [200, 201]);
  if (lower(updated.contentSha) === lower(current.sha)) fail2(`PUT ${repo.path}/contents/${set.scenario.filePath}: the update left the content sha unchanged (${current.sha})`);
  const stale = await putContent(set, repo, { filePath: set.scenario.filePath, content: set.scenario.fileContent, message: set.scenario.commitMessage, sha: current.sha });
  expect(expectJsonResponse(stale, 409, messageShape(), `PUT ${repo.path}/contents/${set.scenario.filePath} with the stale sha ${current.sha}`));
}
async function reposContentsDelete(set) {
  const repo = await prepareRepo(set, "repos-contents-delete");
  const entry = await getContent(set, repo, set.scenario.filePath);
  const path = apiPath("repos", set.owner, repo.name, "contents", set.scenario.filePath);
  const deleted = await set.client.delete(path, { body: { message: set.scenario.commitMessage, sha: entry.sha } });
  expect(expectJsonResponse(deleted, 200, shapes.object({ commit: shapes.object({ sha: shaShape() }) }), `DELETE ${path}`));
  const after = await set.client.get(path);
  expect(expectJsonResponse(after, 404, messageShape(), `GET ${path} after DELETE`));
}
async function issuesCreate(set) {
  const { repo, label } = await prepareIssueRepo(set, "issues-create");
  const issue = await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody, labels: [label] });
  if (issue.state !== "open") fail2(`POST ${repo.path}/issues: body.state is ${JSON.stringify(issue.state)}, expected "open"`);
}
async function issuesCreateTitleBody(set) {
  const { repo } = await prepareIssueRepo(set, "issues-create-echo");
  const issue = await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody });
  if (issue.title !== set.scenario.issueTitle) fail2(`POST ${repo.path}/issues: body.title is ${JSON.stringify(issue.title)}, expected ${JSON.stringify(set.scenario.issueTitle)}`);
  if (issue.body !== set.scenario.issueBody) fail2(`POST ${repo.path}/issues: body.body is not the submitted body`);
}
async function issuesCreateLabels(set) {
  const { repo, label } = await prepareIssueRepo(set, "issues-create-labels");
  const issue = await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody, labels: [label] });
  const labels = issue.labels.map((entry) => stringField(entry, "name"));
  if (!labels.includes(label)) fail2(`POST ${repo.path}/issues: body.labels is ${JSON.stringify(labels)}, expected it to include ${JSON.stringify(label)}`);
}
async function issuesNumbersIncrement(set) {
  const { repo } = await prepareIssueRepo(set, "issues-numbers");
  const first = await createIssue(set, repo, { title: `${set.scenario.issueTitle} 1`, body: set.scenario.issueBody });
  const second = await createIssue(set, repo, { title: `${set.scenario.issueTitle} 2`, body: set.scenario.issueBody });
  if (issueNumber(second) !== issueNumber(first) + 1) fail2(`the second issue's number is ${issueNumber(second)}, expected ${issueNumber(first) + 1}`);
}
async function issuesListOpen(set) {
  const { repo } = await prepareIssueRepo(set, "issues-list-open");
  const open = await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody });
  const closed = await createIssue(set, repo, { title: `${set.scenario.issueTitle} closed`, body: set.scenario.issueBody });
  await setIssueState(set, repo, issueNumber(closed), "closed");
  const list = await listIssues(set, repo, { state: "open", per_page: 100 });
  if (!list.some((issue) => issueNumber(issue) === issueNumber(open))) fail2(`GET ${repo.path}/issues?state=open does not list the open issue ${issueNumber(open)}`);
  for (const issue of list) {
    if (issue.state !== "open") fail2(`GET ${repo.path}/issues?state=open lists issue ${issueNumber(issue)} in state ${JSON.stringify(issue.state)}`);
  }
}
async function issuesListOpenExcludesClosed(set) {
  const { repo } = await prepareIssueRepo(set, "issues-list-closed");
  const closed = await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody });
  await setIssueState(set, repo, issueNumber(closed), "closed");
  const list = await listIssues(set, repo, { state: "open", per_page: 100 });
  if (list.some((issue) => issueNumber(issue) === issueNumber(closed))) fail2(`GET ${repo.path}/issues?state=open lists the closed issue ${issueNumber(closed)}`);
}
async function issuesListSortAsc(set) {
  const { repo } = await prepareIssueRepo(set, "issues-sort-asc");
  const created = [
    await createIssue(set, repo, { title: `${set.scenario.issueTitle} a`, body: set.scenario.issueBody }),
    await createIssue(set, repo, { title: `${set.scenario.issueTitle} b`, body: set.scenario.issueBody }),
    await createIssue(set, repo, { title: `${set.scenario.issueTitle} c`, body: set.scenario.issueBody })
  ].map(issueNumber);
  const list = await listIssues(set, repo, { state: "open", sort: "created", direction: "asc", per_page: 100 });
  const positions = created.map((number) => positionOf(list, number));
  if (positions.some((position) => position === -1)) fail2(`GET ${repo.path}/issues?sort=created&direction=asc does not list every created issue (numbers ${JSON.stringify(created)})`);
  if (!(positions[0] < positions[1] && positions[1] < positions[2])) fail2(`ascending creation order is ${JSON.stringify(positions)}, expected the three issues in creation order`);
}
async function issuesListSortDesc(set) {
  const { repo } = await prepareIssueRepo(set, "issues-sort-desc");
  const created = [
    await createIssue(set, repo, { title: `${set.scenario.issueTitle} a`, body: set.scenario.issueBody }),
    await createIssue(set, repo, { title: `${set.scenario.issueTitle} b`, body: set.scenario.issueBody }),
    await createIssue(set, repo, { title: `${set.scenario.issueTitle} c`, body: set.scenario.issueBody })
  ].map(issueNumber);
  const list = await listIssues(set, repo, { state: "open", sort: "created", direction: "desc", per_page: 100 });
  const positions = created.map((number) => positionOf(list, number));
  if (positions.some((position) => position === -1)) fail2(`GET ${repo.path}/issues?sort=created&direction=desc does not list every created issue (numbers ${JSON.stringify(created)})`);
  if (!(positions[2] < positions[1] && positions[1] < positions[0])) fail2(`descending creation order is ${JSON.stringify(positions)}, expected the newest first`);
}
async function issuesListShape(set) {
  const { repo } = await prepareIssueRepo(set, "issues-list-shape");
  await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody });
  const list = await listIssues(set, repo, { state: "open", per_page: 10 });
  if (list.length === 0) fail2(`GET ${repo.path}/issues?state=open returned no issues after one was created`);
  for (const issue of list) {
    const problem = checkShape(issue, issueShape(), `GET ${repo.path}/issues body item`);
    if (problem !== null) fail2(problem);
  }
}
async function issuesGetOne(set) {
  const { repo } = await prepareIssueRepo(set, "issues-get-one");
  const created = await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody });
  const number = issueNumber(created);
  const response = await set.client.get(`${repo.path}/issues/${number}`);
  const label = `GET ${repo.path}/issues/${number}`;
  expect(expectJsonResponse(response, 200, issueShape(), label));
  const issue = objectBody(response, label);
  if (issueNumber(issue) !== number) fail2(`${label}: body.number is ${JSON.stringify(issue.number)}, expected ${number}`);
  if (issue.title !== set.scenario.issueTitle) fail2(`${label}: body.title does not match the created issue`);
  if (issue.body !== set.scenario.issueBody) fail2(`${label}: body.body does not match the created issue`);
}
async function issuesPatchClose(set) {
  const { repo } = await prepareIssueRepo(set, "issues-patch-close");
  const created = await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody });
  const number = issueNumber(created);
  const patched = await setIssueState(set, repo, number, "closed");
  if (patched.state !== "closed") fail2(`PATCH ${repo.path}/issues/${number}: body.state is ${JSON.stringify(patched.state)}, expected "closed"`);
}
async function issuesPatchClosePersists(set) {
  const { repo } = await prepareIssueRepo(set, "issues-close-persists");
  const created = await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody });
  const number = issueNumber(created);
  await setIssueState(set, repo, number, "closed");
  const response = await set.client.get(`${repo.path}/issues/${number}`);
  const label = `GET ${repo.path}/issues/${number} after close`;
  expect(expectJsonResponse(response, 200, issueShape(), label));
  const issue = objectBody(response, label);
  if (issue.state !== "closed") fail2(`${label}: body.state is ${JSON.stringify(issue.state)}, expected "closed"`);
}
async function issuesCommentCreate(set) {
  const { repo } = await prepareIssueRepo(set, "issues-comment-create");
  const created = await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody });
  const number = issueNumber(created);
  const response = await set.client.post(`${repo.path}/issues/${number}/comments`, { body: { body: set.scenario.commentBody } });
  const label = `POST ${repo.path}/issues/${number}/comments`;
  expect(
    expectJsonResponse(
      response,
      201,
      shapes.object({ id: shapes.number({ integer: true, min: 1 }), body: shapes.string({ oneOf: [set.scenario.commentBody] }) }),
      label
    )
  );
}
async function issuesCommentsList(set) {
  const { repo } = await prepareIssueRepo(set, "issues-comments-list");
  const created = await createIssue(set, repo, { title: set.scenario.issueTitle, body: set.scenario.issueBody });
  const number = issueNumber(created);
  const posted = await set.client.post(`${repo.path}/issues/${number}/comments`, { body: { body: set.scenario.commentBody } });
  expect(
    expectJsonResponse(
      posted,
      201,
      shapes.object({ id: shapes.number({ integer: true, min: 1 }), body: shapes.string({ oneOf: [set.scenario.commentBody] }) }),
      `POST ${repo.path}/issues/${number}/comments`
    )
  );
  const commentId = numberField(objectBody(posted, `POST ${repo.path}/issues/${number}/comments`), "id");
  const response = await set.client.get(`${repo.path}/issues/${number}/comments`);
  const label = `GET ${repo.path}/issues/${number}/comments`;
  expect(expectJsonResponse(response, 200, shapes.array(shapes.object({ id: shapes.number({ integer: true, min: 1 }), body: shapes.string() })), label));
  const comments = arrayBody(response, label);
  if (!comments.some((comment) => numberField(comment, "id") === commentId && comment.body === set.scenario.commentBody)) {
    fail2(`${label}: does not list comment ${commentId} with the posted body`);
  }
}
async function issuesBadLabel(set) {
  const { repo } = await prepareIssueRepo(set, "issues-bad-label");
  const response = await set.client.post(`${repo.path}/issues`, { body: { title: set.scenario.issueTitle, body: set.scenario.issueBody, labels: [set.scenario.badLabel] } });
  expect(expectJsonResponse(response, 422, messageShape(), `POST ${repo.path}/issues with the unknown label ${JSON.stringify(set.scenario.badLabel)}`));
}
async function pullsCreate(set) {
  const fixture = await preparePull(set, "pulls-create");
  const response = await set.client.get(`${fixture.repo.path}/pulls/${fixture.number}`);
  const label = `GET ${fixture.repo.path}/pulls/${fixture.number}`;
  expect(expectJsonResponse(response, 200, pullShape(), label));
  const pull = objectBody(response, label);
  if (pull.state !== "open") fail2(`${label}: body.state is ${JSON.stringify(pull.state)}, expected "open"`);
  if (stringField(pull.head, "ref") !== fixture.head) fail2(`${label}: body.head.ref is ${JSON.stringify(stringField(pull.head, "ref"))}, expected ${JSON.stringify(fixture.head)}`);
  if (stringField(pull.base, "ref") !== fixture.base) fail2(`${label}: body.base.ref is ${JSON.stringify(stringField(pull.base, "ref"))}, expected ${JSON.stringify(fixture.base)}`);
}
async function pullsCreateBody(set) {
  const fixture = await preparePull(set, "pulls-create-body");
  const response = await set.client.get(`${fixture.repo.path}/pulls/${fixture.number}`);
  const label = `GET ${fixture.repo.path}/pulls/${fixture.number}`;
  expect(expectJsonResponse(response, 200, pullShape(), label));
  const pull = objectBody(response, label);
  if (pull.title !== set.scenario.pullTitle) fail2(`${label}: body.title does not match the submitted title`);
  if (pull.body !== set.scenario.pullBody) fail2(`${label}: body.body does not match the submitted body`);
}
async function pullsCreateHeadSha(set) {
  const fixture = await preparePull(set, "pulls-create-head");
  const response = await set.client.get(`${fixture.repo.path}/pulls/${fixture.number}`);
  const label = `GET ${fixture.repo.path}/pulls/${fixture.number}`;
  expect(expectJsonResponse(response, 200, pullShape(), label));
  const sha = lower(stringField(objectBody(response, label).head, "sha"));
  if (sha !== lower(fixture.headCommitSha)) fail2(`${label}: body.head.sha is ${JSON.stringify(sha)}, expected the head branch tip ${JSON.stringify(fixture.headCommitSha)}`);
}
async function pullsCreateBaseSha(set) {
  const fixture = await preparePull(set, "pulls-create-base");
  const response = await set.client.get(`${fixture.repo.path}/pulls/${fixture.number}`);
  const label = `GET ${fixture.repo.path}/pulls/${fixture.number}`;
  expect(expectJsonResponse(response, 200, pullShape(), label));
  const sha = lower(stringField(objectBody(response, label).base, "sha"));
  if (sha !== lower(fixture.repo.initialCommitSha)) fail2(`${label}: body.base.sha is ${JSON.stringify(sha)}, expected the base tip ${JSON.stringify(fixture.repo.initialCommitSha)}`);
}
async function pullsGetOne(set) {
  const fixture = await preparePull(set, "pulls-get-one");
  const response = await set.client.get(`${fixture.repo.path}/pulls/${fixture.number}`);
  const label = `GET ${fixture.repo.path}/pulls/${fixture.number}`;
  expect(expectJsonResponse(response, 200, pullShape(), label));
  const pull = objectBody(response, label);
  if (numberField(pull, "number") !== fixture.number) fail2(`${label}: body.number is ${JSON.stringify(pull.number)}, expected ${fixture.number}`);
  if (pull.title !== set.scenario.pullTitle) fail2(`${label}: body.title does not match the created pull request`);
}
var pullFileShape = () => shapes.object({
  filename: shapes.string({ nonEmpty: true }),
  status: shapes.string({ nonEmpty: true }),
  additions: shapes.number({ integer: true, min: 0 }),
  deletions: shapes.number({ integer: true, min: 0 }),
  changes: shapes.number({ integer: true, min: 0 })
});
async function pullsFiles(set, id, files) {
  const fixture = await preparePull(set, id, files);
  const response = await set.client.get(`${fixture.repo.path}/pulls/${fixture.number}/files`);
  const label = `GET ${fixture.repo.path}/pulls/${fixture.number}/files`;
  expect(expectJsonResponse(response, 200, shapes.array(pullFileShape()), label));
  return { fixture, files: arrayBody(response, label) };
}
async function pullsFilesList(set) {
  const { fixture, files } = await pullsFiles(set, "pulls-files-list");
  const wanted = fixture.changedPaths[0] ?? "";
  const found = files.find((file) => stringField(file, "filename") === wanted);
  if (found === void 0) fail2(`GET ${fixture.repo.path}/pulls/${fixture.number}/files does not list ${JSON.stringify(wanted)}`);
  if (!["added", "modified", "changed"].includes(stringField(found, "status"))) fail2(`pull file ${wanted}: status is ${JSON.stringify(found.status)}, expected added or modified`);
  if (numberField(found, "additions") < 1) fail2(`pull file ${wanted}: additions is ${JSON.stringify(found.additions)}, expected at least 1`);
}
async function pullsFilesShape(set) {
  const { fixture, files } = await pullsFiles(set, "pulls-files-shape");
  if (files.length === 0) fail2(`GET ${fixture.repo.path}/pulls/${fixture.number}/files returned no files for a pull request that changed one`);
  for (const file of files) {
    const problem = checkShape(file, pullFileShape(), `GET ${fixture.repo.path}/pulls/${fixture.number}/files body item`);
    if (problem !== null) fail2(problem);
  }
}
async function pullsFilesMultiple(set) {
  const first = variantPath(set.scenario.filePath, "multi-a");
  const second = variantPath(set.scenario.filePath, "multi-b");
  const { fixture, files } = await pullsFiles(set, "pulls-files-multiple", [
    { path: first, content: set.scenario.fileContentAlt },
    { path: second, content: set.scenario.fileContent }
  ]);
  const listed = files.map((file) => stringField(file, "filename"));
  for (const path of [first, second]) {
    if (!listed.includes(path)) fail2(`GET ${fixture.repo.path}/pulls/${fixture.number}/files lists ${JSON.stringify(listed)}, expected ${JSON.stringify(path)}`);
  }
}
async function mergedPull(set, id) {
  const fixture = await preparePull(set, id);
  const response = await mergePull(set, fixture.repo, fixture.number);
  const label = `PUT ${fixture.repo.path}/pulls/${fixture.number}/merge`;
  expect(expectJsonResponse(response, 200, shapes.object({ merged: shapes.boolean(), sha: shaShape(), message: shapes.string() }), label));
  const body = objectBody(response, label);
  if (body.merged !== true) fail2(`${label}: body.merged is ${JSON.stringify(body.merged)}, expected true`);
  return { fixture, mergeSha: stringField(body, "sha") };
}
async function pullsMergeStatus(set) {
  const fixture = await preparePull(set, "pulls-merge-status");
  const response = await mergePull(set, fixture.repo, fixture.number);
  expect(expectStatus(response, 200, `PUT ${fixture.repo.path}/pulls/${fixture.number}/merge`));
}
async function pullsMergeBody(set) {
  const { mergeSha } = await mergedPull(set, "pulls-merge-body");
  if (!SHA40.test(mergeSha)) fail2(`the merge sha ${JSON.stringify(mergeSha)} is not a 40-character hex commit id`);
}
async function pullsMergeCloses(set) {
  const { fixture } = await mergedPull(set, "pulls-merge-closes");
  const response = await set.client.get(`${fixture.repo.path}/pulls/${fixture.number}`);
  const label = `GET ${fixture.repo.path}/pulls/${fixture.number} after merge`;
  expect(
    expectJsonResponse(
      response,
      200,
      shapes.object({ state: shapes.string({ oneOf: ["closed"] }), merged: shapes.boolean(), merged_at: shapes.string({ nonEmpty: true }) }),
      label
    )
  );
  const pull = objectBody(response, label);
  if (pull.merged !== true) fail2(`${label}: body.merged is ${JSON.stringify(pull.merged)}, expected true`);
}
async function pullsMergeCommitOnDefault(set) {
  const { fixture, mergeSha } = await mergedPull(set, "pulls-merge-on-default");
  const response = await set.client.get(`${fixture.repo.path}/commits`, { query: { sha: fixture.base } });
  const label = `GET ${fixture.repo.path}/commits?sha=${fixture.base}`;
  expect(expectJsonResponse(response, 200, shapes.array(shapes.object({ sha: shaShape() })), label));
  const commits = arrayBody(response, label);
  if (!commits.some((commit) => lower(commit.sha) === lower(mergeSha))) fail2(`${label}: does not list the merge commit ${mergeSha}`);
}
async function pullsMergeContentOnDefault(set) {
  const { fixture } = await mergedPull(set, "pulls-merge-content");
  const changedPath = fixture.changedPaths[0] ?? "";
  const entry = await getContent(set, fixture.repo, changedPath, fixture.base);
  if (b64decode(entry.content) !== set.scenario.fileContentAlt) fail2(`GET contents/${changedPath}?ref=${fixture.base}: content does not decode to the merged bytes`);
}
async function pullsMergeCommitSha(set) {
  const { fixture, mergeSha } = await mergedPull(set, "pulls-merge-commit-sha");
  const response = await set.client.get(`${fixture.repo.path}/pulls/${fixture.number}`);
  const label = `GET ${fixture.repo.path}/pulls/${fixture.number} after merge`;
  expect(expectJsonResponse(response, 200, shapes.object({ merge_commit_sha: shaShape() }), label));
  const reported = lower(stringField(objectBody(response, label), "merge_commit_sha"));
  if (reported !== lower(mergeSha)) fail2(`${label}: body.merge_commit_sha is ${JSON.stringify(reported)}, expected the merge sha ${JSON.stringify(mergeSha)}`);
}
async function pullsMergeUnknown(set) {
  const repo = await prepareRepo(set, "pulls-merge-unknown");
  const response = await mergePull(set, repo, 999999999);
  expect(expectJsonResponse(response, 404, messageShape(), `PUT ${repo.path}/pulls/999999999/merge`));
}
async function pullsMergeConflict(set) {
  const repo = await prepareRepo(set, "pulls-merge-conflict");
  const branchA = `${set.scenario.branchName}-conflict-a`;
  const branchB = `${set.scenario.branchName}-conflict-b`;
  await createBranch(set, repo, branchA, repo.initialCommitSha);
  await createBranch(set, repo, branchB, repo.initialCommitSha);
  const filePath = set.scenario.filePath;
  await commitOnBranch(set, repo, { branch: branchA, filePath, content: `${set.scenario.fileContentAlt} (a)`, message: `${set.scenario.commitMessage} (conflict a)`, update: true });
  await commitOnBranch(set, repo, { branch: branchB, filePath, content: `${set.scenario.fileContentAlt} (b)`, message: `${set.scenario.commitMessage} (conflict b)`, update: true });
  const first = await createPull(set, repo, { head: branchA, base: repo.defaultBranch, title: `${set.scenario.pullTitle} a`, body: set.scenario.pullBody });
  const second = await createPull(set, repo, { head: branchB, base: repo.defaultBranch, title: `${set.scenario.pullTitle} b`, body: set.scenario.pullBody });
  const firstMerge = await mergePull(set, repo, numberField(first, "number"));
  expect(expectStatus(firstMerge, 200, `PUT ${repo.path}/pulls/${numberField(first, "number")}/merge (first)`));
  const conflicted = await mergePull(set, repo, numberField(second, "number"));
  expect(expectJsonResponse(conflicted, 405, messageShape(), `PUT ${repo.path}/pulls/${numberField(second, "number")}/merge (conflicted)`));
}
async function pullsListStateAll(set) {
  const { fixture } = await mergedPull(set, "pulls-list-all");
  const open = await secondBranchPull(set, fixture.repo, "pulls-list-all");
  const response = await set.client.get(`${fixture.repo.path}/pulls`, { query: { state: "all", per_page: 100 } });
  const label = `GET ${fixture.repo.path}/pulls?state=all`;
  expect(expectJsonResponse(response, 200, shapes.array(pullShape()), label));
  const numbers = arrayBody(response, label).map((pull) => numberField(pull, "number"));
  for (const number of [fixture.number, open]) {
    if (!numbers.includes(number)) fail2(`${label}: does not list pull request ${number} (got ${JSON.stringify(numbers)})`);
  }
}
async function pullsListDefaultOpen(set) {
  const { fixture } = await mergedPull(set, "pulls-list-open");
  const open = await secondBranchPull(set, fixture.repo, "pulls-list-open");
  const response = await set.client.get(`${fixture.repo.path}/pulls`, { query: { per_page: 100 } });
  const label = `GET ${fixture.repo.path}/pulls`;
  expect(expectJsonResponse(response, 200, shapes.array(pullShape()), label));
  const numbers = arrayBody(response, label).map((pull) => numberField(pull, "number"));
  if (numbers.includes(fixture.number)) fail2(`${label}: lists the merged pull request ${fixture.number}; the default state is open only`);
  if (!numbers.includes(open)) fail2(`${label}: does not list the open pull request ${open}`);
}
async function pullsListShape(set) {
  const fixture = await preparePull(set, "pulls-list-shape");
  const response = await set.client.get(`${fixture.repo.path}/pulls`, { query: { state: "all", per_page: 10 } });
  const label = `GET ${fixture.repo.path}/pulls?state=all`;
  expect(expectJsonResponse(response, 200, shapes.array(pullShape()), label));
  const list = arrayBody(response, label);
  if (list.length === 0) fail2(`${label} returned no pull requests after one was opened`);
  for (const pull of list) {
    const problem = checkShape(pull, pullShape(), `${label} body item`);
    if (problem !== null) fail2(problem);
  }
}
async function pullsGetUnknown(set) {
  const repo = await prepareRepo(set, "pulls-get-unknown");
  const response = await set.client.get(`${repo.path}/pulls/999999999`);
  expect(expectJsonResponse(response, 404, messageShape(), `GET ${repo.path}/pulls/999999999`));
}
async function protocolContentType(set) {
  const repo = await prepareRepo(set, "protocol-content-type");
  const calls = [
    { label: "GET /api/v3/", run: () => set.client.get(`${apiPath()}/`) },
    { label: "GET /api/v3/meta", run: () => set.client.get(apiPath("meta")) },
    { label: `GET ${repo.path}`, run: () => set.client.get(repo.path) },
    { label: `GET ${repo.path}/issues`, run: () => set.client.get(`${repo.path}/issues`) },
    { label: "GET an unknown route", run: () => set.client.get(apiPath("no-such-route-content-type")) },
    { label: `GET ${repo.path} without a token`, run: () => set.anon.get(repo.path) }
  ];
  for (const call of calls) {
    const response = await call.run();
    if (response.status === 0) fail2(`${call.label}: ${describeResponse(response)}`);
    if (!isJsonContentType(response.contentType)) fail2(`${call.label}: content-type is ${response.contentType ?? "none"}, expected application/json`);
    expect(expectNoHtml(response, call.label));
  }
}
async function protocolUnknownRoute(set) {
  const path = apiPath("no-such-route", set.scenario.repoPrefix);
  const response = await set.client.get(path);
  expect(expectJsonResponse(response, 404, messageShape(), `GET ${path}`));
  expect(expectNoHtml(response, `GET ${path}`));
}
async function protocolMalformedBody(set) {
  const path = apiPath("user", "repos");
  const response = await set.client.post(path, { rawBody: '{"name":', headers: { "content-type": "application/json" } });
  expect(expectJsonResponse(response, 400, messageShape(), `POST ${path} with the body {"name":`));
}
async function protocolRequestId(set) {
  const repo = await prepareRepo(set, "protocol-request-id");
  const calls = [
    { label: "GET /api/v3/", run: () => set.client.get(`${apiPath()}/`) },
    { label: `GET ${repo.path}`, run: () => set.client.get(repo.path) },
    { label: "GET an unknown route", run: () => set.client.get(apiPath("no-such-route-request-id")) },
    { label: `GET ${repo.path} without a token`, run: () => set.anon.get(repo.path) }
  ];
  for (const call of calls) {
    const response = await call.run();
    if (response.status === 0) fail2(`${call.label}: ${describeResponse(response)}`);
    expect(expectHeader(response, "x-github-request-id", call.label, { nonEmpty: true }));
  }
}
async function protocolErrorMessage(set) {
  const missing = await set.client.get(apiPath("repos", set.owner, `${set.scenario.repoPrefix}-never-created`));
  expect(expectJsonResponse(missing, 404, messageShape(), "GET a missing repository"));
  const repo = await prepareRepo(set, "protocol-error-message", { private: true });
  const unauthorized = await set.anon.get(repo.path);
  expect(expectJsonResponse(unauthorized, 401, messageShape(), `GET ${repo.path} without a token`));
  const { repo: issueRepo } = await prepareIssueRepo(set, "protocol-error-message-issues");
  const unprocessable = await set.client.post(`${issueRepo.path}/issues`, { body: { title: set.scenario.issueTitle, body: set.scenario.issueBody, labels: [set.scenario.badLabel] } });
  expect(expectJsonResponse(unprocessable, 422, messageShape(), `POST ${issueRepo.path}/issues with an unknown label`));
}

// env/src/graphql-client.ts
var GRAPHQL_PATH = "/api/graphql";
var GRAPHQL_DEFAULT_TIMEOUT_MS = 1e4;
var GRAPHQL_USER_AGENT = "makefun-github-core-clone-env/1";
var DEFAULT_FETCH = (input, init) => fetch(input, init);
function timeoutOf(value, fallback) {
  if (value === void 0) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`timeoutMs must be a positive finite number, got ${String(value)}`);
  }
  return Math.max(1, Math.round(value));
}
function describeError2(err) {
  if (err instanceof Error) return err.name === "Error" ? err.message : `${err.name}: ${err.message}`;
  return String(err);
}
function preview(text) {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length <= 120 ? flat : `${flat.slice(0, 117)}...`;
}
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function errorsOf(value) {
  if (!Array.isArray(value)) return [];
  const errors = [];
  for (const entry of value) {
    if (!isRecord2(entry)) continue;
    const message = entry.message;
    if (typeof message !== "string") continue;
    const error = { message };
    if (Array.isArray(entry.path)) error.path = entry.path.filter((p) => typeof p === "string" || typeof p === "number");
    if (Array.isArray(entry.locations)) {
      const locations = [];
      for (const location of entry.locations) {
        if (!isRecord2(location)) continue;
        const { line, column } = location;
        if (typeof line === "number" && typeof column === "number") locations.push({ line, column });
      }
      if (locations.length > 0) error.locations = locations;
    }
    if (isRecord2(entry.extensions)) error.extensions = entry.extensions;
    errors.push(error);
  }
  return errors;
}
var GraphQLClient = class _GraphQLClient {
  /** The entry base URL, without its trailing slashes. */
  baseUrl;
  /** The bearer token, or null for an unauthenticated client. */
  token;
  /** The default per-call timeout, in milliseconds. */
  timeoutMs;
  fetchImpl;
  userAgent;
  headers;
  constructor(options) {
    if (typeof options.baseUrl !== "string" || options.baseUrl.trim() === "") {
      throw new Error("GraphQLClient needs a baseUrl");
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/u, "");
    this.token = options.token;
    this.timeoutMs = timeoutOf(options.timeoutMs, GRAPHQL_DEFAULT_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl ?? DEFAULT_FETCH;
    this.userAgent = options.userAgent ?? GRAPHQL_USER_AGENT;
    this.headers = options.headers ?? {};
  }
  /** The absolute URL this client posts documents to. */
  endpoint() {
    return `${this.baseUrl}${GRAPHQL_PATH}`;
  }
  /** The same configuration with no bearer token, for the unauthenticated check. */
  withoutToken() {
    return new _GraphQLClient({
      baseUrl: this.baseUrl,
      token: null,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      userAgent: this.userAgent,
      headers: this.headers
    });
  }
  /** Run one operation. Never throws for an HTTP status or a GraphQL `errors` array. */
  async request(document, variables = {}, options = {}) {
    const exchange = await this.exchange({ query: document, variables }, options);
    if (exchange.transportError !== void 0 || exchange.parseError !== void 0) {
      return {
        status: exchange.status,
        data: null,
        errors: [],
        body: exchange.body,
        text: exchange.text,
        transportError: exchange.transportError,
        parseError: exchange.parseError
      };
    }
    if (!isRecord2(exchange.body)) {
      return {
        status: exchange.status,
        data: null,
        errors: [],
        body: exchange.body,
        text: exchange.text,
        parseError: `expected one JSON object for one operation, got ${Array.isArray(exchange.body) ? "an array" : "a non-object body"}`
      };
    }
    return this.envelopeOf(exchange.status, exchange.body, exchange.text);
  }
  /** Run several operations in one HTTP body (a JSON array), answered in the same order. */
  async batch(operations, options = {}) {
    if (operations.length === 0) throw new Error("batch() needs at least one operation");
    const body = operations.map((operation) => {
      const entry = { query: operation.query, variables: operation.variables ?? {} };
      if (operation.operationName !== void 0) entry.operationName = operation.operationName;
      return entry;
    });
    const exchange = await this.exchange(body, options);
    if (exchange.transportError !== void 0 || exchange.parseError !== void 0) {
      return {
        status: exchange.status,
        responses: [],
        text: exchange.text,
        transportError: exchange.transportError,
        parseError: exchange.parseError
      };
    }
    if (!Array.isArray(exchange.body)) {
      return {
        status: exchange.status,
        responses: [],
        text: exchange.text,
        parseError: `expected a JSON array of ${operations.length} responses, got ${isRecord2(exchange.body) ? "one object" : "a non-array body"}`
      };
    }
    const responses = exchange.body.map((entry) => {
      if (!isRecord2(entry)) {
        return {
          status: exchange.status,
          data: null,
          errors: [],
          body: entry,
          text: exchange.text,
          parseError: "a batched response entry is not a JSON object"
        };
      }
      return this.envelopeOf(exchange.status, entry, exchange.text);
    });
    return { status: exchange.status, responses, text: exchange.text };
  }
  /** POST one JSON body and read the raw exchange back. */
  async exchange(body, options) {
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": this.userAgent,
      ...this.headers
    };
    if (this.token !== null) headers.authorization = `Bearer ${this.token}`;
    const timeoutMs = timeoutOf(options.timeoutMs, this.timeoutMs);
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal === void 0 ? timeout : AbortSignal.any([options.signal, timeout]);
    let response;
    try {
      response = await this.fetchImpl(this.endpoint(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal
      });
    } catch (err) {
      return { status: 0, text: "", body: null, transportError: describeError2(err) };
    }
    let text;
    try {
      text = await response.text();
    } catch (err) {
      return { status: response.status, text: "", body: null, transportError: `could not read the response body: ${describeError2(err)}` };
    }
    if (text.trim() === "") return { status: response.status, text, body: null };
    try {
      return { status: response.status, text, body: JSON.parse(text) };
    } catch {
      const contentType = response.headers.get("content-type") ?? "no content-type";
      return { status: response.status, text, body: null, parseError: `response is not JSON (${contentType}): ${preview(text)}` };
    }
  }
  /** Read one operation's {data, errors} envelope from a parsed body. */
  envelopeOf(status, record, text) {
    const data = "data" in record ? record.data : null;
    const errors = errorsOf(record.errors);
    if (!("data" in record) && errors.length === 0 && status >= 200 && status < 300) {
      return {
        status,
        data: null,
        errors,
        body: record,
        text,
        parseError: `response body has neither data nor errors (keys: ${Object.keys(record).sort().join(", ") || "none"})`
      };
    }
    return { status, data, errors, body: record, text };
  }
};

// env/src/checks-graphql.ts
var gitAdapter = null;
function configureGraphQLGit(git) {
  gitAdapter = git;
}
var VIEWER_LOGIN = `query ViewerLogin {
  viewer {
    login
  }
}`;
var REPOSITORY_FIELDS = `query RepositoryFields($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
    databaseId
    name
    owner {
      login
    }
    defaultBranchRef {
      name
    }
    viewerPermission
    hasIssuesEnabled
  }
}`;
var ISSUE_FIELDS = `query Issue_fields {
  Issue: __type(name: "Issue") {
    fields(includeDeprecated: true) {
      name
    }
  }
}`;
var TYPE_FIELDS = `query PullRequestAndRepositoryFields {
  PullRequest: __type(name: "PullRequest") {
    fields(includeDeprecated: true) {
      name
    }
  }
  Repository: __type(name: "Repository") {
    fields(includeDeprecated: true) {
      name
    }
  }
}`;
var SEARCH_TYPE_ENUM_VALUES = `query SearchType_enumValues {
  SearchType: __type(name: "SearchType") {
    enumValues(includeDeprecated: true) {
      name
    }
  }
}`;
var OPEN_ISSUES = `query OpenIssues($owner: String!, $name: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    issues(first: $first, states: [OPEN], orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        number
        title
        state
        id
      }
    }
  }
}`;
var ISSUE_BY_NUMBER = `query IssueByNumber($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      number
      title
      state
      id
      body
    }
  }
}`;
var CREATE_ISSUE = `mutation IssueCreate($input: CreateIssueInput!) {
  createIssue(input: $input) {
    issue {
      number
      id
    }
  }
}`;
var CLOSE_ISSUE = `mutation IssueClose($input: CloseIssueInput!) {
  closeIssue(input: $input) {
    issue {
      number
      id
      state
    }
  }
}`;
var PULL_REQUESTS = `query PullRequests($owner: String!, $name: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: $first) {
      nodes {
        number
        headRefName
        baseRefName
        mergeable
        state
      }
    }
  }
}`;
var PULL_REQUEST_FILES = `query PullRequestFiles($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      files(first: 10) {
        nodes {
          path
        }
      }
    }
  }
}`;
var PULL_REQUEST_ID = `query PullRequestId($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      number
    }
  }
}`;
var CREATE_PULL_REQUEST = `mutation PullRequestCreate($input: CreatePullRequestInput!) {
  createPullRequest(input: $input) {
    pullRequest {
      number
      id
      state
      headRefName
      baseRefName
    }
  }
}`;
var MERGE_PULL_REQUEST = `mutation MergePullRequest($input: MergePullRequestInput!) {
  mergePullRequest(input: $input) {
    pullRequest {
      number
      merged
      state
    }
  }
}`;
var ADD_COMMENT = `mutation AddComment($input: AddCommentInput!) {
  addComment(input: $input) {
    commentEdge {
      node {
        id
        body
      }
    }
  }
}`;
var INVALID_FIELD = `query ViewerInvalidField {
  viewer {
    login
    noSuchFieldOnViewer
  }
}`;
var NODE_REPOSITORY = `query NodeRepository($id: ID!) {
  node(id: $id) {
    id
    ... on Repository {
      name
      nameWithOwner
    }
  }
}`;
var ISSUES_PAGE = `query IssuesPage($owner: String!, $name: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: $first, after: $after) {
      nodes {
        number
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;
var GRAPHQL_DOCUMENTS = Object.freeze({
  viewerLogin: VIEWER_LOGIN,
  repositoryFields: REPOSITORY_FIELDS,
  issueFields: ISSUE_FIELDS,
  typeFields: TYPE_FIELDS,
  searchTypeEnumValues: SEARCH_TYPE_ENUM_VALUES,
  openIssues: OPEN_ISSUES,
  issueByNumber: ISSUE_BY_NUMBER,
  createIssue: CREATE_ISSUE,
  closeIssue: CLOSE_ISSUE,
  pullRequests: PULL_REQUESTS,
  pullRequestFiles: PULL_REQUEST_FILES,
  pullRequestId: PULL_REQUEST_ID,
  createPullRequest: CREATE_PULL_REQUEST,
  mergePullRequest: MERGE_PULL_REQUEST,
  addComment: ADD_COMMENT,
  invalidField: INVALID_FIELD,
  nodeRepository: NODE_REPOSITORY,
  issuesPage: ISSUES_PAGE
});
var CheckFailure2 = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CheckFailure";
  }
};
function isRecord3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function at(value, ...keys) {
  let current = value;
  for (const key of keys) {
    if (!isRecord3(current)) return void 0;
    current = current[key];
  }
  return current;
}
function json(value) {
  try {
    const text = JSON.stringify(value);
    return text === void 0 ? String(value) : text;
  } catch {
    return String(value);
  }
}
function namesFrom(value) {
  if (!Array.isArray(value)) return [];
  const names = [];
  for (const entry of value) {
    const name = at(entry, "name");
    if (typeof name === "string" && name !== "") names.push(name);
  }
  return names;
}
function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}
function positiveInteger(value, what) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new CheckFailure2(`${what} is ${json(value)}, expected a positive integer`);
  }
  return value;
}
function nonEmptyString(value, what) {
  if (typeof value !== "string" || value === "") {
    throw new CheckFailure2(`${what} is ${json(value)}, expected a non-empty string`);
  }
  return value;
}
function statusText(answer) {
  if (answer.transportError !== void 0) return `transport error: ${answer.transportError}`;
  if (answer.parseError !== void 0) return `unparseable response: ${answer.parseError}`;
  return `HTTP ${answer.status}`;
}
function dataOf(response, what) {
  if (response.transportError !== void 0) throw new CheckFailure2(`${what}: ${response.transportError}`);
  if (response.parseError !== void 0) throw new CheckFailure2(`${what}: ${response.parseError}`);
  if (response.status !== 200) throw new CheckFailure2(`${what}: HTTP ${response.status}`);
  if (response.errors.length > 0) {
    throw new CheckFailure2(`${what}: GraphQL errors: ${response.errors.map((error) => error.message).join("; ")}`);
  }
  if (response.data === null || typeof response.data !== "object") {
    throw new CheckFailure2(`${what}: the response carries no data object`);
  }
  return response.data;
}
var RestSurface = class {
  root;
  token;
  fetchImpl;
  constructor(baseUrl, token, fetchImpl) {
    this.root = `${baseUrl.replace(/\/+$/u, "")}/api/v3`;
    this.token = token;
    this.fetchImpl = fetchImpl;
  }
  get(path, options) {
    return this.request("GET", path, void 0, options);
  }
  post(path, body, options) {
    return this.request("POST", path, body, options);
  }
  patch(path, body, options) {
    return this.request("PATCH", path, body, options);
  }
  async request(method, path, body, options) {
    const headers = {
      accept: "application/vnd.github+json",
      "user-agent": "makefun-github-core-clone-env/1",
      authorization: `Bearer ${this.token}`
    };
    if (body !== void 0) headers["content-type"] = "application/json";
    let response;
    try {
      response = await this.fetchImpl(`${this.root}${path}`, {
        method,
        headers,
        body: body === void 0 ? void 0 : JSON.stringify(body),
        signal: options.signal
      });
    } catch (err) {
      return { status: 0, body: null, text: "", transportError: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
    }
    let text;
    try {
      text = await response.text();
    } catch (err) {
      return { status: response.status, body: null, text: "", transportError: `could not read the response body: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (text.trim() === "") return { status: response.status, body: null, text };
    try {
      return { status: response.status, body: JSON.parse(text), text };
    } catch {
      const contentType = response.headers.get("content-type") ?? "no content-type";
      return { status: response.status, body: null, text, parseError: `response is not JSON (${contentType})` };
    }
  }
};
function restObject(answer, expected, what) {
  const expectedList = typeof expected === "number" ? [expected] : expected;
  if (answer.transportError !== void 0) throw new CheckFailure2(`${what}: ${answer.transportError}`);
  if (answer.parseError !== void 0) throw new CheckFailure2(`${what}: ${answer.parseError}`);
  if (!expectedList.includes(answer.status)) {
    throw new CheckFailure2(`${what}: ${statusText(answer)}, expected ${expectedList.join(" or ")}`);
  }
  if (!isRecord3(answer.body)) throw new CheckFailure2(`${what}: the body is not a JSON object`);
  return answer.body;
}
function restArray(answer, expected, what) {
  const expectedList = typeof expected === "number" ? [expected] : expected;
  if (answer.transportError !== void 0) throw new CheckFailure2(`${what}: ${answer.transportError}`);
  if (answer.parseError !== void 0) throw new CheckFailure2(`${what}: ${answer.parseError}`);
  if (!expectedList.includes(answer.status)) {
    throw new CheckFailure2(`${what}: ${statusText(answer)}, expected ${expectedList.join(" or ")}`);
  }
  if (!Array.isArray(answer.body)) throw new CheckFailure2(`${what}: the body is not a JSON array`);
  return answer.body;
}
function fixtureNames(scenario) {
  const repo = scenario.repos[0];
  const pulls = scenario.pulls;
  const blobs = scenario.blobs;
  const issues = scenario.issues;
  if (repo === void 0) throw new CheckFailure2("the scenario has no viewer repository to build the GraphQL fixture on");
  if (pulls[0] === void 0 || pulls[1] === void 0 || pulls[2] === void 0) {
    throw new CheckFailure2("the scenario has fewer than three pull-request branch pairs");
  }
  if (blobs[0] === void 0 || blobs[1] === void 0) throw new CheckFailure2("the scenario has fewer than two blobs");
  if (issues[0] === void 0 || issues[1] === void 0) throw new CheckFailure2("the scenario has fewer than two issue templates");
  const headBranches = [pulls[0].head, pulls[1].head, pulls[2].head];
  if (new Set(headBranches).size !== headBranches.length) throw new CheckFailure2("the scenario reuses a pull-request head branch");
  return {
    repository: `${repo.name}-graphql`,
    pagesRepository: `${repo.name}-graphql-pages`,
    unknownRepository: `${repo.name}-graphql-missing`,
    baseBranch: repo.defaultBranch,
    headBranch: pulls[0].head,
    createBranch: pulls[1].head,
    mergeBranch: pulls[2].head,
    filePath: blobs[0].path,
    baseFilePath: blobs[1].path,
    titlePrefix: issues[0].title,
    body: issues[0].body,
    comment: issues[1].body,
    pageSize: 5,
    pageCount: 7
  };
}
function repoPath(owner, repo) {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
var Harness = class {
  client;
  rest;
  viewer;
  names;
  repoSeed;
  repo = null;
  baseBranch = null;
  branches = null;
  issues = null;
  pullRequest = null;
  mergePullRequest = null;
  pages = null;
  constructor(context) {
    const fetchImpl = (input, init) => fetch(input, init);
    this.client = new GraphQLClient({ baseUrl: context.baseUrl, token: context.token, timeoutMs: CHECK_TIMEOUT_MAX_MS, fetchImpl });
    this.rest = new RestSurface(context.baseUrl, context.token, fetchImpl);
    this.viewer = context.scenario.viewer.login;
    this.names = fixtureNames(context.scenario);
    const seedRepo = context.scenario.repos[0];
    this.repoSeed = { private: seedRepo?.private ?? false, description: seedRepo?.description ?? "graphql checks" };
  }
  /** Whether a git adapter was installed (check 2 asserts defaultBranchRef only when branches exist). */
  get branchesAvailable() {
    return gitAdapter !== null;
  }
  /** One GraphQL call, bounded by the check's own budget. */
  query(options, document, variables = {}) {
    return this.client.request(document, variables, { signal: options.signal, timeoutMs: options.timeoutMs });
  }
  callOptions(session) {
    return { signal: session.ctx.signal, timeoutMs: session.ctx.timeoutMs };
  }
  repoFixture(session) {
    this.repo ??= this.buildRepo(session);
    return this.repo;
  }
  /** The repository's first commit on the default branch (the defaultBranchRef the repository check reads). */
  baseBranchFixture(session) {
    this.baseBranch ??= this.buildBaseBranch(session);
    return this.baseBranch;
  }
  branchFixture(session) {
    this.branches ??= this.buildBranches(session);
    return this.branches;
  }
  issueFixture(session) {
    this.issues ??= this.buildIssues(session);
    return this.issues;
  }
  pullRequestFixture(session) {
    this.pullRequest ??= this.buildPullRequest(this.names.headBranch, `${this.names.titlePrefix} fixture pull request`, "fixture", session);
    return this.pullRequest;
  }
  mergePullRequestFixture(session) {
    this.mergePullRequest ??= this.buildPullRequest(this.names.mergeBranch, `${this.names.titlePrefix} merge pull request`, "fixture-merge", session);
    return this.mergePullRequest;
  }
  pageFixture(session) {
    this.pages ??= this.buildPages(session);
    return this.pages;
  }
  /** Create the fixture repository (idempotent), then read its global and numeric ids over GraphQL. */
  async buildRepo(session) {
    const name = this.names.repository;
    const created = await this.rest.post(
      "/user/repos",
      { name, private: this.repoSeed.private, description: this.repoSeed.description },
      this.callOptions(session)
    );
    if (created.status !== 201 && created.status !== 200 && created.status !== 422 && created.status !== 409) {
      throw new CheckFailure2(`POST /api/v3/user/repos answered ${statusText(created)}`);
    }
    const read = await this.rest.get(repoPath(this.viewer, name), this.callOptions(session));
    if (read.status !== 200) {
      throw new CheckFailure2(`the fixture repository ${this.viewer}/${name} was not readable after POST /user/repos: ${statusText(read)}`);
    }
    const response = await this.query(this.callOptions(session), REPOSITORY_FIELDS, { owner: this.viewer, name });
    const data = dataOf(response, `graphql lookup of the fixture repository ${this.viewer}/${name}`);
    const id = nonEmptyString(at(data, "repository", "id"), "the fixture repository id");
    const databaseId = positiveInteger(at(data, "repository", "databaseId"), "the fixture repository databaseId");
    return { id, databaseId };
  }
  /** The repository's first commit on its default branch, so defaultBranchRef names it. */
  async buildBaseBranch(session) {
    await this.repoFixture(session);
    const git = gitAdapter;
    if (git === null) {
      throw new CheckFailure2("no git fixture provider was installed: the env main must call configureGraphQLGit() so the check can create the branch a pull request needs");
    }
    const detail2 = await git.pushBranch({
      owner: this.viewer,
      repo: this.names.repository,
      branch: this.names.baseBranch,
      path: this.names.baseFilePath,
      content: `# ${this.names.repository}

${this.names.body}
`,
      message: `fixture: first commit on ${this.names.baseBranch}`
    });
    if (detail2 !== null) throw new CheckFailure2(`git fixture for the default branch ${this.names.baseBranch}: ${detail2}`);
  }
  /** Push the three head branches the pull-request checks need (the base branch is already there). */
  async buildBranches(session) {
    await this.baseBranchFixture(session);
    const git = gitAdapter;
    if (git === null) throw new CheckFailure2("no git fixture provider was installed: the env main must call configureGraphQLGit()");
    const push = async (branch, from, path, content, message) => {
      const detail2 = await git.pushBranch({ owner: this.viewer, repo: this.names.repository, branch, from, path, content, message });
      if (detail2 !== null) throw new CheckFailure2(`git fixture for branch ${branch}: ${detail2}`);
    };
    await push(this.names.headBranch, this.names.baseBranch, this.names.filePath, `${this.names.body}
`, `fixture: add ${this.names.filePath}`);
    await push(this.names.createBranch, this.names.baseBranch, `${this.names.filePath}.create`, `${this.names.body}
`, "fixture: branch for createPullRequest");
    await push(this.names.mergeBranch, this.names.baseBranch, `${this.names.filePath}.merge`, `${this.names.body}
`, "fixture: branch for mergePullRequest");
  }
  /** Create one issue over REST and answer its number. */
  async createRestIssue(session, title, body) {
    const answer = await this.rest.post(`${repoPath(this.viewer, this.names.repository)}/issues`, { title, body }, this.callOptions(session));
    const issue = restObject(answer, 201, `POST an issue "${title}"`);
    return positiveInteger(issue.number, "the created issue number");
  }
  /** Three open issues and one closed issue, all from the scenario's seed-derived text. */
  async buildIssues(session) {
    await this.repoFixture(session);
    const open = [];
    for (let index = 1; index <= 3; index += 1) {
      open.push(await this.createRestIssue(session, `${this.names.titlePrefix} open ${index}`, this.names.body));
    }
    const closed = await this.createRestIssue(session, `${this.names.titlePrefix} closed`, this.names.body);
    const patched = await this.rest.patch(`${repoPath(this.viewer, this.names.repository)}/issues/${closed}`, { state: "closed" }, this.callOptions(session));
    restObject(patched, 200, `PATCH issue #${closed} closed`);
    return { open, closed };
  }
  /** An open pull request from `branch` to the base branch, created over REST; tolerant of a re-run. */
  async buildPullRequest(branch, title, tag, session) {
    await this.branchFixture(session);
    const created = await this.rest.post(
      `${repoPath(this.viewer, this.names.repository)}/pulls`,
      { title, body: this.names.body, head: branch, base: this.names.baseBranch },
      this.callOptions(session)
    );
    if (created.status === 201) {
      const pullRequest = restObject(created, 201, `POST a pull request from ${branch}`);
      return { number: positiveInteger(pullRequest.number, `the ${tag} pull request number`) };
    }
    if (created.status === 422) {
      const listed = await this.rest.get(`${repoPath(this.viewer, this.names.repository)}/pulls?state=all`, this.callOptions(session));
      for (const entry of restArray(listed, 200, "GET the pull requests after a 422 on creation")) {
        if (at(entry, "head", "ref") !== branch) continue;
        if (at(entry, "state") !== "open") continue;
        return { number: positiveInteger(at(entry, "number"), `the ${tag} pull request number`) };
      }
    }
    throw new CheckFailure2(`POST a pull request from ${branch}: ${statusText(created)}${created.status === 422 ? " (and no open pull request from that branch was found)" : ""}`);
  }
  /** A second repository holding exactly the scenario's pageCount issues, for the cursor check. */
  async buildPages(session) {
    const name = this.names.pagesRepository;
    const created = await this.rest.post("/user/repos", { name, private: false }, this.callOptions(session));
    if (created.status !== 201 && created.status !== 200 && created.status !== 422 && created.status !== 409) {
      throw new CheckFailure2(`POST /api/v3/user/repos for the pagination repository answered ${statusText(created)}`);
    }
    const numbers = [];
    for (let index = 1; index <= this.names.pageCount; index += 1) {
      const answer = await this.rest.post(
        `${repoPath(this.viewer, name)}/issues`,
        { title: `${this.names.titlePrefix} page ${index}`, body: this.names.body },
        this.callOptions(session)
      );
      const issue = restObject(answer, 201, `POST pagination issue ${index}`);
      numbers.push(positiveInteger(issue.number, `pagination issue ${index}'s number`));
    }
    return { numbers };
  }
  /** Read an issue's global id (the input closeIssue and addComment take). */
  async issueGlobalId(session, number) {
    const response = await this.query(this.callOptions(session), ISSUE_BY_NUMBER, { owner: this.viewer, name: this.names.repository, number });
    const data = dataOf(response, `query IssueByNumber for issue #${number}`);
    return nonEmptyString(at(data, "repository", "issue", "id"), `issue #${number}'s id`);
  }
  /** Read a pull request's global id (the input mergePullRequest takes). */
  async pullRequestGlobalId(session, number) {
    const response = await this.query(this.callOptions(session), PULL_REQUEST_ID, { owner: this.viewer, name: this.names.repository, number });
    const data = dataOf(response, `query PullRequestId for pull request #${number}`);
    return nonEmptyString(at(data, "repository", "pullRequest", "id"), `pull request #${number}'s id`);
  }
};
var HARNESSES = /* @__PURE__ */ new Map();
function harnessFor(context) {
  const key = `${context.baseUrl}
${context.scenario.seed}`;
  let harness2 = HARNESSES.get(key);
  if (harness2 === void 0) {
    harness2 = new Harness(context);
    HARNESSES.set(key, harness2);
  }
  return harness2;
}
function sessionOf(context) {
  const harness2 = harnessFor(context);
  const signal = Number.isFinite(context.timeoutMs) && context.timeoutMs > 0 ? AbortSignal.any([context.signal, AbortSignal.timeout(context.timeoutMs)]) : context.signal;
  return { ctx: { ...context, signal }, harness: harness2 };
}
async function viewerLogin({ ctx, harness: harness2 }) {
  const response = await harness2.query(ctx, VIEWER_LOGIN);
  const data = dataOf(response, "query ViewerLogin");
  const login = at(data, "viewer", "login");
  if (typeof login !== "string" || login === "") return fail(`viewer.login is ${json(login)}, expected a non-empty login`);
  if (login !== harness2.viewer) return fail(`viewer.login is ${json(login)}, expected the token owner ${json(harness2.viewer)}`);
  return pass(`viewer.login is ${login}`);
}
async function repositoryFields(session) {
  const { harness: harness2, ctx } = session;
  const repo = await harness2.repoFixture(session);
  if (harness2.branchesAvailable) await harness2.baseBranchFixture(session);
  const response = await harness2.query(ctx, REPOSITORY_FIELDS, { owner: harness2.viewer, name: harness2.names.repository });
  const data = dataOf(response, "query RepositoryFields");
  const node = at(data, "repository");
  if (!isRecord3(node)) throw new CheckFailure2(`data.repository is ${json(node)}, expected the fixture repository`);
  if (node.id !== repo.id) throw new CheckFailure2(`data.repository.id is ${json(node.id)}, expected ${json(repo.id)}`);
  if (node.databaseId !== repo.databaseId) throw new CheckFailure2(`data.repository.databaseId is ${json(node.databaseId)}, expected ${repo.databaseId}`);
  if (node.name !== harness2.names.repository) throw new CheckFailure2(`data.repository.name is ${json(node.name)}, expected ${json(harness2.names.repository)}`);
  const ownerLogin = at(node, "owner", "login");
  if (ownerLogin !== harness2.viewer) throw new CheckFailure2(`data.repository.owner.login is ${json(ownerLogin)}, expected ${json(harness2.viewer)}`);
  if (harness2.branchesAvailable) {
    const defaultBranch = at(node, "defaultBranchRef", "name");
    if (defaultBranch !== harness2.names.baseBranch) {
      throw new CheckFailure2(`data.repository.defaultBranchRef.name is ${json(defaultBranch)}, expected ${json(harness2.names.baseBranch)}`);
    }
  }
  const permission = node.viewerPermission;
  if (typeof permission !== "string" || !["ADMIN", "MAINTAIN", "WRITE", "TRIAGE", "READ"].includes(permission)) {
    throw new CheckFailure2(`data.repository.viewerPermission is ${json(permission)}, expected one of ADMIN, MAINTAIN, WRITE, TRIAGE, READ`);
  }
  if (node.hasIssuesEnabled !== true) throw new CheckFailure2(`data.repository.hasIssuesEnabled is ${json(node.hasIssuesEnabled)}, expected true`);
  return pass(`repository ${harness2.viewer}/${harness2.names.repository} reads back with every requested field`);
}
async function issueIntrospection({ ctx, harness: harness2 }) {
  const response = await harness2.query(ctx, ISSUE_FIELDS);
  const data = dataOf(response, "query Issue_fields");
  const names = namesFrom(at(data, "Issue", "fields"));
  if (names.length === 0) return fail('Issue: __type(name: "Issue").fields is empty');
  const missing = ["id", "number", "title", "state", "body"].filter((name) => !names.includes(name));
  if (missing.length > 0) return fail(`Issue's schema does not list ${missing.join(", ")}, which the suite reads: ${names.join(", ")}`);
  return pass(`Issue lists ${names.length} field(s), including id, number, title, state and body`);
}
async function typeIntrospection({ ctx, harness: harness2 }) {
  const types = await harness2.query(ctx, TYPE_FIELDS);
  const data = dataOf(types, "query PullRequestAndRepositoryFields");
  const pullRequestNames = namesFrom(at(data, "PullRequest", "fields"));
  if (pullRequestNames.length === 0) return fail('PullRequest: __type(name: "PullRequest").fields is empty');
  const pullRequestMissing = ["id", "number", "headRefName", "baseRefName", "mergeable", "state", "merged", "files"].filter(
    (name) => !pullRequestNames.includes(name)
  );
  if (pullRequestMissing.length > 0) return fail(`PullRequest's schema does not list ${pullRequestMissing.join(", ")}: ${pullRequestNames.join(", ")}`);
  const repositoryNames = namesFrom(at(data, "Repository", "fields"));
  if (repositoryNames.length === 0) return fail('Repository: __type(name: "Repository").fields is empty');
  const repositoryMissing = [
    "id",
    "databaseId",
    "name",
    "nameWithOwner",
    "owner",
    "defaultBranchRef",
    "viewerPermission",
    "hasIssuesEnabled",
    "issue",
    "issues",
    "pullRequests",
    "pullRequest"
  ].filter((name) => !repositoryNames.includes(name));
  if (repositoryMissing.length > 0) return fail(`Repository's schema does not list ${repositoryMissing.join(", ")}: ${repositoryNames.join(", ")}`);
  const search = await harness2.query(ctx, SEARCH_TYPE_ENUM_VALUES);
  const searchData = dataOf(search, "query SearchType_enumValues");
  const enumNames = namesFrom(at(searchData, "SearchType", "enumValues"));
  if (enumNames.length === 0) return fail('SearchType: __type(name: "SearchType").enumValues is empty');
  if (!enumNames.includes("ISSUE")) return fail(`SearchType does not list ISSUE: ${enumNames.join(", ")}`);
  return pass(`PullRequest (${pullRequestNames.length}), Repository (${repositoryNames.length}) and SearchType (${enumNames.length}) describe their schema`);
}
async function openIssues(session) {
  const { harness: harness2, ctx } = session;
  await harness2.repoFixture(session);
  const issues = await harness2.issueFixture(session);
  const response = await harness2.query(ctx, OPEN_ISSUES, { owner: harness2.viewer, name: harness2.names.repository, first: 10 });
  const data = dataOf(response, "query OpenIssues");
  const nodes = arrayFrom(at(data, "repository", "issues", "nodes"));
  if (nodes.length === 0) return fail("the OPEN issue list is empty after the fixture created open issues");
  if (nodes.length > 10) return fail(`the OPEN issue list has ${nodes.length} nodes for first: 10`);
  const numbers = [];
  for (const node of nodes) {
    const number = positiveInteger(at(node, "number"), "an open issue number");
    const state = at(node, "state");
    if (state !== "OPEN") return fail(`issue #${number} has state ${json(state)}, expected OPEN`);
    if (typeof at(node, "title") !== "string") return fail(`issue #${number} has no title string`);
    nonEmptyString(at(node, "id"), `issue #${number}'s id`);
    numbers.push(number);
  }
  for (let index = 1; index < numbers.length; index += 1) {
    if (numbers[index] > numbers[index - 1]) {
      return fail(`the CREATED_AT DESC list is out of order: #${numbers[index - 1]} comes before #${numbers[index]}`);
    }
  }
  if (numbers.includes(issues.closed)) return fail(`the closed issue #${issues.closed} appears in the OPEN list`);
  const missing = issues.open.filter((number) => !numbers.includes(number));
  if (missing.length > 0) return fail(`the OPEN list is missing open fixture issue(s) ${missing.join(", ")}`);
  return pass(`${numbers.length} OPEN issue(s) in CREATED_AT DESC order, the closed issue excluded`);
}
async function issueByNumber(session) {
  const { harness: harness2, ctx } = session;
  await harness2.repoFixture(session);
  const issues = await harness2.issueFixture(session);
  const number = issues.open[0];
  const response = await harness2.query(ctx, ISSUE_BY_NUMBER, { owner: harness2.viewer, name: harness2.names.repository, number });
  const data = dataOf(response, `query IssueByNumber for #${number}`);
  const issue = at(data, "repository", "issue");
  if (!isRecord3(issue)) throw new CheckFailure2(`data.repository.issue is ${json(issue)}, expected #${number}`);
  if (issue.number !== number) throw new CheckFailure2(`the issue read back as #${json(issue.number)}, expected #${number}`);
  if (issue.state !== "OPEN") throw new CheckFailure2(`issue #${number}'s state is ${json(issue.state)}, expected OPEN`);
  if (issue.title !== `${harness2.names.titlePrefix} open 1`) {
    throw new CheckFailure2(`issue #${number}'s title is ${json(issue.title)}, expected ${json(`${harness2.names.titlePrefix} open 1`)}`);
  }
  if (issue.body !== harness2.names.body) throw new CheckFailure2(`issue #${number}'s body does not match the seeded body`);
  nonEmptyString(issue.id, `issue #${number}'s id`);
  return pass(`issue #${number} reads back with its title, state, body and id`);
}
async function createIssue2(session) {
  const { harness: harness2, ctx } = session;
  const repo = await harness2.repoFixture(session);
  const title = `${harness2.names.titlePrefix} created over graphql`;
  const response = await harness2.query(ctx, CREATE_ISSUE, { input: { repositoryId: repo.id, title, body: harness2.names.body } });
  const data = dataOf(response, "mutation IssueCreate");
  const issue = at(data, "createIssue", "issue");
  if (!isRecord3(issue)) throw new CheckFailure2(`createIssue.issue is ${json(issue)}`);
  const number = positiveInteger(issue.number, "createIssue.issue.number");
  nonEmptyString(issue.id, "createIssue.issue.id");
  const rest = await harness2.rest.get(`${repoPath(harness2.viewer, harness2.names.repository)}/issues/${number}`, { signal: ctx.signal, timeoutMs: ctx.timeoutMs });
  const created = restObject(rest, 200, `GET issue #${number} after creating it over GraphQL`);
  if (created.number !== number) throw new CheckFailure2(`the REST view answers #${json(created.number)}, expected #${number}`);
  if (created.title !== title) throw new CheckFailure2(`the REST view's title is ${json(created.title)}, expected ${json(title)}`);
  if (created.state !== "open") throw new CheckFailure2(`the REST view's state is ${json(created.state)}, expected open`);
  return pass(`createIssue made #${number} and the REST view reads it open with the same title`);
}
async function closeIssue(session) {
  const { harness: harness2, ctx } = session;
  await harness2.repoFixture(session);
  const created = await harness2.rest.post(
    `${repoPath(harness2.viewer, harness2.names.repository)}/issues`,
    { title: `${harness2.names.titlePrefix} closed over graphql`, body: harness2.names.body },
    { signal: ctx.signal, timeoutMs: ctx.timeoutMs }
  );
  const number = positiveInteger(restObject(created, 201, "POST the issue to close").number, "the issue number");
  const id = await harness2.issueGlobalId(session, number);
  const response = await harness2.query(ctx, CLOSE_ISSUE, { input: { issueId: id } });
  const data = dataOf(response, "mutation IssueClose");
  const closed = at(data, "closeIssue", "issue");
  if (!isRecord3(closed)) throw new CheckFailure2(`closeIssue.issue is ${json(closed)}`);
  if (closed.number !== number) throw new CheckFailure2(`closeIssue names #${json(closed.number)}, expected #${number}`);
  if (closed.state !== "CLOSED") throw new CheckFailure2(`closeIssue.issue.state is ${json(closed.state)}, expected CLOSED`);
  const rest = await harness2.rest.get(`${repoPath(harness2.viewer, harness2.names.repository)}/issues/${number}`, { signal: ctx.signal, timeoutMs: ctx.timeoutMs });
  const read = restObject(rest, 200, `GET issue #${number} after closing it`);
  if (read.state !== "closed") throw new CheckFailure2(`the REST view's state is ${json(read.state)}, expected closed`);
  return pass(`closeIssue closed #${number} and the REST view shows it closed`);
}
async function pullRequests(session) {
  const { harness: harness2, ctx } = session;
  const pullRequest = await harness2.pullRequestFixture(session);
  const response = await harness2.query(ctx, PULL_REQUESTS, { owner: harness2.viewer, name: harness2.names.repository, first: 5 });
  const data = dataOf(response, "query PullRequests");
  const nodes = arrayFrom(at(data, "repository", "pullRequests", "nodes"));
  if (nodes.length > 5) return fail(`the pull request list has ${nodes.length} nodes for first: 5`);
  const node = nodes.find((entry) => at(entry, "number") === pullRequest.number);
  if (node === void 0) return fail(`pull request #${pullRequest.number} is not in the open list: ${nodes.map((entry) => json(at(entry, "number"))).join(", ")}`);
  const head = at(node, "headRefName");
  const base = at(node, "baseRefName");
  if (head !== harness2.names.headBranch) throw new CheckFailure2(`pull request #${pullRequest.number}'s headRefName is ${json(head)}, expected ${json(harness2.names.headBranch)}`);
  if (base !== harness2.names.baseBranch) throw new CheckFailure2(`pull request #${pullRequest.number}'s baseRefName is ${json(base)}, expected ${json(harness2.names.baseBranch)}`);
  if (at(node, "state") !== "OPEN") throw new CheckFailure2(`pull request #${pullRequest.number}'s state is ${json(at(node, "state"))}, expected OPEN`);
  const mergeable = at(node, "mergeable");
  if (typeof mergeable !== "string" || !["MERGEABLE", "CONFLICTING", "UNKNOWN"].includes(mergeable)) {
    throw new CheckFailure2(`pull request #${pullRequest.number}'s mergeable is ${json(mergeable)}, expected MERGEABLE, CONFLICTING or UNKNOWN`);
  }
  return pass(`pull request #${pullRequest.number} lists with its head, base, state and mergeable`);
}
async function pullRequestFiles(session) {
  const { harness: harness2, ctx } = session;
  const pullRequest = await harness2.pullRequestFixture(session);
  const response = await harness2.query(ctx, PULL_REQUEST_FILES, {
    owner: harness2.viewer,
    name: harness2.names.repository,
    number: pullRequest.number
  });
  const data = dataOf(response, `query PullRequestFiles for #${pullRequest.number}`);
  const node = at(data, "repository", "pullRequest");
  if (!isRecord3(node)) throw new CheckFailure2(`data.repository.pullRequest is ${json(node)}`);
  if (node.number !== pullRequest.number) throw new CheckFailure2(`the pull request read back as #${json(node.number)}, expected #${pullRequest.number}`);
  const paths = [];
  for (const entry of arrayFrom(at(node, "files", "nodes"))) {
    const path = at(entry, "path");
    if (typeof path === "string" && path !== "") paths.push(path);
  }
  if (!paths.includes(harness2.names.filePath)) {
    return fail(`pull request #${pullRequest.number}'s files do not include the changed path ${json(harness2.names.filePath)}: ${paths.length === 0 ? "none" : paths.join(", ")}`);
  }
  return pass(`pull request #${pullRequest.number}'s files include ${harness2.names.filePath}`);
}
async function createPullRequest(session) {
  const { harness: harness2, ctx } = session;
  const repo = await harness2.repoFixture(session);
  await harness2.branchFixture(session);
  const title = `${harness2.names.titlePrefix} created over graphql`;
  const response = await harness2.query(ctx, CREATE_PULL_REQUEST, {
    input: { repositoryId: repo.id, baseRefName: harness2.names.baseBranch, headRefName: harness2.names.createBranch, title }
  });
  const data = dataOf(response, "mutation PullRequestCreate");
  const pullRequest = at(data, "createPullRequest", "pullRequest");
  if (!isRecord3(pullRequest)) throw new CheckFailure2(`createPullRequest.pullRequest is ${json(pullRequest)}`);
  const number = positiveInteger(pullRequest.number, "createPullRequest.pullRequest.number");
  nonEmptyString(pullRequest.id, "createPullRequest.pullRequest.id");
  if (pullRequest.state !== "OPEN") throw new CheckFailure2(`createPullRequest.pullRequest.state is ${json(pullRequest.state)}, expected OPEN`);
  if (pullRequest.headRefName !== harness2.names.createBranch) {
    throw new CheckFailure2(`createPullRequest.pullRequest.headRefName is ${json(pullRequest.headRefName)}, expected ${json(harness2.names.createBranch)}`);
  }
  if (pullRequest.baseRefName !== harness2.names.baseBranch) {
    throw new CheckFailure2(`createPullRequest.pullRequest.baseRefName is ${json(pullRequest.baseRefName)}, expected ${json(harness2.names.baseBranch)}`);
  }
  const rest = await harness2.rest.get(`${repoPath(harness2.viewer, harness2.names.repository)}/pulls/${number}`, { signal: ctx.signal, timeoutMs: ctx.timeoutMs });
  const read = restObject(rest, 200, `GET pull request #${number} after creating it over GraphQL`);
  if (at(read, "head", "ref") !== harness2.names.createBranch) {
    throw new CheckFailure2(`the REST view's head.ref is ${json(at(read, "head", "ref"))}, expected ${json(harness2.names.createBranch)}`);
  }
  if (at(read, "base", "ref") !== harness2.names.baseBranch) {
    throw new CheckFailure2(`the REST view's base.ref is ${json(at(read, "base", "ref"))}, expected ${json(harness2.names.baseBranch)}`);
  }
  return pass(`createPullRequest made #${number} from ${harness2.names.createBranch} and the REST view reads it`);
}
async function mergePullRequest(session) {
  const { harness: harness2, ctx } = session;
  const pullRequest = await harness2.mergePullRequestFixture(session);
  const id = await harness2.pullRequestGlobalId(session, pullRequest.number);
  const response = await harness2.query(ctx, MERGE_PULL_REQUEST, { input: { pullRequestId: id, mergeMethod: "SQUASH" } });
  const data = dataOf(response, `mutation MergePullRequest for #${pullRequest.number}`);
  const merged = at(data, "mergePullRequest", "pullRequest");
  if (!isRecord3(merged)) throw new CheckFailure2(`mergePullRequest.pullRequest is ${json(merged)}`);
  if (merged.merged !== true) throw new CheckFailure2(`mergePullRequest.pullRequest.merged is ${json(merged.merged)}, expected true`);
  const rest = await harness2.rest.get(`${repoPath(harness2.viewer, harness2.names.repository)}/pulls/${pullRequest.number}`, { signal: ctx.signal, timeoutMs: ctx.timeoutMs });
  const read = restObject(rest, 200, `GET pull request #${pullRequest.number} after merging it`);
  if (read.merged !== true) throw new CheckFailure2(`the REST view's merged is ${json(read.merged)}, expected true`);
  if (read.state !== "closed") throw new CheckFailure2(`the REST view's state is ${json(read.state)}, expected closed after a merge`);
  return pass(`mergePullRequest squash-merged #${pullRequest.number} and the REST view shows merged: true, state closed`);
}
async function addComment(session) {
  const { harness: harness2, ctx } = session;
  await harness2.repoFixture(session);
  const created = await harness2.rest.post(
    `${repoPath(harness2.viewer, harness2.names.repository)}/issues`,
    { title: `${harness2.names.titlePrefix} commented over graphql`, body: harness2.names.body },
    { signal: ctx.signal, timeoutMs: ctx.timeoutMs }
  );
  const number = positiveInteger(restObject(created, 201, "POST the issue to comment on").number, "the issue number");
  const id = await harness2.issueGlobalId(session, number);
  const response = await harness2.query(ctx, ADD_COMMENT, { input: { subjectId: id, body: harness2.names.comment } });
  const data = dataOf(response, "mutation AddComment");
  const comment = at(data, "addComment", "commentEdge", "node");
  if (!isRecord3(comment)) throw new CheckFailure2(`addComment.commentEdge.node is ${json(comment)}`);
  if (comment.body !== harness2.names.comment) throw new CheckFailure2("addComment did not echo the comment body");
  nonEmptyString(comment.id, "addComment.commentEdge.node.id");
  const rest = await harness2.rest.get(`${repoPath(harness2.viewer, harness2.names.repository)}/issues/${number}/comments`, { signal: ctx.signal, timeoutMs: ctx.timeoutMs });
  const comments = restArray(rest, 200, `GET issue #${number}'s comments`);
  if (!comments.some((entry) => at(entry, "body") === harness2.names.comment)) {
    return fail(`the REST comment list for issue #${number} does not hold the added comment`);
  }
  return pass(`addComment wrote a comment on #${number} and the REST view lists it`);
}
async function invalidField({ ctx, harness: harness2 }) {
  const response = await harness2.query(ctx, INVALID_FIELD);
  if (response.transportError !== void 0) throw new CheckFailure2(`query with an invalid field: ${response.transportError}`);
  if (response.status !== 200) return fail(`HTTP ${response.status} for a query with an invalid field, expected 200 with an errors array`);
  if (response.parseError !== void 0) throw new CheckFailure2(`query with an invalid field: ${response.parseError}`);
  if (response.errors.length === 0) return fail("the response carries no errors array: the invalid field was not reported");
  if (!response.errors.some((error) => error.message.includes("noSuchFieldOnViewer"))) {
    return fail(`the errors do not name the invalid field: ${response.errors.map((error) => error.message).join("; ")}`);
  }
  return pass(`HTTP 200 with ${response.errors.length} GraphQL error(s) naming noSuchFieldOnViewer`);
}
async function unauthenticated({ ctx, harness: harness2 }) {
  const anon = harness2.client.withoutToken();
  const response = await anon.request(VIEWER_LOGIN, {}, { signal: ctx.signal, timeoutMs: ctx.timeoutMs });
  if (response.transportError !== void 0) throw new CheckFailure2(`unauthenticated query: ${response.transportError}`);
  if (response.status !== 401) return fail(`HTTP ${response.status} for an unauthenticated query, expected 401`);
  return pass("an unauthenticated POST /api/graphql is 401");
}
async function nodeRepository(session) {
  const { harness: harness2, ctx } = session;
  const repo = await harness2.repoFixture(session);
  const response = await harness2.query(ctx, NODE_REPOSITORY, { id: repo.id });
  const data = dataOf(response, "query NodeRepository");
  const node = at(data, "node");
  if (!isRecord3(node)) throw new CheckFailure2(`data.node is ${json(node)}, expected the repository`);
  if (node.id !== repo.id) throw new CheckFailure2(`data.node.id is ${json(node.id)}, expected ${json(repo.id)}`);
  if (node.name !== harness2.names.repository) throw new CheckFailure2(`data.node.name is ${json(node.name)}, expected ${json(harness2.names.repository)}`);
  const nameWithOwner = `${harness2.viewer}/${harness2.names.repository}`;
  if (node.nameWithOwner !== nameWithOwner) throw new CheckFailure2(`data.node.nameWithOwner is ${json(node.nameWithOwner)}, expected ${json(nameWithOwner)}`);
  return pass(`node(id:) round-trips repository ${nameWithOwner}`);
}
async function unknownRepository({ ctx, harness: harness2 }) {
  const response = await harness2.query(ctx, REPOSITORY_FIELDS, { owner: harness2.viewer, name: harness2.names.unknownRepository });
  const data = dataOf(response, `query RepositoryFields for the unknown repository ${harness2.names.unknownRepository}`);
  const repository = at(data, "repository");
  if (repository !== null) return fail(`data.repository is ${json(repository)}, expected null`);
  return pass(`data.repository is null for ${json(harness2.names.unknownRepository)} with no errors`);
}
async function batchedOperations({ ctx, harness: harness2 }) {
  const response = await harness2.client.batch([{ query: VIEWER_LOGIN }, { query: ISSUE_FIELDS }], { signal: ctx.signal, timeoutMs: ctx.timeoutMs });
  if (response.transportError !== void 0) throw new CheckFailure2(`batched request: ${response.transportError}`);
  if (response.status !== 200) return fail(`HTTP ${response.status} for a batched request, expected 200`);
  if (response.parseError !== void 0) throw new CheckFailure2(`batched request: ${response.parseError}`);
  if (response.responses.length !== 2) return fail(`the batched response holds ${response.responses.length} entries, expected 2`);
  const viewer = dataOf(response.responses[0], "the batched viewer operation");
  const introspection = dataOf(response.responses[1], "the batched Issue introspection operation");
  const login = at(viewer, "viewer", "login");
  if (login !== harness2.viewer) return fail(`the first batched operation answered viewer.login ${json(login)}, expected ${json(harness2.viewer)}`);
  const names = namesFrom(at(introspection, "Issue", "fields"));
  if (names.length === 0) return fail("the second batched operation answered an empty Issue fields list");
  return pass("two operation documents in one body answer two data objects in order");
}
async function globalIdStability(session) {
  const { harness: harness2, ctx } = session;
  const repo = await harness2.repoFixture(session);
  const first = await harness2.query(ctx, REPOSITORY_FIELDS, { owner: harness2.viewer, name: harness2.names.repository });
  const second = await harness2.query(ctx, REPOSITORY_FIELDS, { owner: harness2.viewer, name: harness2.names.repository });
  const firstData = dataOf(first, "the first repository read");
  const secondData = dataOf(second, "the second repository read");
  const firstId = nonEmptyString(at(firstData, "repository", "id"), "the repository id");
  const secondId = nonEmptyString(at(secondData, "repository", "id"), "the repository id on the second read");
  if (firstId !== secondId) return fail(`the repository id changed between reads: ${json(firstId)} then ${json(secondId)}`);
  if (firstId === String(repo.databaseId)) return fail(`the repository id ${json(firstId)} is the plain databaseId, not an opaque global id`);
  const issues = await harness2.issueFixture(session);
  const number = issues.open[0];
  const firstIssue = await harness2.query(ctx, ISSUE_BY_NUMBER, { owner: harness2.viewer, name: harness2.names.repository, number });
  const secondIssue = await harness2.query(ctx, ISSUE_BY_NUMBER, { owner: harness2.viewer, name: harness2.names.repository, number });
  const firstIssueData = dataOf(firstIssue, "the first issue read");
  const secondIssueData = dataOf(secondIssue, "the second issue read");
  const firstIssueId = nonEmptyString(at(firstIssueData, "repository", "issue", "id"), `issue #${number}'s id`);
  const secondIssueId = nonEmptyString(at(secondIssueData, "repository", "issue", "id"), `issue #${number}'s id on the second read`);
  if (firstIssueId !== secondIssueId) return fail(`issue #${number}'s id changed between reads: ${json(firstIssueId)} then ${json(secondIssueId)}`);
  if (firstIssueId === String(number)) return fail(`issue #${number}'s id ${json(firstIssueId)} is the plain number, not an opaque global id`);
  return pass("the repository and issue global ids are non-empty, opaque and equal on repeated reads");
}
async function issuesPagination(session) {
  const { harness: harness2, ctx } = session;
  const pages = await harness2.pageFixture(session);
  const first = await harness2.query(ctx, ISSUES_PAGE, {
    owner: harness2.viewer,
    name: harness2.names.pagesRepository,
    first: harness2.names.pageSize,
    after: null
  });
  const firstData = dataOf(first, "the first issues page");
  const firstConnection = at(firstData, "repository", "issues");
  if (!isRecord3(firstConnection)) throw new CheckFailure2(`data.repository.issues is ${json(firstConnection)}`);
  const firstNodes = arrayFrom(firstConnection.nodes);
  if (firstNodes.length !== harness2.names.pageSize) return fail(`the first page holds ${firstNodes.length} node(s), expected ${harness2.names.pageSize}`);
  if (at(firstConnection, "pageInfo", "hasNextPage") !== true) return fail("the first page does not report hasNextPage: true");
  const cursor = at(firstConnection, "pageInfo", "endCursor");
  if (typeof cursor !== "string" || cursor === "") return fail(`the first page's endCursor is ${json(cursor)}, expected a non-empty cursor`);
  const second = await harness2.query(ctx, ISSUES_PAGE, {
    owner: harness2.viewer,
    name: harness2.names.pagesRepository,
    first: harness2.names.pageSize,
    after: cursor
  });
  const secondData = dataOf(second, "the second issues page");
  const secondConnection = at(secondData, "repository", "issues");
  if (!isRecord3(secondConnection)) throw new CheckFailure2(`the second page's data.repository.issues is ${json(secondConnection)}`);
  const secondNodes = arrayFrom(secondConnection.nodes);
  if (secondNodes.length !== harness2.names.pageCount - harness2.names.pageSize) {
    return fail(`the second page holds ${secondNodes.length} node(s), expected ${harness2.names.pageCount - harness2.names.pageSize}`);
  }
  if (at(secondConnection, "pageInfo", "hasNextPage") !== false) return fail("the second page does not report hasNextPage: false");
  const seen = /* @__PURE__ */ new Set();
  for (const node of [...firstNodes, ...secondNodes]) {
    const number = positiveInteger(at(node, "number"), "a paged issue number");
    if (seen.has(number)) return fail(`issue #${number} appears on both pages`);
    seen.add(number);
  }
  const expected = new Set(pages.numbers);
  for (const number of seen) {
    if (!expected.has(number)) return fail(`the pages hold issue #${number}, which the fixture did not create`);
  }
  if (seen.size !== harness2.names.pageCount) return fail(`the two pages hold ${seen.size} distinct issue(s), expected ${harness2.names.pageCount}`);
  return pass(`${harness2.names.pageCount} issues paged by the cursor as ${harness2.names.pageSize} + ${harness2.names.pageCount - harness2.names.pageSize}`);
}
var CHECK_TABLE = [
  { slug: "viewer-login", title: "query { viewer { login } } answers the token owner", timeoutMs: 8e3, body: viewerLogin },
  { slug: "repository-fields", title: "repository(owner:, name:) answers id, databaseId, name, owner, defaultBranchRef, viewerPermission and hasIssuesEnabled", timeoutMs: 1e4, body: repositoryFields },
  { slug: "introspection-issue", title: '__type(name: "Issue") lists the fields gh feature-detects', timeoutMs: 8e3, body: issueIntrospection },
  { slug: "introspection-types", title: "__type lists PullRequest, Repository and SearchType (gh's other probes, one check)", timeoutMs: 1e4, body: typeIntrospection },
  { slug: "issues-open-order", title: "issues(first: 10, states: [OPEN], orderBy: CREATED_AT DESC) filters and orders", timeoutMs: 12e3, body: openIssues },
  { slug: "issue-by-number", title: "issue(number:) reads one issue", timeoutMs: 1e4, body: issueByNumber },
  { slug: "create-issue", title: "createIssue creates an issue the REST view sees", timeoutMs: 12e3, body: createIssue2 },
  { slug: "close-issue", title: "closeIssue closes an issue the REST view shows closed", timeoutMs: 12e3, body: closeIssue },
  { slug: "pull-requests-list", title: "pullRequests(first: 5) lists number, headRefName, baseRefName, mergeable and state", timeoutMs: 15e3, body: pullRequests },
  { slug: "pull-request-files", title: "pullRequest(number:).files lists the changed paths", timeoutMs: 12e3, body: pullRequestFiles },
  { slug: "create-pull-request", title: "createPullRequest creates a pull request", timeoutMs: 15e3, body: createPullRequest },
  { slug: "merge-pull-request", title: "mergePullRequest SQUASH merges and the REST view shows merged: true", timeoutMs: 15e3, body: mergePullRequest },
  { slug: "add-comment", title: "addComment writes an issue comment the REST view lists", timeoutMs: 12e3, body: addComment },
  { slug: "invalid-field", title: "an invalid field is a 200 with an errors array", timeoutMs: 8e3, body: invalidField },
  { slug: "unauthenticated", title: "an unauthenticated query is a 401", timeoutMs: 8e3, body: unauthenticated },
  { slug: "node-repository", title: "node(id:) round-trips a repository", timeoutMs: 1e4, body: nodeRepository },
  { slug: "unknown-repository", title: "an unknown repository reads data.repository = null with no errors", timeoutMs: 8e3, body: unknownRepository },
  { slug: "batched-operations", title: "two operation documents in one body answer in order", timeoutMs: 1e4, body: batchedOperations },
  { slug: "global-id-stability", title: "global ids are opaque and equal on repeated reads", timeoutMs: 12e3, body: globalIdStability },
  { slug: "issues-pagination", title: "issues(first, after) pages by cursor to the end", timeoutMs: 12e3, body: issuesPagination }
];
var GRAPHQL_CHECKS = Object.freeze(
  CHECK_TABLE.map((entry) => {
    const body = entry.body;
    return Object.freeze({
      id: checkId("graphql", entry.slug),
      group: "graphql",
      title: entry.title,
      timeoutMs: entry.timeoutMs,
      fn: async (context) => {
        try {
          if (!Number.isFinite(context.timeoutMs) || context.timeoutMs <= 0) return fail("deadline");
          return await body(sessionOf(context));
        } catch (err) {
          if (err instanceof CheckFailure2) return fail(err.message);
          return fail(`check threw: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
        }
      }
    });
  })
);
var GRAPHQL_CHECK_IDS = Object.freeze(GRAPHQL_CHECKS.map((check2) => check2.id));

// env/src/mcp-client.ts
var MCP_PREFERRED_REVISION = "2026-07-28";
var MCP_LEGACY_REVISIONS = Object.freeze(["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]);
var MCP_CLIENT_INFO = Object.freeze({ name: "makefun-github-core-clone-env", version: "1.0.0" });
var MCP_ENDPOINT_PATH = "/mcp";
var MCP_ACCEPT = "application/json, text/event-stream";
var MCP_DEFAULT_TIMEOUT_MS = 3e3;
var JSON_RPC_PARSE_ERROR = -32700;
var JSON_RPC_INVALID_PARAMS = -32602;
var JSON_RPC_METHOD_NOT_FOUND = -32601;
var MCP_UNSUPPORTED_VERSION = -32022;
var MCP_HEADER_MISMATCH = -32020;
var McpError = class extends Error {
  status;
  code;
  bodyText;
  constructor(message, options = {}) {
    super(message);
    this.name = "McpError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.bodyText = options.bodyText ?? null;
  }
};
var McpTimeoutError = class extends McpError {
  constructor(message) {
    super(message);
    this.name = "McpTimeoutError";
  }
};
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isRevision(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function parseJson(text) {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
function isJsonRpcResponse(value) {
  if (!isRecord4(value)) return false;
  if (value.id === void 0) return false;
  return value.result !== void 0 || isRecord4(value.error);
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function revisionsOf(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRevision);
}
function supportedFromError(error) {
  const data = error?.data;
  if (!isRecord4(data)) return [];
  return revisionsOf(data.supported);
}
function serverInfoOfDiscover(result) {
  if (result === null) return null;
  const meta = result._meta;
  if (isRecord4(meta)) {
    const info = meta["io.modelcontextprotocol/serverInfo"];
    if (isRecord4(info)) return info;
  }
  if (isRecord4(result.serverInfo)) return result.serverInfo;
  return null;
}
function isPlainHeaderValue(value) {
  return /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/.test(value);
}
function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function encodeHeaderValue(value) {
  return isPlainHeaderValue(value) ? value : `=?base64?${base64Utf8(value)}?=`;
}
function headerParamString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}
var McpClient = class {
  /** The entry's base URL, no trailing slash. */
  baseUrl;
  /** `<baseUrl>/mcp`. */
  endpoint;
  /** The per-call timeout, ms. */
  timeoutMs;
  /** The identity every request's `_meta` names. */
  clientInfo;
  token;
  fetchImpl;
  abortSignal;
  sessionId;
  revision;
  nextId;
  connection;
  discoverProbe;
  toolsByName;
  constructor(options) {
    if (typeof options.baseUrl !== "string" || options.baseUrl.trim() === "") throw new McpError("McpClient needs the entry base URL");
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.endpoint = `${this.baseUrl}${MCP_ENDPOINT_PATH}`;
    this.token = options.token ?? "";
    this.timeoutMs = options.timeoutMs ?? MCP_DEFAULT_TIMEOUT_MS;
    this.clientInfo = options.clientInfo ?? { name: MCP_CLIENT_INFO.name, version: MCP_CLIENT_INFO.version };
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.abortSignal = options.signal ?? null;
    this.sessionId = null;
    this.revision = MCP_PREFERRED_REVISION;
    this.nextId = 1;
    this.connection = null;
    this.discoverProbe = null;
    this.toolsByName = /* @__PURE__ */ new Map();
  }
  /** The settled connection, or null before connect() succeeded. */
  get info() {
    return this.connection;
  }
  /** The `server/discover` probe's evidence, or null before connect(). */
  get discoverAttempt() {
    return this.discoverProbe;
  }
  /** The session header value the server handed out, or null. */
  get session() {
    return this.sessionId;
  }
  /** The revision the next request declares. */
  get protocolVersion() {
    return this.revision;
  }
  /**
   * Probe `server/discover` once, without connecting or falling back: the discover check judges the raw answer
   * (a result, or method-not-found for a pre-discover server). connect() runs this probe itself.
   */
  async probeDiscover() {
    const probe = await this.discoverOnce();
    this.discoverProbe = probe;
    if (probe.ok && probe.supportedVersions.length > 0 && !probe.supportedVersions.includes(this.revision)) {
      this.revision = probe.supportedVersions.includes(MCP_PREFERRED_REVISION) ? MCP_PREFERRED_REVISION : probe.supportedVersions[0];
    }
    return probe;
  }
  /**
   * Connect: modern `server/discover` first, then the handshake when the server answers method-not-found. Throws
   * McpError when the entry serves no endpoint this client can speak to; the checks report its message.
   */
  async connect() {
    if (this.connection !== null) return this.connection;
    const probe = await this.discoverOnce();
    this.discoverProbe = probe;
    if (probe.ok) {
      const info = this.settleModern(probe);
      this.connection = info;
      return info;
    }
    if (probe.transportError !== null) {
      throw new McpError(`the entry did not answer server/discover at ${this.endpoint}: ${probe.transportError}`);
    }
    if (probe.errorCode === MCP_UNSUPPORTED_VERSION) {
      const supported = supportedFromError(probe.http?.rpc?.error);
      const chosen = supported.includes(MCP_PREFERRED_REVISION) ? MCP_PREFERRED_REVISION : supported[0];
      if (chosen === void 0) throw new McpError(`server/discover rejected ${MCP_PREFERRED_REVISION} and named no usable version`, { status: probe.status, code: probe.errorCode });
      this.revision = chosen;
      const retry = await this.discoverOnce();
      this.discoverProbe = retry;
      if (retry.ok) {
        const info = this.settleModern(retry);
        this.connection = info;
        return info;
      }
      throw new McpError(`server/discover kept failing after retrying with ${chosen}: HTTP ${retry.status ?? "none"}${retry.errorCode !== null ? `, JSON-RPC ${retry.errorCode}` : ""}`, { status: retry.status, code: retry.errorCode });
    }
    const methodNotFound = probe.errorCode === JSON_RPC_METHOD_NOT_FOUND;
    const missingEndpoint = probe.status === 404 || probe.status === 405;
    const modernRefusal = probe.errorCode !== null && [MCP_HEADER_MISMATCH, MCP_UNSUPPORTED_VERSION, -32021, -32600, JSON_RPC_INVALID_PARAMS].includes(probe.errorCode);
    if (!methodNotFound && !missingEndpoint) {
      if (modernRefusal || probe.status === 401 || probe.status === 403 || probe.status !== null && probe.status >= 500) {
        const why = probe.errorCode !== null ? `JSON-RPC ${probe.errorCode}: ${probe.errorMessage ?? ""}` : `HTTP ${probe.status}`;
        throw new McpError(`the MCP endpoint refused server/discover (${why})`, { status: probe.status, code: probe.errorCode });
      }
    }
    return this.initializeLegacy(probe);
  }
  /** The legacy handshake: initialize with the newest revision it accepts, then notifications/initialized. */
  async initializeLegacy(probe) {
    let last = null;
    for (const revision of MCP_LEGACY_REVISIONS) {
      const outcome = await this.request("initialize", { protocolVersion: revision, capabilities: {}, clientInfo: { ...this.clientInfo } }, { id: "initialize-1", omitProtocolVersionHeader: true });
      last = outcome;
      if (outcome.error === void 0 && isRecord4(outcome.result)) {
        const negotiated = isRevision(outcome.result.protocolVersion) ? outcome.result.protocolVersion : revision;
        this.revision = negotiated;
        await this.notify("notifications/initialized", {}, { omitProtocolVersionHeader: true }).catch(() => null);
        return {
          era: "legacy",
          protocolVersion: negotiated,
          supportedVersions: [],
          serverInfo: isRecord4(outcome.result.serverInfo) ? outcome.result.serverInfo : null,
          capabilities: isRecord4(outcome.result.capabilities) ? outcome.result.capabilities : {},
          sessionId: this.sessionId,
          discover: probe
        };
      }
      if (outcome.error?.code !== JSON_RPC_INVALID_PARAMS) break;
    }
    const attempt = last;
    const why = attempt === null ? `server/discover HTTP ${probe.status ?? "none"}${probe.errorCode !== null ? `, JSON-RPC ${probe.errorCode}` : ""}` : attempt.error !== void 0 ? `initialize answered JSON-RPC ${attempt.error.code}: ${attempt.error.message}` : `initialize answered no result (HTTP ${attempt.status})`;
    throw new McpError(`the entry serves no MCP endpoint at ${this.endpoint} (${why})`, { status: attempt?.status ?? probe.status, code: attempt?.error?.code ?? probe.errorCode });
  }
  /** Record a modern connection from a successful discover result. */
  settleModern(probe) {
    const result = probe.result;
    const supported = probe.supportedVersions;
    const chosen = supported.includes(MCP_PREFERRED_REVISION) ? MCP_PREFERRED_REVISION : supported[0] ?? MCP_PREFERRED_REVISION;
    this.revision = chosen;
    return {
      era: "modern",
      protocolVersion: chosen,
      supportedVersions: supported,
      serverInfo: serverInfoOfDiscover(result),
      capabilities: isRecord4(result.capabilities) ? result.capabilities : {},
      sessionId: this.sessionId,
      discover: probe
    };
  }
  /** One `server/discover` request, its evidence captured (never thrown). */
  async discoverOnce() {
    try {
      const outcome = await this.request("server/discover", {}, { id: "discover-1" });
      if (outcome.error === void 0 && isRecord4(outcome.result)) {
        const result = outcome.result;
        return { ok: true, status: outcome.status, result, supportedVersions: revisionsOf(result.supportedVersions), errorCode: null, errorMessage: null, transportError: null, http: outcome.http };
      }
      return {
        ok: false,
        status: outcome.status,
        result: null,
        supportedVersions: [],
        errorCode: outcome.error?.code ?? null,
        errorMessage: outcome.error?.message ?? null,
        transportError: null,
        http: outcome.http
      };
    } catch (error) {
      return { ok: false, status: null, result: null, supportedVersions: [], errorCode: null, errorMessage: null, transportError: messageOf(error), http: null };
    }
  }
  /** Send one JSON-RPC request and return its answer whole (see McpRequestOutcome). */
  async request(method, params, options = {}) {
    const id = options.id ?? this.allocateId();
    const body = {
      jsonrpc: "2.0",
      id,
      method,
      params: this.withMeta(params)
    };
    const http = await this.send(body, {
      ...options,
      methodHeader: method,
      nameHeader: typeof params?.name === "string" ? params.name : void 0,
      expectedId: id
    });
    const rpc = http.rpc;
    return {
      id,
      method,
      status: http.status,
      http,
      result: rpc?.result,
      error: rpc?.error,
      matchedId: rpc?.id ?? null
    };
  }
  /** Send one JSON-RPC notification (no id); its answer is the HTTP response, and a lost notification is no error. */
  async notify(method, params, options = {}) {
    return this.send({ jsonrpc: "2.0", method, params: this.withMeta(params) }, { ...options, methodHeader: method, expectedId: null });
  }
  /** POST an exact body (the parse-error check sends one that is not JSON). */
  async postRaw(bodyText, options = {}) {
    return this.send(bodyText, { ...options, expectedId: options.expectedId ?? null });
  }
  /** `tools/list`, following `nextCursor` (bounded); each tool is remembered for x-mcp-header mirroring. */
  async listTools() {
    const tools = [];
    let cursor;
    for (let page = 0; page < 10; page += 1) {
      const outcome = await this.request("tools/list", cursor === void 0 ? {} : { cursor });
      if (outcome.error !== void 0) throw new McpError(`tools/list answered JSON-RPC ${outcome.error.code}: ${outcome.error.message}`, { status: outcome.status, code: outcome.error.code });
      const list = isRecord4(outcome.result) && Array.isArray(outcome.result.tools) ? outcome.result.tools : null;
      if (list === null) throw new McpError(`tools/list answered no tools array (HTTP ${outcome.status})`, { status: outcome.status });
      for (const tool of list) if (isRecord4(tool) && typeof tool.name === "string" && tool.name !== "") {
        tools.push(tool);
        this.toolsByName.set(tool.name, tool);
      }
      const next = isRecord4(outcome.result) && typeof outcome.result.nextCursor === "string" && outcome.result.nextCursor !== "" ? outcome.result.nextCursor : void 0;
      if (next === void 0) break;
      cursor = next;
    }
    return tools;
  }
  /** `tools/call`, the tool result parsed out; the checks judge `error` and `toolError` themselves. */
  async callTool(name, args = {}, options = {}) {
    const outcome = await this.request("tools/call", { name, arguments: args }, { ...options, extraHeaders: this.headerParamsFor(name, args) });
    const toolResult = isRecord4(outcome.result) ? outcome.result : null;
    return { ...outcome, toolResult, toolError: toolResult !== null && toolResult.isError === true };
  }
  /** Close: a legacy session is DELETEd best-effort; nothing else is held. */
  async close() {
    const session = this.sessionId;
    if (session === null) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 1e3));
      try {
        await this.fetchImpl(this.endpoint, {
          method: "DELETE",
          headers: { accept: "application/json, text/event-stream", "mcp-session-id": session, ...this.token === "" ? {} : { authorization: `Bearer ${this.token}` } },
          signal: controller.signal,
          redirect: "manual"
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
    }
  }
  /** The mirrored Mcp-Param-* headers a tool's inputSchema asks for (x-mcp-header), value-encoded. */
  headerParamsFor(name, args) {
    const tool = this.toolsByName.get(name);
    if (tool === void 0 || !isRecord4(tool.inputSchema)) return {};
    const properties = tool.inputSchema.properties;
    if (!isRecord4(properties)) return {};
    const headers = {};
    for (const [parameter, schema] of Object.entries(properties)) {
      if (!isRecord4(schema)) continue;
      const header = schema["x-mcp-header"];
      if (typeof header !== "string" || header === "") continue;
      const value = args[parameter];
      if (value === void 0) continue;
      const text = headerParamString(value);
      if (text === null) continue;
      headers[`Mcp-Param-${header}`] = encodeHeaderValue(text);
    }
    return headers;
  }
  /** Allocate the next JSON-RPC id. */
  allocateId() {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }
  /** The params with `_meta` added (never overwriting an explicit key). */
  withMeta(params) {
    const meta = {
      "io.modelcontextprotocol/protocolVersion": this.revision,
      "io.modelcontextprotocol/clientInfo": { ...this.clientInfo },
      "io.modelcontextprotocol/clientCapabilities": {},
      protocolVersion: this.revision
    };
    const given = isRecord4(params?._meta) ? params._meta : {};
    return { ...params ?? {}, _meta: { ...meta, ...given } };
  }
  /** The headers every POST carries. */
  headersFor(options) {
    const headers = { accept: MCP_ACCEPT, "content-type": "application/json" };
    if (options.omitProtocolVersionHeader !== true) headers["mcp-protocol-version"] = this.revision;
    if (options.methodHeader !== void 0) headers["mcp-method"] = options.methodHeader;
    if (options.nameHeader !== void 0 && options.nameHeader !== "") headers["mcp-name"] = encodeHeaderValue(options.nameHeader);
    if (this.sessionId !== null) headers["mcp-session-id"] = this.sessionId;
    if (options.omitAuth !== true && this.token !== "") headers.authorization = `Bearer ${this.token}`;
    for (const [name, value] of Object.entries(options.extraHeaders ?? {})) headers[name] = value;
    return headers;
  }
  /** POST one body (an object to serialize, or exact text) and capture the answer whole. Throws only on no answer. */
  async send(body, options) {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    if (this.abortSignal !== null && this.abortSignal.aborted) throw new McpError(`POST ${this.endpoint} was not sent: the check's budget is spent`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    const onAbort = () => controller.abort();
    this.abortSignal?.addEventListener("abort", onAbort, { once: true });
    try {
      let response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: this.headersFor(options),
          body: typeof body === "string" ? body : JSON.stringify(body),
          signal: controller.signal,
          redirect: "manual"
        });
      } catch (error) {
        if (this.abortSignal !== null && this.abortSignal.aborted) throw new McpError(`POST ${this.endpoint} stopped: the check's budget ran out`);
        if (controller.signal.aborted) throw new McpTimeoutError(`POST ${this.endpoint} did not answer inside ${timeoutMs} ms`);
        throw new McpError(`POST ${this.endpoint} failed: ${messageOf(error)}`);
      }
      const session = response.headers.get("mcp-session-id");
      if (session !== null) this.sessionId = session;
      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      const sse = contentType.includes("text/event-stream");
      let bodyText = "";
      let rpc = null;
      if (sse && response.body !== null) {
        const stream = await this.readEventStream(response, options.expectedId ?? null, controller.signal, timeoutMs);
        bodyText = stream.bodyText;
        rpc = stream.rpc;
      } else {
        try {
          bodyText = await response.text();
        } catch (error) {
          if (this.abortSignal !== null && this.abortSignal.aborted) throw new McpError(`POST ${this.endpoint} stopped: the check's budget ran out`);
          if (controller.signal.aborted) throw new McpTimeoutError(`POST ${this.endpoint} did not answer inside ${timeoutMs} ms`);
          throw new McpError(`reading ${this.endpoint}'s answer failed: ${messageOf(error)}`);
        }
        const parsed = parseJson(bodyText);
        if (isJsonRpcResponse(parsed)) rpc = parsed;
        else if (Array.isArray(parsed)) {
          const found = parsed.find(isJsonRpcResponse);
          if (found !== void 0) rpc = found;
        }
      }
      const json2 = sse ? null : parseJson(bodyText);
      return { status: response.status, ok: response.status >= 200 && response.status < 300, headers: response.headers, contentType, bodyText, json: json2, rpc, sse };
    } finally {
      clearTimeout(timer);
      this.abortSignal?.removeEventListener("abort", onAbort);
    }
  }
  /**
   * Read a request-scoped SSE stream until the JSON-RPC response with `expectedId` arrives (or the stream ends).
   * Notifications and comment lines before it are skipped; the response is the last data frame per the transport.
   */
  async readEventStream(response, expectedId, signal, timeoutMs) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bodyText = "";
    let buffer = "";
    let dataLines = [];
    const dispatch = () => {
      if (dataLines.length === 0) return null;
      const parsed = parseJson(dataLines.join("\n"));
      dataLines = [];
      if (!isJsonRpcResponse(parsed)) return null;
      if (expectedId === null || parsed.id === expectedId) return parsed;
      return null;
    };
    try {
      for (; ; ) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch (error) {
          if (this.abortSignal !== null && this.abortSignal.aborted) throw new McpError(`POST ${this.endpoint} stopped: the check's budget ran out`);
          if (signal.aborted) throw new McpTimeoutError(`POST ${this.endpoint} did not answer inside ${timeoutMs} ms`);
          throw new McpError(`reading ${this.endpoint}'s SSE answer failed: ${messageOf(error)}`);
        }
        if (chunk.done) break;
        const text = decoder.decode(chunk.value, { stream: true });
        bodyText += text;
        buffer += text;
        for (; ; ) {
          const newline = buffer.indexOf("\n");
          if (newline < 0) break;
          const raw = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
          if (line === "") {
            const found = dispatch();
            if (found !== null) {
              await reader.cancel().catch(() => void 0);
              return { bodyText, rpc: found };
            }
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          }
        }
      }
      return { bodyText, rpc: dispatch() };
    } finally {
      try {
        reader.releaseLock();
      } catch {
      }
    }
  }
};

// env/src/checks-mcp.ts
var MCP_GROUP = "mcp";
var MCP_REQUIRED_TOOLS = Object.freeze(["create_repo", "get_repo", "create_issue", "list_issues", "create_pull_request", "merge_pull_request"]);
var MCP_TOOL_ALIASES = Object.freeze({
  create_repo: Object.freeze(["create_repository", "repo_create", "repos_create", "repository_create"]),
  get_repo: Object.freeze(["get_repository", "repo_get", "repos_get", "repository_get"]),
  create_issue: Object.freeze(["issue_create", "issues_create"]),
  list_issues: Object.freeze(["issues_list", "issue_list"]),
  create_pull_request: Object.freeze(["pull_request_create", "pulls_create", "create_pr", "pr_create"]),
  merge_pull_request: Object.freeze(["pull_request_merge", "pulls_merge", "merge_pr", "pr_merge"])
});
var MCP_ACCEPTED_REVISIONS = Object.freeze([MCP_PREFERRED_REVISION, ...MCP_LEGACY_REVISIONS]);
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function messageOf2(error) {
  return error instanceof Error ? error.message : String(error);
}
var SetupFailure = class extends Error {
  detail;
  constructor(detail2) {
    super(detail2);
    this.name = "SetupFailure";
    this.detail = detail2;
  }
};
function detailOf(error) {
  return error instanceof SetupFailure ? error.detail : messageOf2(error);
}
function dataFor(scenario) {
  const tag = (typeof scenario.seed === "string" && scenario.seed !== "" ? scenario.seed : "00000000").slice(0, 8);
  const slug2 = (part) => part.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return {
    tag,
    repo: (part) => `mcp-${tag}-${slug2(part)}`,
    branch: (part) => `mcp-head-${tag}-${slug2(part)}`,
    filePath: (part, which) => `mcp-${tag}-${slug2(part)}-${slug2(which)}.txt`,
    issue: (index) => scenario.issues[index % scenario.issues.length],
    pull: (index) => scenario.pulls[index % scenario.pulls.length],
    blob: (index) => scenario.blobs[index % scenario.blobs.length],
    commitMessage: (index) => scenario.commits[index % scenario.commits.length].message
  };
}
function requestTimeoutOf(ctx) {
  const budget = Number.isFinite(ctx.timeoutMs) && ctx.timeoutMs > 0 ? Math.trunc(ctx.timeoutMs) : MCP_DEFAULT_TIMEOUT_MS;
  return Math.max(1, Math.min(budget, MCP_DEFAULT_TIMEOUT_MS));
}
function newClient(ctx) {
  return new McpClient({ baseUrl: ctx.baseUrl, token: ctx.token, timeoutMs: requestTimeoutOf(ctx), signal: ctx.signal });
}
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findTool(tools, canonical) {
  const wanted = new Set([canonical, ...MCP_TOOL_ALIASES[canonical] ?? []].map(normalizeName));
  const named = tools.filter((tool) => typeof tool.name === "string" && tool.name !== "");
  for (const tool of named) if (wanted.has(normalizeName(tool.name))) return tool;
  for (const tool of named) {
    const name = normalizeName(tool.name);
    for (const suffix of wanted) if (name.length > suffix.length && name.endsWith(suffix)) return tool;
  }
  return null;
}
var ARGUMENT_SYNONYMS = Object.freeze({
  owner: Object.freeze(["owner", "owner_login", "org", "organization", "organisation", "user", "user_login", "login", "account", "namespace", "owner_name"]),
  repo: Object.freeze(["repo", "repository", "repository_name", "repo_name", "repo_slug", "project", "project_name"]),
  repo_full_name: Object.freeze(["full_name", "repo_full_name", "repository_full_name", "fullName"]),
  title: Object.freeze(["title", "issue_title", "pr_title", "pull_request_title", "subject"]),
  body: Object.freeze(["body", "issue_body", "description", "content", "text", "comment"]),
  head: Object.freeze(["head", "head_ref", "head_branch", "pull_request_head", "pr_head", "source", "source_ref", "source_branch", "from", "from_branch", "branch"]),
  base: Object.freeze(["base", "base_ref", "base_branch", "pull_request_base", "pr_base", "target", "target_ref", "target_branch", "into", "into_branch"]),
  pull_number: Object.freeze(["pull_number", "pull_request_number", "pr_number", "number", "issue_number", "index"]),
  name: Object.freeze(["name", "repo", "repository", "repository_name", "repo_name"]),
  description: Object.freeze(["description", "about", "summary", "body"]),
  private: Object.freeze(["private", "is_private"]),
  state: Object.freeze(["state", "status"])
});
function mapArguments(tool, semantic) {
  const schema = isRecord5(tool.inputSchema) ? tool.inputSchema : null;
  const properties = schema !== null && isRecord5(schema.properties) ? schema.properties : null;
  if (properties === null) return { args: { ...semantic }, missing: [] };
  const byNormalized = /* @__PURE__ */ new Map();
  for (const property of Object.keys(properties)) byNormalized.set(normalizeName(property), property);
  const propertyFor = (key) => {
    for (const synonym of ARGUMENT_SYNONYMS[key] ?? [key]) {
      const property = byNormalized.get(normalizeName(synonym));
      if (property !== void 0) return property;
    }
    return null;
  };
  const args = {};
  for (const [key, value] of Object.entries(semantic)) {
    if (value === void 0) continue;
    const property = propertyFor(key);
    if (property !== null) args[property] = value;
  }
  const fullNameProperty = propertyFor("repo_full_name");
  if (propertyFor("repo") === null && fullNameProperty !== null && typeof semantic.owner === "string" && typeof semantic.repo === "string") {
    args[fullNameProperty] = `${semantic.owner}/${semantic.repo}`;
  }
  const required = schema !== null && Array.isArray(schema.required) ? schema.required.filter((entry) => typeof entry === "string") : [];
  return { args, missing: required.filter((name) => !(name in args)) };
}
async function callToolByName(client, tools, canonical, semantic, options = {}) {
  const tool = findTool(tools, canonical);
  if (tool === null) return { toolFound: false, toolName: canonical, args: {}, missing: [], outcome: null };
  const mapped = mapArguments(tool, semantic);
  const name = tool.name ?? canonical;
  if (mapped.missing.length > 0 && options.allowMissing !== true) return { toolFound: true, toolName: name, args: mapped.args, missing: mapped.missing, outcome: null };
  const outcome = await client.callTool(name, mapped.args, options);
  return { toolFound: true, toolName: name, args: mapped.args, missing: mapped.missing, outcome };
}
function callSetupFailure(call, canonical) {
  if (!call.toolFound) return `tools/list lists no ${canonical} tool`;
  if (call.missing.length > 0) return `the ${call.toolName} inputSchema requires ${call.missing.join(", ")}, which the suite has no value for`;
  return null;
}
function callFailure(call) {
  const outcome = call.outcome;
  if (outcome === null) return `the ${call.toolName} call was not made`;
  if (outcome.error !== void 0) return `tools/call ${call.toolName} -> JSON-RPC ${outcome.error.code}: ${outcome.error.message}`;
  if (outcome.toolError) return `tools/call ${call.toolName} -> isError: ${resultText(outcome.toolResult).slice(0, 300)}`;
  return null;
}
function resultText(result) {
  if (!isRecord5(result)) return "";
  const parts = [];
  if (Array.isArray(result.content)) {
    for (const block of result.content) if (isRecord5(block) && block.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  if (result.structuredContent !== void 0 && result.structuredContent !== null) parts.push(JSON.stringify(result.structuredContent));
  return parts.join("\n");
}
function resultJson(result) {
  if (!isRecord5(result)) return null;
  if (result.structuredContent !== void 0 && result.structuredContent !== null) return result.structuredContent;
  const text = resultText(result).trim();
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
  }
  for (const [open, close] of [["{", "}"], ["[", "]"]]) {
    const from = text.indexOf(open);
    const to = text.lastIndexOf(close);
    if (from >= 0 && to > from) {
      try {
        return JSON.parse(text.slice(from, to + 1));
      } catch {
      }
    }
  }
  return null;
}
function numberFrom(value, keys) {
  if (!isRecord5(value)) return null;
  for (const key of keys) {
    const found = value[key];
    if (typeof found === "number" && Number.isInteger(found)) return found;
    if (typeof found === "string" && /^\d+$/.test(found)) return Number(found);
  }
  return null;
}
function encodeSegment2(segment) {
  return encodeURIComponent(segment);
}
function encodePath(path) {
  return path.split("/").map(encodeSegment2).join("/");
}
async function restCall(ctx, method, path, body) {
  const base = ctx.baseUrl.replace(/\/+$/, "");
  const url = `${base}/api/v3${path}`;
  const controller = new AbortController();
  const timeoutMs = requestTimeoutOf(ctx);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (ctx.signal.aborted) throw new SetupFailure(`${method} ${path} was not sent: the check's budget is spent`);
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  const headers = { accept: "application/json", "user-agent": "makefun-github-core-clone-env" };
  if (body !== void 0) headers["content-type"] = "application/json";
  if (ctx.token !== "") headers.authorization = `Bearer ${ctx.token}`;
  try {
    const response = await fetch(url, { method, headers, body: body === void 0 ? void 0 : JSON.stringify(body), signal: controller.signal, redirect: "manual" });
    let text = "";
    try {
      text = await response.text();
    } catch (error) {
      if (ctx.signal.aborted) throw new SetupFailure(`${method} ${path}: the check's budget ran out while reading the answer`);
      throw new SetupFailure(`${method} ${path}: reading the answer failed: ${messageOf2(error)}`);
    }
    let json2 = null;
    if (text.trim() !== "") {
      try {
        json2 = JSON.parse(text);
      } catch {
        json2 = null;
      }
    }
    return { status: response.status, headers: response.headers, text, json: json2 };
  } catch (error) {
    if (error instanceof SetupFailure) throw error;
    if (ctx.signal.aborted) throw new SetupFailure(`${method} ${path}: the check's budget ran out`);
    if (controller.signal.aborted) throw new SetupFailure(`${method} ${path} did not answer inside ${timeoutMs} ms`);
    throw new SetupFailure(`${method} ${path} failed: ${messageOf2(error)}`);
  } finally {
    clearTimeout(timer);
    ctx.signal.removeEventListener("abort", onAbort);
  }
}
function restMessage(json2) {
  if (isRecord5(json2) && typeof json2.message === "string" && json2.message !== "") return `: ${json2.message}`;
  return "";
}
function restOk(status) {
  return status >= 200 && status < 300;
}
async function resolveOwner(ctx) {
  const answer = await restCall(ctx, "GET", "/user");
  if (answer.status === 200 && isRecord5(answer.json) && typeof answer.json.login === "string" && answer.json.login !== "") return answer.json.login;
  return ctx.scenario.viewer.login;
}
async function createSetupRepo(ctx, name) {
  const owner = await resolveOwner(ctx);
  const created = await restCall(ctx, "POST", "/user/repos", { name, private: true, description: "github-core-clone-01 MCP setup" });
  if (!restOk(created.status)) throw new SetupFailure(`POST /api/v3/user/repos (${name}) -> HTTP ${created.status}${restMessage(created.json)}`);
  let defaultBranch = isRecord5(created.json) && typeof created.json.default_branch === "string" && created.json.default_branch !== "" ? created.json.default_branch : "";
  const view = await restCall(ctx, "GET", `/repos/${encodeSegment2(owner)}/${encodeSegment2(name)}`);
  if (defaultBranch === "" && view.status === 200 && isRecord5(view.json) && typeof view.json.default_branch === "string" && view.json.default_branch !== "") defaultBranch = view.json.default_branch;
  return { owner, repo: name, defaultBranch: defaultBranch === "" ? "main" : defaultBranch };
}
async function putFile(ctx, setup, path, contentBase64, message, branch) {
  const body = { message, content: contentBase64 };
  if (branch !== void 0) body.branch = branch;
  return restCall(ctx, "PUT", `/repos/${encodeSegment2(setup.owner)}/${encodeSegment2(setup.repo)}/contents/${encodePath(path)}`, body);
}
async function refSha(ctx, setup, branch) {
  for (const path of [`/repos/${encodeSegment2(setup.owner)}/${encodeSegment2(setup.repo)}/git/refs/heads/${encodeSegment2(branch)}`, `/repos/${encodeSegment2(setup.owner)}/${encodeSegment2(setup.repo)}/branches/${encodeSegment2(branch)}`]) {
    const answer = await restCall(ctx, "GET", path);
    if (answer.status !== 200 || !isRecord5(answer.json)) continue;
    const candidates = [isRecord5(answer.json.object) ? answer.json.object.sha : void 0, answer.json.sha, isRecord5(answer.json.commit) ? answer.json.commit.sha : void 0];
    for (const candidate of candidates) if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  return null;
}
async function branchExists(ctx, setup, branch) {
  const paths = [`/repos/${encodeSegment2(setup.owner)}/${encodeSegment2(setup.repo)}/git/refs/heads/${encodeSegment2(branch)}`, `/repos/${encodeSegment2(setup.owner)}/${encodeSegment2(setup.repo)}/branches/${encodeSegment2(branch)}`];
  for (const path of paths) {
    const answer = await restCall(ctx, "GET", path);
    if (answer.status === 200) return true;
  }
  return false;
}
async function preparePullRequest(ctx, setup, data, part) {
  const base = setup.defaultBranch;
  const basePath = data.filePath(part, "base");
  const baseWrite = await putFile(ctx, setup, basePath, data.blob(0).base64, data.commitMessage(0));
  if (!restOk(baseWrite.status)) throw new SetupFailure(`PUT contents/${basePath} -> HTTP ${baseWrite.status}${restMessage(baseWrite.json)} (a PR needs a base commit)`);
  const head = data.branch(part);
  const baseSha = commitSha(baseWrite.json) ?? await refSha(ctx, setup, base);
  let headReady = false;
  if (baseSha !== null) {
    const ref = await restCall(ctx, "POST", `/repos/${encodeSegment2(setup.owner)}/${encodeSegment2(setup.repo)}/git/refs`, { ref: `refs/heads/${head}`, sha: baseSha });
    headReady = restOk(ref.status);
  }
  const headPath = data.filePath(part, "head");
  if (!headReady) {
    const write = await putFile(ctx, setup, headPath, data.blob(1).base64, data.commitMessage(1), head);
    if (!restOk(write.status)) {
      const refNote = baseSha === null ? "POST /git/refs: no base commit sha to point it at" : "POST /git/refs: refused";
      throw new SetupFailure(`could not create the branch ${head} (${refNote}; PUT contents with branch=${head} -> HTTP ${write.status}${restMessage(write.json)})`);
    }
    headReady = await branchExists(ctx, setup, head);
    if (!headReady) throw new SetupFailure(`PUT contents with branch=${head} answered HTTP ${write.status} but the branch does not exist`);
  } else {
    const write = await putFile(ctx, setup, headPath, data.blob(1).base64, data.commitMessage(1), head);
    if (!restOk(write.status)) throw new SetupFailure(`PUT contents/${headPath} on ${head} -> HTTP ${write.status}${restMessage(write.json)}`);
  }
  return { ...setup, base, head };
}
function commitSha(json2) {
  if (!isRecord5(json2) || !isRecord5(json2.commit)) return null;
  return typeof json2.commit.sha === "string" && json2.commit.sha !== "" ? json2.commit.sha : null;
}
function issuesOf(json2) {
  if (Array.isArray(json2)) return json2;
  if (isRecord5(json2) && Array.isArray(json2.issues)) return json2.issues;
  if (isRecord5(json2) && Array.isArray(json2.items)) return json2.items;
  return [];
}
function pullsOf(json2) {
  if (Array.isArray(json2)) return json2;
  if (isRecord5(json2) && Array.isArray(json2.pulls)) return json2.pulls;
  if (isRecord5(json2) && Array.isArray(json2.items)) return json2.items;
  return [];
}
async function readPull(ctx, setup, number) {
  const answer = await restCall(ctx, "GET", `/repos/${encodeSegment2(setup.owner)}/${encodeSegment2(setup.repo)}/pulls/${number}`);
  return answer.status === 200 ? answer.json : null;
}
function refOf(value) {
  if (typeof value === "string") return value;
  if (!isRecord5(value)) return null;
  if (typeof value.ref === "string") return value.ref;
  if (typeof value.branch === "string") return value.branch;
  if (typeof value.label === "string") return value.label.split(":").pop() ?? null;
  return null;
}
async function findPull(ctx, setup, wanted) {
  if (wanted.number !== null) {
    const direct = await readPull(ctx, setup, wanted.number);
    if (direct !== null) return direct;
  }
  const list = await restCall(ctx, "GET", `/repos/${encodeSegment2(setup.owner)}/${encodeSegment2(setup.repo)}/pulls?state=all&per_page=100`);
  if (list.status !== 200) return null;
  for (const pull of pullsOf(list.json)) {
    if (!isRecord5(pull)) continue;
    if (pull.title === wanted.title || refOf(pull.head) === wanted.head) return pull;
  }
  return null;
}
var MCP_CHECKS = Object.freeze([
  {
    id: checkId("mcp", "initialize"),
    group: MCP_GROUP,
    title: "initialize: serverInfo.name/version and capabilities.tools, over whichever era the server negotiates",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        const info = await client.connect();
        const name = info.serverInfo?.name;
        const version = info.serverInfo?.version;
        if (typeof name !== "string" || name.trim() === "") return fail(`the server identity has no name (era ${info.era}, revision ${info.protocolVersion})`);
        if (typeof version !== "string" || version.trim() === "") return fail(`the server identity has no version (era ${info.era}, revision ${info.protocolVersion})`);
        if (!isRecord5(info.capabilities.tools)) return fail(`capabilities.tools is missing (era ${info.era}, revision ${info.protocolVersion})`);
        return pass(`${info.era === "modern" ? "server/discover" : "initialize"}: ${name} ${version}, protocol ${info.protocolVersion}, tools capability present`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "server-discover"),
    group: MCP_GROUP,
    title: "server/discover: a DiscoverResult with supportedVersions, or the pre-discover era",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        const info = await client.connect();
        const probe = client.discoverAttempt;
        if (info.era === "modern") {
          if (info.supportedVersions.length === 0) return fail("server/discover answered without a supportedVersions list");
          return pass(`server/discover: supportedVersions ${info.supportedVersions.join(", ")}; negotiated ${info.protocolVersion}`);
        }
        const how = probe === null ? "no answer" : probe.status === 404 ? "HTTP 404" : probe.errorCode !== null ? `HTTP ${probe.status ?? "none"}, JSON-RPC ${probe.errorCode}` : `HTTP ${probe.status ?? "none"}`;
        return pass(`pre-discover revision (${how}; the server answers initialize)`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "tools-list"),
    group: MCP_GROUP,
    title: "tools/list: at least six tools, all six required ones present by name or obvious alias",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const tools = await client.listTools();
        if (tools.length < 6) return fail(`tools/list returned ${tools.length} tools, fewer than six`);
        const found = [];
        const missing = [];
        for (const canonical of MCP_REQUIRED_TOOLS) {
          const tool = findTool(tools, canonical);
          if (tool !== null) found.push(`${canonical}->${tool.name}`);
          else missing.push(canonical);
        }
        if (missing.length > 0) return fail(`tools/list is missing ${missing.join(", ")} (${tools.length} tools; found ${found.join(", ") || "none"})`);
        return pass(`${tools.length} tools; all six present: ${found.join(", ")}`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "tool-schemas"),
    group: MCP_GROUP,
    title: "every tool has a non-empty description and an inputSchema of type object",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const tools = await client.listTools();
        if (tools.length === 0) return fail("tools/list returned no tools to inspect");
        const bad = [];
        for (const tool of tools) {
          const label = typeof tool.name === "string" && tool.name !== "" ? tool.name : "(unnamed)";
          if (typeof tool.description !== "string" || tool.description.trim() === "") bad.push(`${label}: no description`);
          if (!isRecord5(tool.inputSchema) || tool.inputSchema.type !== "object") bad.push(`${label}: inputSchema.type is not object`);
        }
        if (bad.length > 0) return fail(`${bad.slice(0, 4).join("; ")}${bad.length > 4 ? ` (+${bad.length - 4} more)` : ""}`);
        return pass(`all ${tools.length} tools have a description and an object inputSchema`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "create-issue"),
    group: MCP_GROUP,
    title: "tools/call create_issue creates an issue the REST surface lists",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const tools = await client.listTools();
        const data = dataFor(ctx.scenario);
        const setup = await createSetupRepo(ctx, data.repo("issue-create"));
        const issue = data.issue(0);
        const call = await callToolByName(client, tools, "create_issue", { owner: setup.owner, repo: setup.repo, title: issue.title, body: issue.body });
        const setupFailure = callSetupFailure(call, "create_issue");
        if (setupFailure !== null) return fail(setupFailure);
        const failure = callFailure(call);
        if (failure !== null) return fail(failure);
        const listed = await restCall(ctx, "GET", `/repos/${encodeSegment2(setup.owner)}/${encodeSegment2(setup.repo)}/issues?state=all&per_page=100`);
        if (listed.status !== 200) return fail(`the REST view of the repository's issues answered HTTP ${listed.status}${restMessage(listed.json)}`);
        const issues = issuesOf(listed.json);
        const found = issues.find((entry) => isRecord5(entry) && entry.title === issue.title);
        if (found === void 0) return fail(`the issue created over MCP is not visible over REST (${issues.length} issues listed, none titled "${issue.title}")`);
        return pass(`created issue #${String(isRecord5(found) ? found.number : "?")} over MCP; REST lists it with the same title`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "list-issues"),
    group: MCP_GROUP,
    title: "tools/call list_issues returns an issue the repository holds",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const tools = await client.listTools();
        const data = dataFor(ctx.scenario);
        const setup = await createSetupRepo(ctx, data.repo("issue-list"));
        const issue = data.issue(1);
        const created = await restCall(ctx, "POST", `/repos/${encodeSegment2(setup.owner)}/${encodeSegment2(setup.repo)}/issues`, { title: issue.title, body: issue.body });
        if (!restOk(created.status)) return fail(`POST /api/v3/repos/${setup.owner}/${setup.repo}/issues -> HTTP ${created.status}${restMessage(created.json)}`);
        const number = numberFrom(created.json, ["number"]);
        const call = await callToolByName(client, tools, "list_issues", { owner: setup.owner, repo: setup.repo, state: "open" });
        const setupFailure = callSetupFailure(call, "list_issues");
        if (setupFailure !== null) return fail(setupFailure);
        const failure = callFailure(call);
        if (failure !== null) return fail(failure);
        const text = resultText(call.outcome?.toolResult ?? null);
        const foundByTitle = text.includes(issue.title);
        const foundByNumber = number !== null && new RegExp(`"number"\\s*:\\s*${number}(?!\\d)`).test(text);
        if (!foundByTitle && !foundByNumber) return fail(`list_issues did not return ${number === null ? "the issue" : `issue #${number}`} ("${issue.title}") the repository holds`);
        return pass(`list_issues returned ${number === null ? "the issue" : `issue #${number}`} (${foundByTitle ? "by title" : "by number"})`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "create-pull-request"),
    group: MCP_GROUP,
    title: "tools/call create_pull_request opens a pull request REST reads back with the same head and base",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const tools = await client.listTools();
        const data = dataFor(ctx.scenario);
        const setup = await createSetupRepo(ctx, data.repo("pr-create"));
        const prepared = await preparePullRequest(ctx, setup, data, "pr-create");
        const template = data.pull(0);
        const call = await callToolByName(client, tools, "create_pull_request", { owner: prepared.owner, repo: prepared.repo, title: template.title, body: template.body, head: prepared.head, base: prepared.base });
        const setupFailure = callSetupFailure(call, "create_pull_request");
        if (setupFailure !== null) return fail(setupFailure);
        const failure = callFailure(call);
        if (failure !== null) return fail(failure);
        const number = numberFrom(resultJson(call.outcome?.toolResult ?? null), ["number", "pull_number", "pull_request_number"]);
        const pull = await findPull(ctx, prepared, { number, title: template.title, head: prepared.head });
        if (pull === null || !isRecord5(pull)) return fail("the pull request created over MCP is not visible over REST");
        if (refOf(pull.head) !== prepared.head) return fail(`REST reads head ${String(refOf(pull.head))}, not ${prepared.head}`);
        if (refOf(pull.base) !== prepared.base) return fail(`REST reads base ${String(refOf(pull.base))}, not ${prepared.base}`);
        return pass(`pull request #${String(pull.number ?? number ?? "?")} created over MCP; REST reads ${prepared.head} into ${prepared.base}, state ${String(pull.state ?? "?")}`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "merge-pull-request"),
    group: MCP_GROUP,
    title: "tools/call merge_pull_request merges; REST reads merged:true",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const tools = await client.listTools();
        const data = dataFor(ctx.scenario);
        const setup = await createSetupRepo(ctx, data.repo("pr-merge"));
        const prepared = await preparePullRequest(ctx, setup, data, "pr-merge");
        const template = data.pull(1);
        const created = await restCall(ctx, "POST", `/repos/${encodeSegment2(prepared.owner)}/${encodeSegment2(prepared.repo)}/pulls`, { title: template.title, head: prepared.head, base: prepared.base });
        if (!restOk(created.status)) return fail(`POST pulls (setup) -> HTTP ${created.status}${restMessage(created.json)}`);
        const number = numberFrom(created.json, ["number"]);
        if (number === null) return fail("POST pulls answered no pull request number");
        const call = await callToolByName(client, tools, "merge_pull_request", { owner: prepared.owner, repo: prepared.repo, pull_number: number });
        const setupFailure = callSetupFailure(call, "merge_pull_request");
        if (setupFailure !== null) return fail(setupFailure);
        const failure = callFailure(call);
        if (failure !== null) return fail(failure);
        const pull = await readPull(ctx, prepared, number);
        if (!isRecord5(pull)) return fail(`REST does not read pull request #${number} after the merge`);
        if (pull.merged !== true) return fail(`REST reads merged=${String(pull.merged)}, state=${String(pull.state)} after merge_pull_request`);
        return pass(`pull request #${number} merged over MCP; REST reads merged:true, state ${String(pull.state ?? "?")}`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "unknown-tool"),
    group: MCP_GROUP,
    title: "an unknown tool name answers JSON-RPC -32602 or -32601, never HTTP 500",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const data = dataFor(ctx.scenario);
        const outcome = await client.request("tools/call", { name: `mcp_no_such_tool_${data.tag}`, arguments: {} });
        if (outcome.status === 500) return fail("tools/call with an unknown tool name answered HTTP 500");
        if (outcome.error !== void 0) {
          if (outcome.error.code === JSON_RPC_INVALID_PARAMS || outcome.error.code === -32601) return pass(`HTTP ${outcome.status}, JSON-RPC ${outcome.error.code}: ${outcome.error.message}`);
          return fail(`tools/call with an unknown tool name answered JSON-RPC ${outcome.error.code}: ${outcome.error.message}`);
        }
        return fail(`tools/call with an unknown tool name answered a result (HTTP ${outcome.status}), not a JSON-RPC error`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "parse-error"),
    group: MCP_GROUP,
    title: "a body that is not JSON answers HTTP 400 with JSON-RPC -32700",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        const info = await client.connect();
        const answer = await client.postRaw('{"jsonrpc": "2.0", "id": 424242, "method": "tools/list"', { methodHeader: "tools/list", expectedId: 424242 });
        const code2 = answer.rpc?.error?.code ?? null;
        if (code2 === JSON_RPC_PARSE_ERROR && answer.status === 400) return pass("HTTP 400, JSON-RPC -32700 parse error");
        if (code2 === JSON_RPC_PARSE_ERROR && answer.status === 200 && info.era === "legacy") return pass("HTTP 200, JSON-RPC -32700 parse error (the pre-2026-07-28 transport status)");
        return fail(`a malformed body answered HTTP ${answer.status}, ${code2 === null ? "no JSON-RPC error" : `JSON-RPC ${code2}`}`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "missing-arguments"),
    group: MCP_GROUP,
    title: "tools/call with missing required arguments answers isError:true or JSON-RPC -32602",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const tools = await client.listTools();
        const call = await callToolByName(client, tools, "create_issue", {}, { allowMissing: true });
        if (!call.toolFound) return fail("tools/list lists no create_issue tool");
        const outcome = call.outcome;
        if (outcome === null) return fail("the create_issue call was not made");
        if (outcome.error !== void 0) {
          if (outcome.error.code === JSON_RPC_INVALID_PARAMS) return pass("JSON-RPC -32602 invalid params");
          return fail(`tools/call create_issue without required arguments answered JSON-RPC ${outcome.error.code}: ${outcome.error.message}`);
        }
        if (outcome.toolError) return pass("isError:true");
        return fail(`tools/call create_issue with no arguments was accepted (HTTP ${outcome.status}, isError=${String(outcome.toolResult?.isError)})`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "concurrent-calls"),
    group: MCP_GROUP,
    title: "two concurrent tool calls answer under their own ids and their own objects",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const tools = await client.listTools();
        const data = dataFor(ctx.scenario);
        const left = await createSetupRepo(ctx, data.repo("concurrent-left"));
        const right = await createSetupRepo(ctx, data.repo("concurrent-right"));
        const leftTool = findTool(tools, "get_repo");
        if (leftTool === null) return fail("tools/list lists no get_repo tool");
        const leftMapped = mapArguments(leftTool, { owner: left.owner, repo: left.repo });
        const rightMapped = mapArguments(leftTool, { owner: right.owner, repo: right.repo });
        if (leftMapped.missing.length > 0) return fail(`the get_repo inputSchema requires ${leftMapped.missing.join(", ")}, which the suite has no value for`);
        if (rightMapped.missing.length > 0) return fail(`the get_repo inputSchema requires ${rightMapped.missing.join(", ")}, which the suite has no value for`);
        const leftId = `concurrent-left-${data.tag}`;
        const rightId = `concurrent-right-${data.tag}`;
        const [leftAnswer, rightAnswer] = await Promise.all([
          client.callTool(leftTool.name ?? "get_repo", leftMapped.args, { id: leftId }),
          client.callTool(leftTool.name ?? "get_repo", rightMapped.args, { id: rightId })
        ]);
        if (leftAnswer.matchedId !== leftId) return fail(`the answer for id ${leftId} carried id ${String(leftAnswer.matchedId)}`);
        if (rightAnswer.matchedId !== rightId) return fail(`the answer for id ${rightId} carried id ${String(rightAnswer.matchedId)}`);
        if (leftAnswer.error !== void 0 || rightAnswer.error !== void 0) return fail(`a concurrent call failed: ${leftAnswer.error?.message ?? rightAnswer.error?.message ?? "unknown"}`);
        const leftText = resultText(leftAnswer.toolResult);
        const rightText = resultText(rightAnswer.toolResult);
        if (!leftText.includes(left.repo)) return fail(`the answer to ${leftId} does not name ${left.repo}`);
        if (!rightText.includes(right.repo)) return fail(`the answer to ${rightId} does not name ${right.repo}`);
        return pass(`two concurrent tools/call answers kept their ids (${leftId}, ${rightId}) and their own repositories`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "tools-list-idempotent"),
    group: MCP_GROUP,
    title: "two tools/list answers hold the same tools array, byte for byte",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const first = await client.listTools();
        const second = await client.listTools();
        if (first.length !== second.length) return fail(`tools/list changed between two calls (${first.length} vs ${second.length} tools)`);
        const left = JSON.stringify(first);
        const right = JSON.stringify(second);
        if (left !== right) return fail(`tools/list changed between two calls (${first.length} tools, a different list)`);
        return pass(`${first.length} tools, byte-identical over two calls`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "rest-parity"),
    group: MCP_GROUP,
    title: "a repository and an issue created over MCP are the same objects over REST, ids stable",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const tools = await client.listTools();
        const data = dataFor(ctx.scenario);
        const repoName2 = data.repo("parity");
        let owner = await resolveOwner(ctx);
        const createdRepo = await callToolByName(client, tools, "create_repo", { owner, name: repoName2, description: ctx.scenario.repos[0].description, private: true });
        const setupFailure = callSetupFailure(createdRepo, "create_repo");
        if (setupFailure !== null) return fail(setupFailure);
        const repoFailure = callFailure(createdRepo);
        if (repoFailure !== null) return fail(repoFailure);
        const repoJson = resultJson(createdRepo.outcome?.toolResult ?? null);
        let repo = repoName2;
        const fullName = isRecord5(repoJson) && typeof repoJson.full_name === "string" ? repoJson.full_name : null;
        if (fullName !== null && fullName.includes("/")) {
          const [namedOwner, namedRepo] = fullName.split("/", 2);
          if (namedOwner !== "" && namedRepo !== "") {
            owner = namedOwner;
            repo = namedRepo;
          }
        }
        const repoPath2 = `/repos/${encodeSegment2(owner)}/${encodeSegment2(repo)}`;
        const firstRepo = await restCall(ctx, "GET", repoPath2);
        if (firstRepo.status !== 200) return fail(`GET ${repoPath2} -> HTTP ${firstRepo.status} after create_repo${restMessage(firstRepo.json)}`);
        const secondRepo = await restCall(ctx, "GET", repoPath2);
        const repoId = isRecord5(firstRepo.json) ? firstRepo.json.id : void 0;
        const secondRepoId = isRecord5(secondRepo.json) ? secondRepo.json.id : void 0;
        if (repoId === void 0 || repoId === null) return fail("the REST repository object has no id");
        if (String(repoId) !== String(secondRepoId)) return fail(`the REST repository id changed between reads (${String(repoId)} then ${String(secondRepoId)})`);
        const issue = data.issue(2);
        const createdIssue = await callToolByName(client, tools, "create_issue", { owner, repo, title: issue.title, body: issue.body });
        const issueSetupFailure = callSetupFailure(createdIssue, "create_issue");
        if (issueSetupFailure !== null) return fail(issueSetupFailure);
        const issueFailure = callFailure(createdIssue);
        if (issueFailure !== null) return fail(issueFailure);
        let number = numberFrom(resultJson(createdIssue.outcome?.toolResult ?? null), ["number"]);
        if (number === null) {
          const listed = await restCall(ctx, "GET", `${repoPath2}/issues?state=all&per_page=100`);
          if (listed.status === 200) {
            for (const entry of issuesOf(listed.json)) if (isRecord5(entry) && entry.title === issue.title && typeof entry.number === "number") number = entry.number;
          }
        }
        if (number === null) return fail("the issue created over MCP has no number REST can read");
        const issuePath = `${repoPath2}/issues/${number}`;
        const firstIssue = await restCall(ctx, "GET", issuePath);
        if (firstIssue.status !== 200) return fail(`GET ${issuePath} -> HTTP ${firstIssue.status} after create_issue`);
        const secondIssue = await restCall(ctx, "GET", issuePath);
        const issueId = isRecord5(firstIssue.json) ? firstIssue.json.id : void 0;
        const secondIssueId = isRecord5(secondIssue.json) ? secondIssue.json.id : void 0;
        const issueReadTitle = isRecord5(firstIssue.json) ? firstIssue.json.title : void 0;
        if (issueId === void 0 || issueId === null) return fail("the REST issue object has no id");
        if (String(issueId) !== String(secondIssueId)) return fail(`the REST issue id changed between reads (${String(issueId)} then ${String(secondIssueId)})`);
        if (issueReadTitle !== issue.title) return fail(`the REST issue title is ${String(issueReadTitle)}, not ${issue.title}`);
        return pass(`repo ${owner}/${repo} id ${String(repoId)} and issue #${number} id ${String(issueId)} are the same objects over MCP and REST, stable across reads`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  },
  {
    id: checkId("mcp", "auth-required"),
    group: MCP_GROUP,
    title: "a tools/call with no Authorization header answers HTTP 401",
    async fn(ctx) {
      const client = newClient(ctx);
      try {
        await client.connect();
        const data = dataFor(ctx.scenario);
        const issue = data.issue(3);
        const tools = await client.listTools().catch(() => []);
        const name = findTool(tools, "create_issue")?.name ?? "create_issue";
        const outcome = await client.callTool(name, { owner: "no-auth", repo: `no-auth-${data.tag}`, title: issue.title, body: issue.body }, { omitAuth: true });
        if (outcome.status === 401) return pass("unauthenticated tools/call -> HTTP 401");
        return fail(`unauthenticated tools/call -> HTTP ${outcome.status}${outcome.error !== void 0 ? ` (JSON-RPC ${outcome.error.code})` : ""}`);
      } catch (error) {
        return fail(detailOf(error));
      } finally {
        await client.close();
      }
    }
  }
]);
var MCP_CHECK_IDS = Object.freeze(MCP_CHECKS.map((check2) => check2.id));

// env/src/bench.ts
var FAILED_P50_MS = 1e9;
var FAILED_PERF_P50_US = 1e9;
var PUSH_REPO = "bench-push";
var CLONE_REPO = "bench-clone";
var READ_REPO = "bench-read";
var WRITE_REPO = "bench-write";
var PUSH_FILE = "bench-data.txt";
var CLONE_FILE = "history.txt";
var PUSH_CHANGE_BYTES = 1024;
var CLONE_CHANGE_BYTES = 512;
var CLONE_HISTORY_COMMITS = 200;
var BENCH_EPOCH_SEC = 17e8;
var MAIN_REF = "refs/heads/main";
var UNCALIBRATED_ERROR = `uncalibrated: T_ref is 0, so the workload earns 0 points until calibration fills it`;
function finiteOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function clampInt(value, min, max, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
function roundMs(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 1e3) / 1e3;
}
function percentileMs(rounds, percentile) {
  if (rounds.length === 0) return FAILED_P50_MS;
  const sorted = [...rounds].sort((a, b) => a - b);
  const p = Number.isFinite(percentile) ? Math.min(100, Math.max(0, percentile)) : 50;
  const rank = Math.ceil(p / 100 * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? FAILED_P50_MS;
}
function errorLine(err) {
  const flat = (text) => text.replace(/\s+/g, " ").trim();
  if (err instanceof Error) return flat(err.message) === "" ? err.name : `${err.name}: ${flat(err.message)}`;
  return flat(String(err));
}
function finishWorkload(spec2, measurement, tRef) {
  const expected = Math.max(1, Math.trunc(measurement.expectedRounds));
  const rounds = measurement.roundsMs.map(roundMs).filter((ms) => Number.isFinite(ms) && ms >= 0);
  const failed = measurement.error !== void 0 || rounds.length !== expected;
  const p50 = failed ? FAILED_P50_MS : roundMs(percentileMs(rounds, 50));
  const p99 = failed ? FAILED_P50_MS : roundMs(percentileMs(rounds, 99));
  const points = failed || measurement.uncalibrated === true ? 0 : workloadPoints(p50, tRef);
  const why = measurement.error ?? (failed ? "the workload did not finish all its rounds" : measurement.uncalibrated === true ? UNCALIBRATED_ERROR : void 0);
  const result = {
    name: spec2.name,
    rounds,
    p50_ms: p50,
    p99_ms: p99,
    ops: spec2.ops,
    points,
    ...why !== void 0 ? { error: why } : {}
  };
  return result;
}
function perfFileOf(workloads, tRefs = T_REF_MS, extraNotes = []) {
  const normalized = workloads.map((workload) => {
    const name = workload.name;
    const tRef = finiteOr(tRefs[name], 0);
    const failed = workload.error !== void 0 || !(Number.isFinite(workload.p50_ms) && workload.p50_ms < FAILED_P50_MS);
    const points2 = failed ? 0 : workloadPoints(workload.p50_ms, tRef);
    return {
      name: workload.name,
      rounds: workload.rounds.map(roundMs),
      p50_ms: workload.p50_ms,
      p99_ms: workload.p99_ms,
      ops: workload.ops,
      points: points2,
      ...workload.error !== void 0 ? { error: workload.error } : {}
    };
  });
  const points = {};
  const tiersInput = {};
  let pointsTotal = 0;
  for (const workload of normalized) {
    points[workload.name] = workload.points;
    tiersInput[workload.name] = workload.points;
    pointsTotal += workload.points;
  }
  const measured = normalized.filter((workload) => Number.isFinite(workload.p50_ms) && workload.p50_ms < FAILED_P50_MS).map((workload) => Math.max(0, workload.p50_ms));
  const perfP50Us = measured.length === 0 ? FAILED_PERF_P50_US : Math.min(FAILED_PERF_P50_US, perfTieBreakUs(measured));
  const notes = [];
  for (const note of extraNotes) if (note !== "" && !notes.includes(note)) notes.push(note);
  for (const workload of normalized) {
    if (workload.error !== void 0) notes.push(`${workload.name}: ${workload.error}`);
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
    notes
  };
}
function failedPerfFile(error, tRefs = T_REF_MS, notes = []) {
  const why = error === "" ? "the benchmark did not run" : error;
  const workloads = BENCH_WORKLOADS.map(
    (spec2) => finishWorkload(spec2, { name: spec2.name, roundsMs: [], expectedRounds: spec2.rounds, error: why }, 0)
  );
  return perfFileOf(workloads, tRefs, notes);
}
var WorkloadStop = class extends Error {
  reason;
  constructor(reason, message) {
    super(message);
    this.name = "WorkloadStop";
    this.reason = reason;
  }
};
function deadlineText(spec2) {
  return `deadline: the workload did not finish inside its ${spec2.budgetMs} ms budget`;
}
function buildPushPayloads(count) {
  const rng = scenarioRng("bench.push");
  const payloads = [];
  let parent = null;
  for (let index = 0; index < Math.max(0, Math.trunc(count)); index += 1) {
    const blob = Buffer.from(generateBlobText(rng, PUSH_CHANGE_BYTES), "utf8");
    const blobOid = hashObject("blob", blob);
    const tree = buildTree([{ mode: "100644", name: PUSH_FILE, oid: blobOid }]);
    const treeOid = hashObject("tree", tree);
    const commit = buildCommit({
      tree: treeOid,
      parents: parent === null ? [] : [parent],
      message: `bench: push ${index + 1}
`,
      author: CONFORMANCE_IDENTITY,
      committer: CONFORMANCE_IDENTITY,
      timestamp: BENCH_EPOCH_SEC + index
    });
    const commitOid = hashObject("commit", commit);
    const objects = [
      { type: "blob", data: blob },
      { type: "tree", data: tree },
      { type: "commit", data: commit }
    ];
    payloads.push({
      command: { oldOid: parent ?? ZERO_OID, newOid: commitOid, ref: MAIN_REF },
      pack: writePack(objects)
    });
    parent = commitOid;
  }
  return payloads;
}
function buildCloneHistory() {
  const rng = scenarioRng("bench.clone");
  const objects = [];
  let tip = "";
  for (let index = 0; index < CLONE_HISTORY_COMMITS; index += 1) {
    const blob = Buffer.from(generateBlobText(rng, CLONE_CHANGE_BYTES), "utf8");
    const blobOid = hashObject("blob", blob);
    const tree = buildTree([{ mode: "100644", name: CLONE_FILE, oid: blobOid }]);
    const treeOid = hashObject("tree", tree);
    const commit = buildCommit({
      tree: treeOid,
      parents: tip === "" ? [] : [tip],
      message: `bench: history ${index + 1}
`,
      author: CONFORMANCE_IDENTITY,
      committer: CONFORMANCE_IDENTITY,
      timestamp: BENCH_EPOCH_SEC + index
    });
    tip = hashObject("commit", commit);
    objects.push({ type: "blob", data: blob }, { type: "tree", data: tree }, { type: "commit", data: commit });
  }
  return { tip, pack: writePack(objects) };
}
function gitClientOf(run) {
  return new GitClient({
    baseUrl: run.baseUrl,
    token: run.token,
    signal: run.signal,
    timeoutMs: Math.max(1, run.remainingMs())
  });
}
function restClientOf(run) {
  return new RestClient({
    baseUrl: run.baseUrl,
    // An empty token sends no Authorization header, as GitClient does; null is RestClient's "none".
    token: run.token === "" ? null : run.token,
    signal: run.signal,
    timeoutMs: Math.max(1, run.remainingMs())
  });
}
function ownerOf(run) {
  return run.scenario.viewer.login;
}
async function recreateRepo(run, git, rest, repo) {
  const owner = ownerOf(run);
  run.check();
  await rest.delete(apiPath("repos", owner, repo), { timeoutMs: run.remainingMs() });
  run.check();
  await git.createRepo(owner, repo, { signal: run.signal, timeoutMs: run.remainingMs() });
}
function assertPushOk(result, ref) {
  if (result.report === null) throw new Error(`push ${ref}: the entry returned no report-status`);
  if (!result.report.unpackOk) throw new Error(`push ${ref}: unpack failed (${result.report.unpackDetail})`);
  const report = result.report.refs.find((entry) => entry.ref === ref);
  if (report === void 0) throw new Error(`push ${ref}: the report-status did not name the ref`);
  if (!report.ok) throw new Error(`push ${ref}: refused (${report.reason === "" ? "no reason given" : report.reason})`);
}
function describeRest(response) {
  if (response.status === 0) return `no response (${errorLine(response.error ?? "unknown transport error")})`;
  const flat = response.text.replace(/\s+/g, " ").trim();
  const body = flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
  return body === "" ? `HTTP ${response.status}` : `HTTP ${response.status}: ${body}`;
}
function issueNumberOf(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const number = body.number;
  return typeof number === "number" && Number.isSafeInteger(number) && number > 0 ? number : null;
}
async function runPush(run) {
  const git = gitClientOf(run);
  const rest = restClientOf(run);
  const owner = ownerOf(run);
  await recreateRepo(run, git, rest, PUSH_REPO);
  run.check();
  const total = run.warmupOps + run.rounds * run.spec.ops;
  run.log(`[bench] push: built ${total} push payload(s) before timing`);
  const payloads = buildPushPayloads(total);
  let next = 0;
  const pushOnce = async () => {
    run.check();
    const payload = payloads[next];
    if (payload === void 0) throw new Error("push: the pre-built payload list ran out");
    next += 1;
    const result = await git.push(owner, PUSH_REPO, [payload.command], {
      pack: payload.pack,
      signal: run.signal,
      timeoutMs: run.remainingMs()
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
async function runClone(run) {
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
    timeoutMs: run.remainingMs()
  });
  assertPushOk(pushed, MAIN_REF);
  const cloneOnce = async () => {
    run.check();
    const result = await git.clone(owner, CLONE_REPO, {
      depth: 1,
      parse: false,
      singleBranch: true,
      signal: run.signal,
      timeoutMs: run.remainingMs()
    });
    if (result.checksumOk !== true) throw new Error("clone: the pack checksum did not verify");
    if (result.packBytes <= 0) throw new Error("clone: the clone received no packfile");
    if (result.refs.length === 0) throw new Error("clone: the clone received no refs");
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
async function runRead(run) {
  const git = gitClientOf(run);
  const rest = restClientOf(run);
  const owner = ownerOf(run);
  await recreateRepo(run, git, rest, READ_REPO);
  run.check();
  const template = run.scenario.issues[0];
  if (template === void 0) throw new Error("read: the scenario has no issue template");
  const created = await rest.post(apiPath("repos", owner, READ_REPO, "issues"), {
    body: { title: `${template.title} (bench setup)`, body: template.body },
    timeoutMs: run.remainingMs()
  });
  if (created.status !== 201) throw new Error(`read: the setup issue create answered ${describeRest(created)}`);
  const number = issueNumberOf(created.body);
  if (number === null) throw new Error("read: the setup issue create answered no numeric issue number");
  const path = apiPath("repos", owner, READ_REPO, "issues", number);
  const readOnce = async () => {
    run.check();
    const response = await rest.get(path, { timeoutMs: run.remainingMs() });
    if (response.status !== 200) throw new Error(`read: GET issue ${number} answered ${describeRest(response)}`);
    if (typeof response.body !== "object" || response.body === null) throw new Error(`read: GET issue ${number} answered no JSON object body`);
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
async function runWrite(run) {
  const git = gitClientOf(run);
  const rest = restClientOf(run);
  const owner = ownerOf(run);
  await recreateRepo(run, git, rest, WRITE_REPO);
  run.check();
  const total = run.warmupOps + run.rounds * run.spec.ops;
  const payloads = [];
  for (let index = 0; index < total; index += 1) {
    const template = run.scenario.issues[index % run.scenario.issues.length];
    if (template === void 0) throw new Error("write: the scenario has no issue template");
    payloads.push({ title: `${template.title} [bench ${index + 1}]`, body: template.body });
  }
  const path = apiPath("repos", owner, WRITE_REPO, "issues");
  let next = 0;
  const writeOnce = async () => {
    run.check();
    const payload = payloads[next];
    if (payload === void 0) throw new Error("write: the pre-built issue list ran out");
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
var WORKLOAD_BODIES = Object.freeze({
  push: runPush,
  clone: runClone,
  read: runRead,
  write: runWrite
});
async function runWorkload(spec2, phase) {
  const startedAt = phase.now();
  const deadlineAt = Math.min(startedAt + spec2.budgetMs, phase.phaseEnd);
  if (deadlineAt <= startedAt) {
    return { name: spec2.name, roundsMs: [], expectedRounds: phase.rounds, error: "the benchmark phase deadline fell before the workload ran" };
  }
  const controller = new AbortController();
  if (phase.signal?.aborted === true) controller.abort();
  const state = { expired: false };
  const run = {
    spec: spec2,
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
    get expired() {
      return state.expired;
    },
    set expired(value) {
      state.expired = value;
    },
    remainingMs() {
      return Math.max(0, deadlineAt - phase.now());
    },
    check() {
      if (controller.signal.aborted) {
        throw new WorkloadStop(state.expired ? "deadline" : "aborted", state.expired ? deadlineText(spec2) : "the trial was aborted");
      }
      if (phase.now() > deadlineAt) {
        state.expired = true;
        controller.abort();
        throw new WorkloadStop("deadline", deadlineText(spec2));
      }
    }
  };
  let timer;
  const onAbort = () => controller.abort();
  if (!controller.signal.aborted) {
    timer = setTimeout(() => {
      state.expired = true;
      controller.abort();
    }, Math.max(1, deadlineAt - phase.now()));
    phase.signal?.addEventListener("abort", onAbort, { once: true });
  }
  try {
    await WORKLOAD_BODIES[spec2.name](run);
    return { name: spec2.name, roundsMs: [...run.roundsMs], expectedRounds: phase.rounds };
  } catch (err) {
    const why = err instanceof WorkloadStop ? err.message : controller.signal.aborted ? state.expired ? deadlineText(spec2) : "the trial was aborted" : errorLine(err);
    controller.abort();
    return { name: spec2.name, roundsMs: [...run.roundsMs], expectedRounds: phase.rounds, error: why };
  } finally {
    if (timer !== void 0) clearTimeout(timer);
    phase.signal?.removeEventListener("abort", onAbort);
  }
}
async function runBenchmark(options) {
  if (typeof options?.baseUrl !== "string" || options.baseUrl.trim() === "") {
    throw new TypeError("runBenchmark needs the entry base URL (wire.ts EntryBase.url)");
  }
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
  const token = typeof options.token === "string" ? options.token : "";
  const now = options.now ?? (() => performance.now());
  const rounds = clampInt(options.rounds, 1, 25, BENCH_ROUNDS);
  const warmupOps = clampInt(options.warmupOps, 0, 200, BENCH_WARMUP_OPS);
  const phaseBudget = finiteOr(options.phaseBudgetMs, BENCH_PHASE_BUDGET_MS);
  const phaseStart = now();
  const deadlineMs = finiteOr(options.deadlineMs, Number.POSITIVE_INFINITY);
  const phaseEnd = Math.min(phaseStart + Math.max(1, phaseBudget), deadlineMs);
  const log = options.log ?? (() => void 0);
  const scenario = buildScenario();
  const tRefs = {
    push: T_REF_MS.push,
    clone: T_REF_MS.clone,
    read: T_REF_MS.read,
    write: T_REF_MS.write
  };
  for (const workload of BENCH_WORKLOADS) {
    const override = options.tRefs?.[workload.name];
    if (override !== void 0) tRefs[workload.name] = finiteOr(override, 0);
  }
  const requested = options.workloads ?? BENCH_WORKLOAD_NAMES;
  const order = [];
  const seen = /* @__PURE__ */ new Set();
  for (const name of requested) {
    if (!BENCH_WORKLOAD_NAMES.includes(name)) throw new TypeError(`unknown benchmark workload ${JSON.stringify(name)} (the workloads are ${BENCH_WORKLOAD_NAMES.join(", ")})`);
    if (seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }
  const phase = {
    baseUrl,
    token,
    scenario,
    now,
    phaseEnd,
    signal: options.signal,
    log
  };
  const measurements = [];
  for (const name of order) {
    const spec2 = benchWorkload(name);
    if (options.signal?.aborted === true) {
      measurements.push({ name, roundsMs: [], expectedRounds: rounds, error: "the trial was aborted before the workload ran" });
      continue;
    }
    if (now() >= phaseEnd) {
      measurements.push({ name, roundsMs: [], expectedRounds: rounds, error: "the benchmark phase deadline fell before the workload ran" });
      continue;
    }
    log(`[bench] ${name}: ${spec2.ops} op(s) a round, ${rounds} round(s), ${warmupOps} warm-up op(s), ${spec2.budgetMs} ms budget`);
    const measured = await runWorkload(spec2, { ...phase, rounds, warmupOps });
    const tRef = finiteOr(tRefs[name], 0);
    measurements.push(tRef > 0 ? measured : { ...measured, uncalibrated: true });
  }
  const tRefsOut = tRefs;
  const uncalibrated = BENCH_WORKLOADS.filter((workload) => !(finiteOr(tRefsOut[workload.name], 0) > 0)).map((workload) => workload.name);
  const notes = [];
  if (uncalibrated.length > 0) notes.push(`T_ref is uncalibrated (0) for ${uncalibrated.join(", ")}: those workloads earn 0 points`);
  const workloads = measurements.map((measurement) => {
    const spec2 = benchWorkload(measurement.name);
    const result = finishWorkload(spec2, measurement, finiteOr(tRefsOut[measurement.name], 0));
    log(`[bench] ${measurement.name}: p50 ${result.p50_ms} ms, ${result.points} point(s)${result.error !== void 0 ? ` (${result.error})` : ""}`);
    return result;
  });
  return perfFileOf(workloads, tRefsOut, notes);
}

// env/src/export.ts
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
var STATIC_PERF_TIERS = Object.freeze({
  push: 0,
  clone: 0,
  read: 0,
  write: 0
});
function exportCheckIds(checkIds) {
  const present = new Set(checkIds);
  const out = [...present];
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
function checksOf(input) {
  const checks = {};
  for (const id of input.checkIds) checks[id] = input.results[id]?.ok === true ? 1 : 0;
  return checks;
}
function stateExportOf(input) {
  const checkIds = input.pad === false ? [...input.checkIds] : exportCheckIds(input.checkIds);
  const bitsInput = { ...input, checkIds };
  const checks = checksOf(bitsInput);
  const counts = countsFromChecks(checks);
  const working = workingBit(input.bootOk, counts.passed);
  const notes = input.notes === void 0 ? [] : input.notes.slice();
  return stateFromChecks({ checks, checkIds, perfTiers: STATIC_PERF_TIERS, working, notes });
}
function bootFailureExport(checkIds, notes = [BOOT_FAILED_NOTE]) {
  return stateExportOf({ checkIds, results: {}, bootOk: false, notes });
}
function readStateExport(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return isStateFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function readPerfExport(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return isPerfFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function stateNotWorse(existing, next) {
  if (next.working !== existing.working) return next.working > existing.working;
  return next.counts.passed >= existing.counts.passed;
}
function perfNotWorse(existing, next) {
  return next.points_total >= existing.points_total;
}
function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}
function writeStateExport(stateDir, state, options = {}) {
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
function writePerfExport(stateDir, perf, options = {}) {
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
function writeExportPair(stateDir, state, perf) {
  const stateWrite = writeStateExport(stateDir, state);
  const perfWrite = writePerfExport(stateDir, perf);
  return { state: stateWrite, perf: perfWrite };
}
var PERF_TIER_KEYS = Object.freeze([...BENCH_WORKLOAD_NAMES]);

// env/src/main.ts
var WALL_BUDGET_ENV = "MAKEFUN_TRIAL_WALL_BUDGET_SEC";
var READY_WAIT_MS = 3e4;
var DEADLINE_EXIT_GRACE_MS = 5e3;
var CHECK_DRAIN_GRACE_MS = 1e3;
var ENV_LOG_PREFIX = "[env] ";
var CALLS_LOG_FILE = "calls.ndjson";
var FIXTURE_EPOCH_SEC = 1735689600;
var FIXTURE_REQUEST_TIMEOUT_MS = 4e3;
var FIXTURE_PUSH_BUDGET_MS = 12e3;
function messageOf3(err) {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.replace(/\s+/g, " ").trim();
}
function realLog(line) {
  process.stderr.write(`${ENV_LOG_PREFIX}${line}
`);
}
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}
function roundMs2(ms) {
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0;
}
function trialWallBudgetOf(env = process.env) {
  const text = env[WALL_BUDGET_ENV];
  const value = text === void 0 || text === "" ? Number.NaN : Number(text);
  return Number.isFinite(value) && value > 0 ? value : TRIAL_WALL_BUDGET_SEC;
}
function listenTargetOf(env = process.env, override = {}) {
  const stateDir = env[STATE_DIR_ENV];
  const processDriver = stateDir !== void 0 && stateDir !== "";
  const host = override.host ?? (env[ENV_HOST_ENV] || (processDriver ? PROCESS_DRIVER_HOST : CONTAINER_HOST));
  const portText = override.port !== void 0 ? String(override.port) : env[ENV_PORT_ENV] ?? String(DEFAULT_ENV_PORT);
  if (!/^\d{1,5}$/.test(portText) || Number(portText) > 65535) {
    throw new WireError(`${ENV_PORT_ENV} ${JSON.stringify(portText)} is not a port (0..65535, digits only)`);
  }
  return { host, port: Number(portText) };
}
function bindServer(server, target) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once("error", onError);
    server.listen({ port: target.port, host: target.host, reusePort: false }, () => {
      server.removeListener("error", onError);
      const bound = server.address();
      if (bound === null || typeof bound === "string") {
        reject(new Error(`the env's listener on ${target.host}:${target.port} has no TCP address`));
        return;
      }
      resolve({ host: target.host, port: bound.port });
    });
  });
}
function writeReadyFile(stateDir, address) {
  mkdirSync2(stateDir, { recursive: true });
  const file = readyFilePath(stateDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(readyBody(address.host, address.port))}
`, "utf8");
  renameSync2(tmp, file);
}
function readReadyFile(stateDir) {
  try {
    const parsed = JSON.parse(readFileSync2(readyFilePath(stateDir), "utf8"));
    return isReadyFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function sendJson(res, status, body, headers = {}) {
  const text = `${JSON.stringify(body)}
`;
  try {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(text),
      "cache-control": "no-store",
      ...headers
    });
    res.end(text);
  } catch {
  }
}
function pathOf(req) {
  try {
    return new URL(req.url ?? "/", "http://env").pathname;
  } catch {
    return "/";
  }
}
async function readRegisterBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > MAX_REGISTER_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
async function handleRequest(req, res, options) {
  const method = req.method ?? "GET";
  const path = pathOf(req);
  if (path === REGISTER_PATH) {
    if (method !== "POST") {
      sendJson(res, REGISTER_METHOD_STATUS, { ok: false, error: "method_not_allowed", message: `${REGISTER_PATH} takes POST` });
      return;
    }
    const raw = await readRegisterBody(req);
    if (raw === null) {
      sendJson(res, REGISTER_BAD_REQUEST_STATUS, { ok: false, error: "body_too_large", message: `a register body holds at most ${MAX_REGISTER_BODY_BYTES} bytes` });
      return;
    }
    let body;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      sendJson(res, REGISTER_BAD_REQUEST_STATUS, { ok: false, error: "bad_json", message: "the register body is not JSON" });
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
      sendJson(res, REGISTER_BAD_REQUEST_STATUS, { ok: false, error: "bad_request", message: messageOf3(err) });
    }
    return;
  }
  if (path === DONE_PATH) {
    if (method !== "GET") {
      sendJson(res, REGISTER_METHOD_STATUS, { ok: false, error: "method_not_allowed", message: `${DONE_PATH} takes GET` });
      return;
    }
    sendJson(res, 200, options.isDone() ? doneComplete() : doneWaiting());
    return;
  }
  sendJson(res, 404, { ok: false, error: "not_found", message: `no route ${method} ${path}` });
}
function createEnvServer(options) {
  const server = createServer((req, res) => {
    void handleRequest(req, res, options).catch((err) => {
      options.log(`a request failed: ${messageOf3(err)}`);
      sendJson(res, 500, { ok: false, error: "internal", message: "the env failed to answer" });
    });
  });
  server.on("error", (err) => {
    options.log(`the listener reported an error: ${messageOf3(err)}`);
  });
  return server;
}
function putObject(store, type, data) {
  const oid = hashObject(type, data);
  if (!store.objects.has(oid)) store.objects.set(oid, { type, data });
  return oid;
}
function treeEntriesOf(store, treeOid) {
  const tree = store.objects.get(treeOid);
  if (tree === void 0 || tree.type !== "tree") throw new WireError(`the fixture tree ${treeOid} is not in the client store`);
  return parseTree(tree.data);
}
async function loadCommitTree(client, store, owner, repo, commitOid, signal) {
  if (!store.objects.has(commitOid)) {
    const fetched = await client.fetch(owner, repo, { wants: [commitOid], parse: true }, { signal });
    for (const [oid, object] of fetched.objects) if (!store.objects.has(oid)) store.objects.set(oid, object);
  }
  const commit = store.objects.get(commitOid);
  if (commit === void 0 || commit.type !== "commit") return null;
  const tree = store.objects.get(parseCommit(commit.data).tree);
  if (tree === void 0 || tree.type !== "tree") return null;
  return parseTree(tree.data);
}
function findTreePath(store, entries, segments) {
  const head = segments[0];
  if (head === void 0) return null;
  const entry = entries.find((candidate) => candidate.name === head);
  if (entry === void 0) return null;
  if (segments.length === 1) return entry.mode === "40000" ? null : entry.oid;
  if (entry.mode !== "40000") return null;
  const child = store.objects.get(entry.oid);
  if (child === void 0 || child.type !== "tree") return null;
  return findTreePath(store, parseTree(child.data), segments.slice(1));
}
function buildTreeWithPath(store, entries, segments, blobOid) {
  const head = segments[0];
  if (head === void 0 || head === "" || head === "." || head === "..") throw new WireError("the fixture file path has an unusable segment");
  const rest = segments.slice(1);
  const kept = entries.filter((entry) => entry.name !== head);
  if (rest.length === 0) {
    kept.push({ mode: "100644", name: head, oid: blobOid });
  } else {
    const existing = entries.find((entry) => entry.name === head && entry.mode === "40000");
    const childEntries = existing === void 0 ? [] : treeEntriesOf(store, existing.oid);
    kept.push({ mode: "40000", name: head, oid: buildTreeWithPath(store, childEntries, rest, blobOid) });
  }
  return putObject(store, "tree", buildTree(kept));
}
async function fixtureHoldsFile(client, store, owner, repo, commitOid, segments, content, signal) {
  const entries = await loadCommitTree(client, store, owner, repo, commitOid, signal);
  if (entries === null) return null;
  const oid = findTreePath(store, entries, segments);
  if (oid === null) return false;
  const blob = store.objects.get(oid);
  return blob !== void 0 && blob.type === "blob" ? blob.data.toString("utf8") === content : false;
}
async function pushFixtureBranch(client, store, request, signal, log) {
  const path = request.path.replace(/^\/+/, "").replace(/\/+$/, "");
  if (path === "") return "the fixture file path is empty";
  const segments = path.split("/");
  await client.createRepo(request.owner, request.repo, { signal });
  const prefixes = [`refs/heads/${request.branch}`];
  if (request.from !== void 0) prefixes.push(`refs/heads/${request.from}`);
  const listed = await client.lsRefs(request.owner, request.repo, { signal, prefixes });
  const branchTip = listed.refs.find((ref) => ref.name === `refs/heads/${request.branch}`)?.oid;
  let fromTip;
  if (request.from !== void 0) {
    fromTip = listed.refs.find((ref) => ref.name === `refs/heads/${request.from}`)?.oid;
    if (fromTip === void 0) return `the branch ${request.from} does not exist on ${request.owner}/${request.repo}`;
  }
  if (branchTip !== void 0) {
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
  const blob = putObject(store, "blob", Buffer.from(request.content, "utf8"));
  const tree = buildTreeWithPath(store, parentEntries, segments, blob);
  const commit = putObject(
    store,
    "commit",
    buildCommit({
      tree,
      parents: parent === null ? [] : [parent],
      message: `${request.message}
`,
      timestamp: FIXTURE_EPOCH_SEC,
      author: CONFORMANCE_IDENTITY,
      committer: CONFORMANCE_IDENTITY
    })
  );
  const advertisement = await client.advertisement(request.owner, request.repo, "git-receive-pack", { signal });
  if (advertisement.protocol !== 0) return "receive-pack advertised a non-v0 protocol";
  const serverTips = advertisement.refs.map((ref) => ref.oid).filter((oid) => oid !== ZERO_OID);
  const objects = objectsToSend((oid) => store.objects.get(oid), serverTips, [commit]);
  const pushed = await client.push(
    request.owner,
    request.repo,
    [{ oldOid: branchTip ?? ZERO_OID, newOid: commit, ref: `refs/heads/${request.branch}` }],
    { objects, signal }
  );
  if (pushed.report === null) return "the server returned no report-status for the fixture push";
  if (!pushed.report.unpackOk) return `unpack failed: ${pushed.report.unpackDetail}`;
  const rejected = pushed.report.refs.find((ref) => !ref.ok);
  if (rejected !== void 0) return `${rejected.ref}: ${rejected.reason}`;
  log(`git fixture: pushed ${commit.slice(0, 12)} to refs/heads/${request.branch} (${path})`);
  return null;
}
function createGitFixture(options) {
  const client = new GitClient({
    baseUrl: options.baseUrl,
    token: options.token,
    timeoutMs: options.timeoutMs ?? FIXTURE_REQUEST_TIMEOUT_MS,
    signal: options.signal
  });
  const store = { objects: /* @__PURE__ */ new Map() };
  const log = options.log ?? (() => void 0);
  return {
    async pushBranch(request) {
      const budget = AbortSignal.timeout(FIXTURE_PUSH_BUDGET_MS);
      const signal = options.signal === void 0 ? budget : AbortSignal.any([options.signal, budget]);
      try {
        return await pushFixtureBranch(client, store, request, signal, log);
      } catch (err) {
        return `threw ${messageOf3(err)}`;
      }
    }
  };
}
async function runCheck(spec2, context, timeoutMs, controller, drainMs) {
  let started;
  try {
    started = Promise.resolve(spec2.fn(context));
  } catch (err) {
    started = Promise.reject(err);
  }
  const guarded = started.then(
    (result2) => typeof result2 === "object" && result2 !== null && typeof result2.ok === "boolean" ? result2 : fail("the check returned no result"),
    (err) => fail(`threw ${messageOf3(err)}`)
  );
  let timedOut = false;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve(fail("deadline"));
    }, Math.max(1, timeoutMs));
  });
  const result = await Promise.race([guarded, timeout]);
  if (timer !== void 0) clearTimeout(timer);
  if (timedOut && drainMs > 0) {
    await Promise.race([guarded.then(() => void 0, () => void 0), sleep(drainMs)]);
  }
  return result;
}
function suiteChecks() {
  return [...GIT_CHECKS, ...restChecks(), ...restProtocolChecks(), ...GRAPHQL_CHECKS, ...MCP_CHECKS];
}
async function runBoot(state) {
  const limit = Math.min(BOOT_BUDGET_MS, Math.max(0, state.deadline.deadlineMs - state.now()));
  try {
    await waitForValue(() => state.gate.entry, {
      timeoutMs: limit,
      signal: state.trial.signal,
      now: state.now
    });
  } catch (err) {
    state.log(`boot: no register inside ${Math.round(limit)} ms (${messageOf3(err)})`);
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
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.any([state.trial.signal, AbortSignal.timeout(Math.max(1, left))])
      });
      await response.arrayBuffer().catch(() => void 0);
      if (response.status === 200) answered += 1;
      else state.log(`boot: GET ${HEALTHZ_PATH} ${attempt}/${HEALTHZ_ATTEMPTS} answered HTTP ${response.status}`);
    } catch (err) {
      state.log(`boot: GET ${HEALTHZ_PATH} ${attempt}/${HEALTHZ_ATTEMPTS} failed (${messageOf3(err)})`);
    }
  }
  state.log(`boot: ${HEALTHZ_PATH} answered ${answered}/${HEALTHZ_ATTEMPTS} times in ${Math.round(healthBudget)} ms`);
  return answered === HEALTHZ_ATTEMPTS;
}
function installGitFixture(state) {
  const entry = state.entry;
  if (entry === null) {
    configureGraphQLGit(null);
    return;
  }
  try {
    configureGraphQLGit(createGitFixture({ baseUrl: entry.url, token: state.token, signal: state.trial.signal, log: state.log }));
    state.log("graphql: the git fixture is installed over the suite's git client");
  } catch (err) {
    configureGraphQLGit(null);
    state.log(`graphql: the git fixture could not be installed (${messageOf3(err)})`);
  }
}
async function runConformance(state) {
  const issues = validateCheckSpecs(state.specs);
  for (const issue of issues) state.log(`manifest: ${issue}`);
  if (issues.length > 0) {
    state.log(`manifest: ${issues.length} issue(s); the suite runs anyway and the unregistered ids export 0`);
  }
  const entry = state.entry;
  if (entry === null) return;
  const phaseEnd = Math.min(state.deadline.deadlineMs, state.now() + CONFORMANCE_BUDGET_MS);
  for (const spec2 of state.specs) {
    const nowMs = state.now();
    const phaseLeft = Math.min(phaseEnd, state.deadline.deadlineMs) - nowMs;
    if (state.trial.signal.aborted || phaseLeft <= 0) {
      state.results[spec2.id] = { ok: false, detail: "deadline" };
      if (nowMs >= state.deadline.deadlineMs) state.deadlineFallen = true;
      continue;
    }
    const timeoutMs = checkTimeoutMs(spec2.timeoutMs, phaseLeft);
    if (timeoutMs <= 0) {
      state.results[spec2.id] = { ok: false, detail: "deadline" };
      continue;
    }
    const controller = new AbortController();
    const onTrialAbort = () => controller.abort();
    state.trial.signal.addEventListener("abort", onTrialAbort, { once: true });
    if (state.trial.signal.aborted) controller.abort();
    const context = {
      baseUrl: entry.url,
      token: state.token,
      scenario: state.scenario,
      signal: controller.signal,
      deadlineMs: state.now() + timeoutMs,
      timeoutMs,
      log: (line) => state.log(`${spec2.id}: ${line}`)
    };
    let result;
    try {
      const drainMs = state.now() >= state.deadline.deadlineMs ? 0 : CHECK_DRAIN_GRACE_MS;
      result = await runCheck(spec2, context, timeoutMs, controller, drainMs);
    } finally {
      state.trial.signal.removeEventListener("abort", onTrialAbort);
    }
    const detail2 = result.ok ? result.detail : result.detail ?? "failed";
    state.results[spec2.id] = result.ok ? { ok: true, detail: detail2 } : { ok: false, detail: detail2 };
    state.log(`${spec2.id} ${result.ok ? "pass" : "fail"}${detail2 === void 0 ? "" : ` — ${detail2}`}`);
    if (state.now() >= state.deadline.deadlineMs) state.deadlineFallen = true;
  }
}
async function runBenchmarkPhase(state) {
  const entry = state.entry;
  if (entry === null) return failedPerfFile(BOOT_FAILED_NOTE);
  if (state.trial.signal.aborted) return failedPerfFile("the trial was aborted before the benchmark ran");
  const nowMs = state.now();
  if (nowMs >= state.deadline.deadlineMs) {
    state.deadlineFallen = true;
    return failedPerfFile("the internal deadline fell before the benchmark ran");
  }
  const phaseEnd = Math.min(state.deadline.deadlineMs, nowMs + BENCHMARK_BUDGET_MS);
  try {
    return await runBenchmark({
      baseUrl: entry.url,
      token: state.token,
      signal: state.trial.signal,
      deadlineMs: phaseEnd,
      now: state.now,
      log: (line) => state.log(line)
    });
  } catch (err) {
    state.log(`the benchmark threw (${messageOf3(err)})`);
    return failedPerfFile(`the benchmark threw: ${messageOf3(err)}`);
  }
}
function finishSuite(state, startedAt) {
  const exportStart = state.now();
  const registered = state.registered || state.gate.registered;
  const perf = state.perf ?? failedPerfFile(registered ? state.trial.signal.aborted ? "the trial was aborted before the benchmark finished" : "the benchmark did not run" : BOOT_FAILED_NOTE);
  const stateFile = stateExportOf({
    checkIds: state.specs.map((spec2) => spec2.id),
    results: state.results,
    bootOk: state.bootOk,
    notes: registered ? [] : [BOOT_FAILED_NOTE]
  });
  try {
    writeExportPair(state.stateDir, stateFile, perf);
    state.log(`export: state.json (${stateFile.counts.passed}/${stateFile.counts.total} passed, working ${stateFile.working}) and perf.json (${perf.points_total} points) written`);
  } catch (err) {
    state.log(`export: the export could not be written (${messageOf3(err)})`);
  }
  state.phaseMs.export = roundMs2(state.now() - exportStart);
  state.log(
    `phases: boot ${state.phaseMs.boot} ms, conformance ${state.phaseMs.conformance} ms, benchmark ${state.phaseMs.benchmark} ms, export ${state.phaseMs.export} ms`
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
    durationMs: roundMs2(state.now() - startedAt)
  };
}
async function runSuite(state) {
  const startedAt = state.now();
  try {
    const bootStart = state.now();
    try {
      await waitForReadyFile(() => readReadyFile(state.stateDir), {
        timeoutMs: READY_WAIT_MS,
        signal: state.trial.signal,
        now: state.now
      });
    } catch (err) {
      state.log(`ready: ${readyFilePath(state.stateDir)} did not read back (${messageOf3(err)})`);
      return finishSuite(state, startedAt);
    }
    state.bootOk = await runBoot(state);
    state.phaseMs.boot = roundMs2(state.now() - bootStart);
    if (!state.registered) {
      state.log("boot: no entry registered before the boot deadline");
      return finishSuite(state, startedAt);
    }
    if (state.trial.signal.aborted) return finishSuite(state, startedAt);
    installGitFixture(state);
    const conformanceStart = state.now();
    await runConformance(state);
    state.phaseMs.conformance = roundMs2(state.now() - conformanceStart);
    if (state.trial.signal.aborted) return finishSuite(state, startedAt);
    const benchmarkStart = state.now();
    state.perf = await runBenchmarkPhase(state);
    state.phaseMs.benchmark = roundMs2(state.now() - benchmarkStart);
  } catch (err) {
    state.log(`suite: stopped by ${messageOf3(err)}`);
  }
  return finishSuite(state, startedAt);
}
async function startEnv(options = {}) {
  const env = options.env ?? process.env;
  const stateDir = options.stateDir ?? stateDirOf(env);
  const now = options.now ?? (() => performance.now());
  const log = options.log ?? realLog;
  const startedAt = now();
  const wallBudgetSec = options.wallBudgetSec ?? trialWallBudgetOf(env);
  const deadline = deadlineOf(startedAt, wallBudgetSec);
  const token = env[TOKEN_ENV] ?? "";
  const specs2 = options.checks === void 0 ? suiteChecks() : [...options.checks];
  const gate = new RegisterGate();
  const trial = new AbortController();
  const results = {};
  const phaseMs = { boot: 0, conformance: 0, benchmark: 0, export: 0 };
  let done = false;
  const isDone = () => done;
  const server = createEnvServer({ gate, isDone, log });
  const target = listenTargetOf(env, { host: options.host, port: options.port });
  const address = await bindServer(server, target);
  mkdirSync2(stateDir, { recursive: true });
  writeFileSync(joinPath(stateDir, CALLS_LOG_FILE), "");
  writeReadyFile(stateDir, address);
  log(`listening on ${address.host}:${address.port}, state ${stateDir}`);
  log(`internal deadline in ${Math.round(deadline.deadlineMs - startedAt)} ms (wall budget ${wallBudgetSec} s less ${DEADLINE_MARGIN_MS} ms)`);
  const state = {
    gate,
    specs: specs2,
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
    perf: null
  };
  let resolveStopped = () => void 0;
  const stopped = new Promise((resolve) => {
    resolveStopped = resolve;
  });
  let stopping = null;
  let exitTimer;
  const stop = (reason) => {
    if (stopping !== null) return stopping;
    stopping = (async () => {
      if (reason !== void 0) log(`stopping: ${reason}`);
      trial.abort();
      if (exitTimer !== void 0) clearTimeout(exitTimer);
      const registered = state.registered || state.gate.registered;
      const perf = state.perf ?? failedPerfFile(registered ? "the trial was aborted before the benchmark finished" : BOOT_FAILED_NOTE);
      const stateFile = stateExportOf({
        checkIds: state.specs.map((spec2) => spec2.id),
        results: state.results,
        bootOk: state.bootOk,
        notes: registered ? [] : [BOOT_FAILED_NOTE]
      });
      try {
        const written = writeExportPair(state.stateDir, stateFile, perf);
        log(`export on stop: state.json ${written.state.written ? "written" : "kept"}, perf.json ${written.perf.written ? "written" : "kept"}`);
      } catch (err) {
        log(`export on stop: could not be written (${messageOf3(err)})`);
      }
      done = true;
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections();
        server.closeAllConnections();
      });
      resolveStopped(0);
      return 0;
    })();
    return stopping;
  };
  const donePromise = runSuite(state).catch((err) => {
    log(`suite: threw ${messageOf3(err)}`);
    return finishSuite(state, startedAt);
  }).then((outcome) => {
    done = true;
    if (outcome.deadlineFallen && stopping === null) {
      log(`the internal deadline fell: exported; exiting ${options.exitGraceMs ?? DEADLINE_EXIT_GRACE_MS} ms after /done`);
      exitTimer = setTimeout(() => {
        void stop("the internal deadline");
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
    stopped
  };
}
async function runEnv(options = {}) {
  const env = options.env ?? process.env;
  const stateDir = options.stateDir ?? stateDirOf(env);
  const log = options.log ?? realLog;
  let handle = null;
  const onSignal = (signal) => {
    if (handle !== null) {
      void handle.stop(signal);
      return;
    }
    log(`stopping: ${signal} before the listener was ready`);
    try {
      writeBootFailure(stateDir, suiteChecks().map((spec2) => spec2.id));
    } catch (err) {
      log(`the boot-failure export could not be written: ${messageOf3(err)}`);
    }
    process.exit(0);
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  try {
    handle = await startEnv({ ...options, env, stateDir, log });
    return await handle.stopped;
  } finally {
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("SIGINT", onSignal);
  }
}
function writeBootFailure(stateDir, checkIds) {
  writeExportPair(stateDir, bootFailureExport(checkIds), failedPerfFile(BOOT_FAILED_NOTE));
}
async function main(env = process.env) {
  const stateDir = stateDirOf(env);
  const log = realLog;
  const checkIds = () => suiteChecks().map((spec2) => spec2.id);
  const fatal = (label, err) => {
    log(`${label}: ${messageOf3(err)}`);
    try {
      writeBootFailure(stateDir, checkIds());
    } catch (writeErr) {
      log(`the boot-failure export could not be written: ${messageOf3(writeErr)}`);
    }
  };
  process.on("uncaughtException", (err) => {
    fatal("uncaught exception", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    fatal("unhandled rejection", reason);
    process.exit(1);
  });
  try {
    return await runEnv({ env, log });
  } catch (err) {
    fatal("fatal", err);
    return 1;
  }
}

// src/server/main.ts
var code = await main();
process.exit(code);
