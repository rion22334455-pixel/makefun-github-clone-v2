// generator/draw.mjs: built by scripts/competitions/build-agent-bundle.ts from src/generator/main.ts with esbuild 0.28.2. Do not edit: rebuild it.
import { createRequire as __agentBundleCreateRequire } from 'node:module';
const require = __agentBundleCreateRequire(import.meta.url);

// src/generator/main.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// env/src/wire.ts
var BOOT_BUDGET_MS = 2e4;
var CONFORMANCE_BUDGET_MS = 24e4;
var BENCHMARK_BUDGET_MS = 24e4;
var EXPORT_BUDGET_MS = 3e4;
var PHASE_BUDGET_MS = Object.freeze({
  boot: BOOT_BUDGET_MS,
  conformance: CONFORMANCE_BUDGET_MS,
  benchmark: BENCHMARK_BUDGET_MS,
  export: EXPORT_BUDGET_MS
});
var BOOT_BACKOFF = Object.freeze({ initialMs: 100, factor: 2, maxMs: 2e3 });
var SCENARIO_SEED_HEX = "6a09e667f3bcc909";
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

// src/generator/brief.ts
var SEED_SCHEMA = "agent-fun/instance-seed/v1";
var SLUG = "github-core-clone-01";
var MAX_K = 4294967295;
var SHA256_HEX = /^[0-9a-f]{64}$/;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_K;
}
function parseSeed(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("/input/seed.json is not JSON");
  }
  if (!isRecord(raw)) throw new Error("/input/seed.json is not a JSON object");
  if (raw.schema !== SEED_SCHEMA) throw new Error(`/input/seed.json schema is ${JSON.stringify(raw.schema)}, not ${SEED_SCHEMA}`);
  if (raw.competition !== SLUG) throw new Error(`/input/seed.json names ${JSON.stringify(raw.competition)}, not ${SLUG}`);
  if (raw.purpose !== "practice" && raw.purpose !== "scored") throw new Error(`/input/seed.json purpose is ${JSON.stringify(raw.purpose)}, not practice or scored`);
  if (!isCount(raw.k)) throw new Error(`/input/seed.json k is ${JSON.stringify(raw.k)}, not an integer 0..${MAX_K}`);
  if (raw.purpose === "practice" && raw.k !== 0) throw new Error(`a practice draw is k = 0, not ${raw.k}`);
  if (raw.t !== void 0 && !isCount(raw.t)) throw new Error(`/input/seed.json t is ${JSON.stringify(raw.t)}, not an integer 0..${MAX_K}`);
  if (typeof raw.seed !== "string" || !SHA256_HEX.test(raw.seed)) throw new Error("/input/seed.json seed is not 64 lowercase hex characters");
  return Object.freeze({ purpose: raw.purpose, k: raw.k, t: raw.t === void 0 ? null : raw.t, seed: raw.seed });
}
function briefText(facts) {
  const trial = facts.t === null ? "" : `, trial ${facts.t}`;
  return `# github-core-clone-01: build a GitHub-compatible forge

You are a program running at /bot on Node 22. A hidden env runs beside you and scores the HTTP server
you start. This instance is a ${facts.purpose} draw (k=${facts.k}${trial}).

## The lifecycle

Your process must stay up for the whole trial: it is the server, not a script that finishes.

1. Start your HTTP server on an ephemeral port: listen(0), then read the port from server.address().
   Never bind 8080: the env owns it, and on the one-pod layout it is on the same loopback.
2. POST {"port": <the port>} to $MAKEFUN_ENV_URL/register. The env records the address your request
   came from plus that port and dials it from then on. The first register wins; a later one gets 409.
3. GET $MAKEFUN_ENV_URL/done until the body is {"done": true}. The env answers at once, with
   {"done": false} while the suite runs, so poll it; never hold a request open and never exit early.
4. Exit 0 once it says done. The env then writes its export and the scorer reads it.

The starter in the kit is exactly this lifecycle with two routes filled in. Keep the lifecycle; add
the routes.

## The surface that scores

- GET /healthz: 200 {"ok": true}. The env's boot check calls it twice.
- GET /api/v3/: 200, with an X-Oauth-Scopes header carrying repo and read:org, and a JSON API root.
- /api/v3/...: GitHub REST v3. Repositories, branches, commits and contents; issues, comments and
  labels; pull requests, their files and merges. Status codes, JSON bodies, pagination headers and
  auth are checked as closely as the data.
- POST /api/graphql: GitHub GraphQL v4, for the documents gh and github-mcp-server actually send.
- POST /mcp: Model Context Protocol over streamable HTTP. initialize, tools/list and tools/call, and
  the tools' effect on the REST view.
- /<owner>/<repo>.git/...: git smart HTTP. info/refs, git-upload-pack and git-receive-pack; a real
  git client speaks to it, with no git binary anywhere in your container. Implement the protocol
  yourself, on node:zlib and node:crypto if you like.
- Anything else: 404 with {"message": "Not Found"}.

Every API call arrives with an Authorization: Bearer $MAKEFUN_SHOP_TOKEN header (the same token is in
your environment); /healthz takes none. Whether a missing or a wrong token is refused is part of the
protocol checks.

## How the score is made

The trial's score is feature + agent + perf, an integer from 0 to 1000:

- feature (600): the share of the conformance checks over the seven groups above that you pass,
  scaled to 600.
- agent (200): the MCP group's checks again, the agent-native column, scaled to 200.
- perf (200): four timed workloads against the house reference's calibrated times.

The exact checks and the benchmark ship in the kit (program/), and the same suite runs at grading
time, so grade locally before you submit. Nothing is hidden.

## Limits

Node 22 only; the standard library and source you commit, with no install step and no dependencies at
run time. Your repository is mounted read-only at /bot; write only under /tmp. There is no internet
and no git binary: the env at $MAKEFUN_ENV_URL is the service you answer, and the model gateway (if
your entry calls a model) is the only other endpoint it can reach. The trial's CPU, memory and
process limits are the rules'; its wall budget is 900 seconds.

## Rules

The full rules, the scoring weights, the deadline and the prizes are on the contest page:
https://make.fun/bounty/github-core-clone-01 (its Rules section). Read them before you change the
lifecycle.
`;
}

// src/generator/main.ts
var INPUT_DIR = process.env.MAKEFUN_INPUT_DIR || "/input";
var OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || "/output";
function write(rel, text) {
  const file = join(OUTPUT_DIR, ...rel.split("/"));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
try {
  const facts = parseSeed(readFileSync(join(INPUT_DIR, "seed.json"), "utf8"));
  mkdirSync(join(OUTPUT_DIR, "input", "env"), { recursive: true });
  write("input/prompt.txt", briefText(facts));
  write(
    "reference/scenario.json",
    `${JSON.stringify(
      {
        schema: "github-core-clone-01/scenario/v1",
        competition: "github-core-clone-01",
        scenario_seed: SCENARIO_SEED_HEX,
        purpose: facts.purpose,
        k: facts.k,
        t: facts.t,
        seed: facts.seed
      },
      null,
      2
    )}
`
  );
  const trial = facts.t === null ? "" : `, trial ${facts.t}`;
  process.stdout.write(`drew a ${facts.purpose} instance (k=${facts.k}${trial}) on scenario ${SCENARIO_SEED_HEX}
`);
} catch (err) {
  process.stderr.write(`${err.message}
`);
  process.exitCode = 1;
}
