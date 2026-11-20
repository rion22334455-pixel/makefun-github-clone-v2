import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { deflateSync, inflateSync } from 'node:zlib';

const JSON_TYPE = 'application/json; charset=utf-8';
const API_PREFIX = '/api/v3';
const DEFAULT_BRANCH = 'main';
const MAX_BODY_BYTES = 1024 * 1024;

interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  fork: boolean;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  html_url: string;
  clone_url: string;
  branches: Map<string, string>;
  tags: Map<string, string>;
  commits: Map<string, GitCommit>;
  filesByCommit: Map<string, Map<string, StoredFile>>;
  gitObjects: Map<string, GitObject>;
  labels: Map<string, IssueLabel>;
  issues: Issue[];
  comments: Map<number, IssueComment[]>;
  nextIssueNumber: number;
  pulls: PullRequest[];
  nextPullNumber: number;
}

interface GitObject {
  type: 'blob' | 'tree' | 'commit';
  content: Buffer;
}

interface StoredFile {
  path: string;
  content: Buffer;
  sha: string;
}

interface GitCommit {
  sha: string;
  message: string;
  treeSha: string;
  parentSha: string | null;
  timestamp: number;
}

interface IssueLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: IssueLabel[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: number;
  user: { login: string };
  html_url: string;
}

interface IssueComment {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string };
}

interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  merged: boolean;
  merged_at: string | null;
  merge_commit_sha: string | null;
  head: { label: string; ref: string; sha: string; user: { login: string }; repo: Record<string, unknown> };
  base: { label: string; ref: string; sha: string; user: { login: string }; repo: Record<string, unknown> };
  user: { login: string };
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  mergeable: boolean | null;
  changedFiles: PullRequestFile[];
}

interface RequestBody {
  [key: string]: unknown;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  const text = `${JSON.stringify(body)}\n`;
  res.writeHead(status, {
    'content-type': JSON_TYPE,
    'content-length': Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

function sendApiJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  sendJson(res, status, body, {
    'x-github-request-id': randomUUID(),
    ...headers,
  });
}

function pathOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://entry').pathname;
  } catch {
    return '/';
  }
}

function errorMessage(message: string): { message: string } {
  return { message };
}

async function readJsonBody(req: IncomingMessage): Promise<RequestBody> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Request body is too large');
    }
    chunks.push(bytes);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (text === '') return {};
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SyntaxError('Request body must be a JSON object');
  }
  return value as RequestBody;
}

async function readBodyOrRespond(req: IncomingMessage, res: ServerResponse): Promise<RequestBody | null> {
  try {
    return await readJsonBody(req);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'Request body is too large';
    sendApiJson(res, tooLarge ? 413 : 400, errorMessage(tooLarge ? error.message : 'Invalid JSON body'));
    return null;
  }
}

async function readAnyJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

async function readGitBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 64 * 1024 * 1024) throw new Error('Git request body is too large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function hashGitObject(type: GitObject['type'], content: Buffer): string {
  const header = Buffer.from(`${type} ${content.length}\0`);
  return createHash('sha1').update(header).update(content).digest('hex');
}

function gitPkt(payload: Buffer | string): Buffer {
  const data = typeof payload === 'string' ? Buffer.from(payload) : payload;
  const header = Buffer.from((data.length + 4).toString(16).padStart(4, '0'), 'ascii');
  return Buffer.concat([header, data]);
}

function pktFlush(): Buffer {
  return Buffer.from('0000', 'ascii');
}

function decodeGitPackets(bytes: Buffer): { payloads: Buffer[]; rest: Buffer } {
  const payloads: Buffer[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 4).toString('ascii');
    if (!/^[0-9a-fA-F]{4}$/.test(header)) break;
    const length = Number.parseInt(header, 16);
    if (length === 0) return { payloads, rest: bytes.subarray(offset + 4) };
    if (length < 4 || offset + length > bytes.length) break;
    payloads.push(bytes.subarray(offset + 4, offset + length));
    offset += length;
  }
  return { payloads, rest: bytes.subarray(offset) };
}

function decodeGitRequestPackets(bytes: Buffer): Buffer[] {
  const payloads: Buffer[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 4).toString('ascii');
    if (!/^[0-9a-fA-F]{4}$/.test(header)) break;
    const length = Number.parseInt(header, 16);
    offset += 4;
    if (length === 0) {
      payloads.push(Buffer.alloc(0));
      continue;
    }
    if (length === 1) {
      payloads.push(Buffer.from([1]));
      continue;
    }
    if (length === 2) {
      payloads.push(Buffer.from([2]));
      continue;
    }
    if (length < 4 || offset + length - 4 > bytes.length) break;
    payloads.push(bytes.subarray(offset, offset + length - 4));
    offset += length - 4;
  }
  return payloads;
}

function packGitObjects(objects: Iterable<GitObject>): Buffer {
  const entries = [...objects];
  const header = Buffer.alloc(12);
  header.write('PACK', 0, 'ascii');
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(entries.length, 8);
  const parts: Buffer[] = [header];
  const codes: Record<GitObject['type'], number> = { commit: 1, tree: 2, blob: 3, tag: 4 };
  for (const object of entries) {
    let remaining = object.content.length;
    let first = (codes[object.type] << 4) | (remaining & 0x0f);
    remaining = Math.floor(remaining / 16);
    const headerBytes: number[] = [];
    while (remaining > 0) {
      headerBytes.push(first | 0x80);
      first = remaining & 0x7f;
      remaining = Math.floor(remaining / 128);
    }
    headerBytes.push(first);
    parts.push(Buffer.from(headerBytes), deflateSync(object.content));
  }
  const body = Buffer.concat(parts);
  return Buffer.concat([body, createHash('sha1').update(body).digest()]);
}

function unpackGitPack(pack: Buffer): Map<string, GitObject> {
  const objects = new Map<string, GitObject>();
  if (pack.length < 32 || pack.toString('ascii', 0, 4) !== 'PACK') return objects;
  const version = pack.readUInt32BE(4);
  const count = pack.readUInt32BE(8);
  if (version !== 2 && version !== 3) throw new Error(`Unsupported pack version ${version}`);
  const expected = createHash('sha1').update(pack.subarray(0, -20)).digest();
  if (!expected.equals(pack.subarray(-20))) throw new Error('Pack checksum mismatch');
  const types: Record<number, GitObject['type']> = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' };
  let offset = 12;
  for (let entry = 0; entry < count; entry += 1) {
    if (offset >= pack.length - 20) throw new Error('Truncated pack entry header');
    let byte = pack[offset++] ?? 0;
    const typeCode = (byte >> 4) & 7;
    let size = byte & 15;
    let shift = 4;
    while ((byte & 0x80) !== 0) {
      if (offset >= pack.length - 20) throw new Error('Truncated pack entry size');
      byte = pack[offset++] ?? 0;
      size |= (byte & 0x7f) << shift;
      shift += 7;
    }
    const type = types[typeCode];
    if (type === undefined) throw new Error(`Unsupported packed object type ${typeCode}`);
    const result = inflateSync(pack.subarray(offset, pack.length - 20), { info: true });
    offset += result.engine.bytesWritten;
    if (result.buffer.length !== size) throw new Error('Packed object size mismatch');
    const content = Buffer.from(result.buffer);
    objects.set(hashGitObject(type, content), { type, content });
  }
  return objects;
}

function objectTreeFiles(objects: Map<string, GitObject>, treeSha: string, prefix = '', files = new Map<string, StoredFile>()): Map<string, StoredFile> {
  const tree = objects.get(treeSha);
  if (tree === undefined || tree.type !== 'tree') return files;
  let offset = 0;
  while (offset < tree.content.length) {
    const space = tree.content.indexOf(0x20, offset);
    if (space < 0 || space + 21 > tree.content.length) break;
    const mode = tree.content.toString('ascii', offset, space);
    const nul = tree.content.indexOf(0, space + 1);
    if (nul < 0 || nul + 21 > tree.content.length) break;
    const name = tree.content.toString('utf8', space + 1, nul);
    const oid = tree.content.subarray(nul + 1, nul + 21).toString('hex');
    const path = prefix === '' ? name : `${prefix}/${name}`;
    if (mode === '40000' || mode === '040000') objectTreeFiles(objects, oid, path, files);
    else {
      const object = objects.get(oid);
      if (object?.type === 'blob') files.set(path, storedFile(path, object.content));
    }
    offset = nul + 21;
  }
  return files;
}

function storedFile(path: string, content: Buffer): StoredFile {
  return { path, content, sha: hashGitObject('blob', content) };
}

function makeRepository(id: number, owner: string, input: RequestBody): Repository {
  const name = input.name as string;
  const now = new Date().toISOString();
  const description = typeof input.description === 'string' ? input.description : null;
  const isPrivate = input.private === true;
  const branch = typeof input.default_branch === 'string' && input.default_branch !== ''
    ? input.default_branch
    : DEFAULT_BRANCH;
  const fullName = `${owner}/${name}`;

  return {
    id,
    name,
    full_name: fullName,
    owner: { login: owner },
    description,
    private: isPrivate,
    fork: false,
    default_branch: branch,
    created_at: now,
    updated_at: now,
    pushed_at: null,
    html_url: `/${fullName}`,
    clone_url: `/${fullName}.git`,
    branches: new Map(),
    tags: new Map(),
    commits: new Map(),
    filesByCommit: new Map(),
    gitObjects: new Map(),
    labels: new Map(),
    issues: [],
    comments: new Map(),
    nextIssueNumber: 1,
    pulls: [],
    nextPullNumber: 1,
  };
}

function publicRepository(repository: Repository): Omit<Repository, 'branches' | 'tags' | 'commits' | 'filesByCommit' | 'gitObjects' | 'labels' | 'issues' | 'comments' | 'nextIssueNumber' | 'pulls' | 'nextPullNumber'> {
  const {
    branches: _branches,
    tags: _tags,
    commits: _commits,
    filesByCommit: _filesByCommit,
    gitObjects: _gitObjects,
    labels: _labels,
    issues: _issues,
    comments: _comments,
    nextIssueNumber: _nextIssueNumber,
    pulls: _pulls,
    nextPullNumber: _nextPullNumber,
    ...publicFields
  } = repository;
  return publicFields;
}

function treeShaFor(repository: Repository, files: Map<string, StoredFile>, prefix = ''): string {
  const directFiles: StoredFile[] = [];
  const directories = new Map<string, string>();
  for (const [path, file] of files) {
    if (!path.startsWith(prefix)) continue;
    const remainder = path.slice(prefix.length);
    if (remainder === '') continue;
    const slash = remainder.indexOf('/');
    if (slash < 0) {
      directFiles.push(file);
    } else {
      const directory = remainder.slice(0, slash);
      directories.set(directory, `${prefix}${directory}/`);
    }
  }

  const entries: Array<{ name: string; directory: boolean; sha: string }> = [
    ...directFiles.map((file) => ({ name: file.path.slice(prefix.length), directory: false, sha: file.sha })),
    ...[...directories.entries()].map(([name, childPrefix]) => ({
      name,
      directory: true,
      sha: treeShaFor(repository, files, childPrefix),
    })),
  ];
  entries.sort((a, b) => Buffer.compare(
    Buffer.from(`${a.name}${a.directory ? '/' : ''}`),
    Buffer.from(`${b.name}${b.directory ? '/' : ''}`),
  ));

  const chunks: Buffer[] = [];
  for (const entry of entries) {
    chunks.push(Buffer.from(`${entry.directory ? '40000' : '100644'} ${entry.name}\0`));
    chunks.push(Buffer.from(entry.sha, 'hex'));
  }
  const content = Buffer.concat(chunks);
  const sha = hashGitObject('tree', content);
  repository.gitObjects.set(sha, { type: 'tree', content });
  return sha;
}

function createCommit(
  repository: Repository,
  owner: string,
  branch: string,
  files: Map<string, StoredFile>,
  message: string,
): GitCommit {
  const timestamp = Math.floor(Date.now() / 1000);
  const treeSha = treeShaFor(repository, files);
  const parentSha = repository.branches.get(branch) ?? null;
  const identity = `${owner} <${owner}@users.noreply.github.com> ${timestamp} +0000`;
  const content = Buffer.from(
    `tree ${treeSha}\n${parentSha === null ? '' : `parent ${parentSha}\n`}author ${identity}\ncommitter ${identity}\n\n${message}\n`,
  );
  const sha = hashGitObject('commit', content);
  const commit = { sha, message, treeSha, parentSha, timestamp };
  repository.gitObjects.set(sha, { type: 'commit', content });
  repository.commits.set(sha, commit);
  repository.filesByCommit.set(sha, new Map(files));
  repository.branches.set(branch, sha);
  const updatedAt = new Date(timestamp * 1000).toISOString();
  repository.pushed_at = updatedAt;
  repository.updated_at = updatedAt;
  return commit;
}

function commitHistory(repository: Repository, ref: string): GitCommit[] {
  let sha = repository.branches.get(ref) ?? (repository.commits.has(ref) ? ref : undefined);
  const history: GitCommit[] = [];
  const seen = new Set<string>();
  while (sha !== undefined && !seen.has(sha)) {
    seen.add(sha);
    const commit = repository.commits.get(sha);
    if (commit === undefined) break;
    history.push(commit);
    sha = commit.parentSha ?? undefined;
  }
  return history;
}

function branchName(ref: string): string {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

function issueJson(issue: Issue, repository: Repository): Issue {
  return {
    ...issue,
    labels: issue.labels.map((label) => repository.labels.get(label.name.toLowerCase()) ?? label),
    comments: repository.comments.get(issue.number)?.length ?? 0,
  };
}

function pullForJson(pull: PullRequest): Omit<PullRequest, 'changedFiles'> {
  const { changedFiles: _changedFiles, ...fields } = pull;
  return fields;
}

function pullFilesBetween(
  baseFiles: Map<string, StoredFile>,
  headFiles: Map<string, StoredFile>,
): PullRequestFile[] {
  const paths = new Set([...baseFiles.keys(), ...headFiles.keys()]);
  const result: PullRequestFile[] = [];
  for (const path of paths) {
    const before = baseFiles.get(path);
    const after = headFiles.get(path);
    if (before !== undefined && after !== undefined && before.content.equals(after.content)) continue;
    const beforeLines = before?.content.toString('utf8').split('\n') ?? [];
    const afterLines = after?.content.toString('utf8').split('\n') ?? [];
    const additions = after === undefined ? 0 : Math.max(1, afterLines.length - (before === undefined ? 0 : beforeLines.length));
    const deletions = before === undefined ? 0 : Math.max(1, beforeLines.length - (after === undefined ? 0 : afterLines.length));
    result.push({
      filename: path,
      status: before === undefined ? 'added' : after === undefined ? 'removed' : 'modified',
      additions,
      deletions,
      changes: additions + deletions,
    });
  }
  return result.sort((a, b) => a.filename.localeCompare(b.filename));
}

function mergeBaseSha(repository: Repository, leftSha: string, rightSha: string): string | null {
  const leftAncestors = new Set(commitHistory(repository, leftSha).map((commit) => commit.sha));
  return commitHistory(repository, rightSha).find((commit) => leftAncestors.has(commit.sha))?.sha ?? null;
}

function conflictsWithBase(repository: Repository, pull: PullRequest): boolean {
  const baseSha = repository.branches.get(pull.base.ref);
  const commonSha = mergeBaseSha(repository, pull.head.sha, baseSha ?? pull.base.sha);
  if (baseSha === undefined || commonSha === null) return true;
  const common = repository.filesByCommit.get(commonSha) ?? new Map<string, StoredFile>();
  const currentBase = repository.filesByCommit.get(baseSha) ?? new Map<string, StoredFile>();
  const head = repository.filesByCommit.get(pull.head.sha) ?? new Map<string, StoredFile>();
  for (const path of new Set([...common.keys(), ...currentBase.keys(), ...head.keys()])) {
    const ancestor = common.get(path);
    const baseFile = currentBase.get(path);
    const headFile = head.get(path);
    const baseChanged = ancestor?.sha !== baseFile?.sha;
    const headChanged = ancestor?.sha !== headFile?.sha;
    if (baseChanged && headChanged && baseFile?.sha !== headFile?.sha) return true;
  }
  return false;
}

function mergedFiles(repository: Repository, pull: PullRequest): Map<string, StoredFile> {
  const baseSha = repository.branches.get(pull.base.ref) ?? pull.base.sha;
  const commonSha = mergeBaseSha(repository, pull.head.sha, baseSha);
  const common = commonSha === null ? new Map<string, StoredFile>() : repository.filesByCommit.get(commonSha) ?? new Map<string, StoredFile>();
  const currentBase = new Map(repository.filesByCommit.get(baseSha) ?? []);
  const head = repository.filesByCommit.get(pull.head.sha) ?? new Map<string, StoredFile>();
  for (const path of new Set([...common.keys(), ...head.keys()])) {
    if (common.get(path)?.sha === head.get(path)?.sha) continue;
    const headFile = head.get(path);
    if (headFile === undefined) currentBase.delete(path);
    else currentBase.set(path, headFile);
  }
  return currentBase;
}

interface GraphQLField {
  name: string;
  alias: string;
  args: Record<string, unknown>;
  selection: GraphQLField[];
}

function graphQLTokens(source: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < source.length;) {
    const character = source[index] ?? '';
    if (/\s|,/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '#') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (source.startsWith('...', index)) {
      tokens.push('...');
      index += 3;
      continue;
    }
    if (character === '"') {
      const start = index++;
      let escaped = false;
      while (index < source.length) {
        const next = source[index++] ?? '';
        if (next === '"' && !escaped) break;
        if (next === '\\' && !escaped) escaped = true;
        else escaped = false;
      }
      tokens.push(source.slice(start, index));
      continue;
    }
    const nameOrNumber = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*|^-?(?:\d+\.?\d*|\.\d+)/)?.[0];
    if (nameOrNumber !== undefined) {
      tokens.push(nameOrNumber);
      index += nameOrNumber.length;
      continue;
    }
    tokens.push(character);
    index += 1;
  }
  return tokens;
}

function parseGraphQL(source: string): GraphQLField[] {
  const tokens = graphQLTokens(source);
  let index = 0;
  const peek = (): string => tokens[index] ?? '';
  const take = (): string => tokens[index++] ?? '';
  const skipGroup = (open: string, close: string): void => {
    if (take() !== open) throw new Error(`expected ${open}`);
    let depth = 1;
    while (depth > 0) {
      const token = take();
      if (token === '') throw new Error(`unterminated ${open}`);
      if (token === open) depth += 1;
      else if (token === close) depth -= 1;
    }
  };
  const parseValue = (): unknown => {
    const token = take();
    if (token === '$') return { variable: take() };
    if (token === '[') {
      const values: unknown[] = [];
      while (peek() !== ']' && peek() !== '') values.push(parseValue());
      if (take() !== ']') throw new Error('unterminated list value');
      return values;
    }
    if (token === '{') {
      const value: Record<string, unknown> = {};
      while (peek() !== '}' && peek() !== '') {
        const name = take();
        if (take() !== ':') throw new Error(`expected : after ${name}`);
        value[name] = parseValue();
      }
      if (take() !== '}') throw new Error('unterminated input object');
      return value;
    }
    if (token.startsWith('"')) return JSON.parse(token) as string;
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    if (/^-?\d+$/.test(token)) return Number.parseInt(token, 10);
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(token)) return Number.parseFloat(token);
    return token;
  };
  const parseSelection = (): GraphQLField[] => {
    if (take() !== '{') throw new Error('expected selection set');
    const fields: GraphQLField[] = [];
    while (peek() !== '}' && peek() !== '') {
      if (peek() === '...') {
        take();
        if (take() !== 'on') throw new Error('unsupported fragment spread');
        take();
        fields.push(...parseSelection());
        continue;
      }
      const first = take();
      if (first === '@') {
        take();
        if (peek() === '(') skipGroup('(', ')');
        continue;
      }
      let name = first;
      let alias = first;
      if (peek() === ':') {
        take();
        name = take();
      }
      const args: Record<string, unknown> = {};
      if (peek() === '(') {
        take();
        while (peek() !== ')' && peek() !== '') {
          const argName = take();
          if (take() !== ':') throw new Error(`expected : after argument ${argName}`);
          args[argName] = parseValue();
        }
        if (take() !== ')') throw new Error('unterminated field arguments');
      }
      const selection = peek() === '{' ? parseSelection() : [];
      fields.push({ name, alias, args, selection });
    }
    if (take() !== '}') throw new Error('unterminated selection set');
    return fields;
  };

  if (peek() === 'query' || peek() === 'mutation' || peek() === 'subscription') {
    take();
    if (peek() !== '{' && peek() !== '(') take();
    if (peek() === '(') skipGroup('(', ')');
  }
  return parseSelection();
}

function graphQLValue(value: unknown, variables: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((entry) => graphQLValue(entry, variables));
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  if (typeof record.variable === 'string') return variables[record.variable];
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, graphQLValue(entry, variables)]));
}

function globalId(type: string, id: number): string {
  return Buffer.from(`${type}:${id}`).toString('base64');
}

function globalIdParts(value: unknown): { type: string; id: number } | null {
  if (typeof value !== 'string') return null;
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const match = decoded.match(/^(Repository|Issue|PullRequest|Comment):(\d+)$/);
    return match === null ? null : { type: match[1] ?? '', id: Number.parseInt(match[2] ?? '', 10) };
  } catch {
    return null;
  }
}

const MCP_TOOLS = Object.freeze([
  {
    name: 'create_repo',
    description: 'Create a repository owned by the authenticated user.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, private: { type: 'boolean' } }, required: ['name'] },
  },
  {
    name: 'get_repo',
    description: 'Read a repository by owner and repository name.',
    inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' } }, required: ['owner', 'repo'] },
  },
  {
    name: 'create_issue',
    description: 'Create an issue in a repository.',
    inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['owner', 'repo', 'title'] },
  },
  {
    name: 'list_issues',
    description: 'List issues in a repository, optionally filtered by state.',
    inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string' } }, required: ['owner', 'repo'] },
  },
  {
    name: 'create_pull_request',
    description: 'Open a pull request between two branches.',
    inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' } }, required: ['owner', 'repo', 'title', 'head', 'base'] },
  },
  {
    name: 'merge_pull_request',
    description: 'Merge an open pull request.',
    inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, pull_number: { type: 'integer' } }, required: ['owner', 'repo', 'pull_number'] },
  },
]);

/** Build the server. It binds nothing until the caller listens; the entry listens on an ephemeral port. */
export function createApp(): Server {
  const token = process.env.MAKEFUN_SHOP_TOKEN ?? '';
  const login = process.env.MAKEFUN_SHOP_LOGIN ?? 'adaiversen';
  const repositories = new Map<string, Repository>();
  let nextRepositoryId = 1;
  let nextLabelId = 1;
  let nextIssueId = 1;
  let nextCommentId = 1;
  let nextPullId = 1;

  function repoKey(owner: string, name: string): string {
    return `${owner.toLowerCase()}/${name.toLowerCase()}`;
  }

  function findRepository(owner: string, name: string): Repository | undefined {
    if (owner.toLowerCase() !== login.toLowerCase()) return undefined;
    return repositories.get(repoKey(owner, name));
  }

  function makeIssue(repository: Repository, owner: string, title: string, body: string, labels: IssueLabel[] = []): Issue {
    const now = new Date().toISOString();
    const number = repository.nextIssueNumber++;
    const issue: Issue = {
      id: nextIssueId++,
      number,
      title,
      body,
      state: 'open',
      labels,
      created_at: now,
      updated_at: now,
      closed_at: null,
      comments: 0,
      user: { login },
      html_url: `/${owner}/${repository.name}/issues/${number}`,
    };
    repository.issues.push(issue);
    return issue;
  }

  function makePull(repository: Repository, owner: string, input: { title: string; body: string; head: string; base: string }): PullRequest | null {
    const headRef = input.head.includes(':') ? input.head.slice(input.head.lastIndexOf(':') + 1) : input.head;
    const baseRef = input.base.includes(':') ? input.base.slice(input.base.lastIndexOf(':') + 1) : input.base;
    const headSha = repository.branches.get(headRef);
    const baseSha = repository.branches.get(baseRef);
    if (headSha === undefined || baseSha === undefined) return null;
    const now = new Date().toISOString();
    const number = repository.nextPullNumber++;
    const baseRepo = { id: repository.id, name: repository.name, full_name: repository.full_name, private: repository.private, html_url: repository.html_url };
    const pull: PullRequest = {
      id: nextPullId++,
      number,
      title: input.title,
      body: input.body,
      state: 'open',
      merged: false,
      merged_at: null,
      merge_commit_sha: null,
      head: { label: `${owner}:${headRef}`, ref: headRef, sha: headSha, user: { login: owner }, repo: baseRepo },
      base: { label: `${owner}:${baseRef}`, ref: baseRef, sha: baseSha, user: { login: owner }, repo: baseRepo },
      user: { login },
      created_at: now,
      updated_at: now,
      closed_at: null,
      html_url: `/${owner}/${repository.name}/pull/${number}`,
      mergeable: true,
      changedFiles: pullFilesBetween(
        repository.filesByCommit.get(baseSha) ?? new Map<string, StoredFile>(),
        repository.filesByCommit.get(headSha) ?? new Map<string, StoredFile>(),
      ),
    };
    pull.mergeable = !conflictsWithBase(repository, pull);
    repository.pulls.push(pull);
    return pull;
  }

  function mergePull(repository: Repository, pull: PullRequest, owner: string): { status: number; body: Record<string, unknown> } {
    if (pull.state !== 'open') return { status: 405, body: errorMessage('Pull request is not open') };
    if (conflictsWithBase(repository, pull)) {
      pull.mergeable = false;
      return { status: 405, body: errorMessage('Pull request has merge conflicts') };
    }
    const commit = createCommit(
      repository,
      owner,
      pull.base.ref,
      mergedFiles(repository, pull),
      `Merge pull request #${pull.number} from ${pull.head.ref}\n\n${pull.title}`,
    );
    pull.state = 'closed';
    pull.merged = true;
    pull.merged_at = new Date().toISOString();
    pull.closed_at = pull.merged_at;
    pull.updated_at = pull.merged_at;
    pull.merge_commit_sha = commit.sha;
    return { status: 200, body: { sha: commit.sha, merged: true, message: 'Pull Request successfully merged' } };
  }

  async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authorization = req.headers.authorization;
    if (token === '' || authorization !== `Bearer ${token}`) {
      sendJson(res, 401, errorMessage('Requires authentication'));
      return;
    }

    let request: unknown;
    try {
      request = await readAnyJsonBody(req);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'Request body is too large';
      sendJson(res, tooLarge ? 413 : 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: tooLarge ? error.message : 'Parse error' } });
      return;
    }
    if (typeof request !== 'object' || request === null || Array.isArray(request)) {
      sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } });
      return;
    }

    const rpc = request as Record<string, unknown>;
    const id = rpc.id ?? null;
    const method = typeof rpc.method === 'string' ? rpc.method : '';
    const reply = (result: unknown): void => sendJson(res, 200, { jsonrpc: '2.0', id, result });
    const rpcError = (code: number, message: string): void => sendJson(res, 200, { jsonrpc: '2.0', id, error: { code, message } });
    if (rpc.jsonrpc !== '2.0' || method === '') {
      sendJson(res, 400, { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } });
      return;
    }

    if (method === 'server/discover') {
      reply({
        resultType: 'discovery',
        supportedVersions: ['2026-07-28'],
        capabilities: { tools: {} },
        serverInfo: { name: 'github-core-clone', version: '1.0.0' },
        _meta: { serverInfo: { name: 'github-core-clone', version: '1.0.0' } },
      });
      return;
    }
    if (method === 'tools/list') {
      reply({ tools: MCP_TOOLS });
      return;
    }
    if (method !== 'tools/call') {
      rpcError(-32601, 'Method not found');
      return;
    }
    const params = typeof rpc.params === 'object' && rpc.params !== null ? rpc.params as Record<string, unknown> : {};
    const name = typeof params.name === 'string' ? params.name.toLowerCase() : '';
    const input = typeof params.arguments === 'object' && params.arguments !== null && !Array.isArray(params.arguments)
      ? params.arguments as Record<string, unknown>
      : {};
    const tool = MCP_TOOLS.find((entry) => entry.name === name);
    if (tool === undefined) {
      rpcError(-32602, `Unknown tool: ${name}`);
      return;
    }
    const required = tool.inputSchema.required as string[];
    const missing = required.filter((key) => input[key] === undefined);
    if (missing.length > 0) {
      reply({ isError: true, content: [{ type: 'text', text: `Missing required argument: ${missing.join(', ')}` }] });
      return;
    }

    let value: unknown;
    if (name === 'create_repo') {
      const repoName = input.name as string;
      if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repoName)) {
        reply({ isError: true, content: [{ type: 'text', text: 'Repository name is invalid' }] });
        return;
      }
      const key = repoKey(login, repoName);
      if (repositories.has(key)) {
        reply({ isError: true, content: [{ type: 'text', text: 'Repository already exists' }] });
        return;
      }
      const repository = makeRepository(nextRepositoryId++, login, {
        name: repoName,
        description: typeof input.description === 'string' ? input.description : null,
        private: input.private === true,
      });
      repositories.set(key, repository);
      value = publicRepository(repository);
    } else {
      const owner = input.owner as string;
      const repository = findRepository(owner, input.repo as string);
      if (repository === undefined) {
        reply({ isError: true, content: [{ type: 'text', text: 'Not Found' }] });
        return;
      }
      if (name === 'get_repo') value = publicRepository(repository);
      else if (name === 'create_issue') value = makeIssue(repository, owner, input.title as string, typeof input.body === 'string' ? input.body : '');
      else if (name === 'list_issues') value = repository.issues.filter((issue) => {
        const state = input.state;
        return state === undefined || state === 'all' || issue.state === state;
      });
      else if (name === 'create_pull_request') {
        const pull = makePull(repository, owner, {
          title: input.title as string,
          body: typeof input.body === 'string' ? input.body : '',
          head: input.head as string,
          base: input.base as string,
        });
        if (pull === null) {
          reply({ isError: true, content: [{ type: 'text', text: 'Head or base branch not found' }] });
          return;
        }
        value = pull;
      } else {
        const pullNumber = input.pull_number as number;
        const pull = repository.pulls.find((entry) => entry.number === pullNumber);
        if (pull === undefined) {
          reply({ isError: true, content: [{ type: 'text', text: 'Pull request not found' }] });
          return;
        }
        const merged = mergePull(repository, pull, owner);
        if (merged.status !== 200) {
          reply({ isError: true, content: [{ type: 'text', text: String(merged.body.message ?? 'Pull request could not be merged') }] });
          return;
        }
        value = { ...pull, ...merged.body };
      }
    }
    const text = JSON.stringify(value);
    reply({ content: [{ type: 'text', text }], structuredContent: value, isError: false });
  }

  function executeGraphQL(query: string, variablesValue: unknown): Record<string, unknown> {
    const variables = typeof variablesValue === 'object' && variablesValue !== null && !Array.isArray(variablesValue)
      ? variablesValue as Record<string, unknown>
      : {};
    const errors: Array<{ message: string }> = [];
    let fields: GraphQLField[];
    try {
      fields = parseGraphQL(query);
    } catch (error) {
      return { data: null, errors: [{ message: error instanceof Error ? error.message : 'Invalid GraphQL document' }] };
    }

    const repositoryValue = (repository: Repository): Record<string, unknown> => ({ __kind: 'Repository', repository });
    const issueValue = (issue: Issue, repository: Repository): Record<string, unknown> => ({ __kind: 'Issue', issue, repository });
    const pullValue = (pull: PullRequest, repository: Repository): Record<string, unknown> => ({ __kind: 'PullRequest', pull, repository });
    const typeValue = (name: string): Record<string, unknown> => ({ __kind: 'Type', name });
    const fieldNames: Record<string, string[]> = {
      User: ['login', '__typename'],
      Repository: ['id', 'databaseId', 'name', 'nameWithOwner', 'owner', 'defaultBranchRef', 'viewerPermission', 'hasIssuesEnabled', 'issue', 'issues', 'pullRequests', 'pullRequest', '__typename'],
      Issue: ['id', 'number', 'title', 'state', 'body', '__typename'],
      PullRequest: ['id', 'number', 'state', 'merged', 'headRefName', 'baseRefName', 'mergeable', 'files', '__typename'],
      IssueConnection: ['nodes', 'pageInfo', '__typename'],
      PullRequestConnection: ['nodes', '__typename'],
      PullRequestFileConnection: ['nodes', '__typename'],
      PageInfo: ['hasNextPage', 'endCursor', '__typename'],
      PullRequestFile: ['path', '__typename'],
      Comment: ['id', 'body', '__typename'],
      CommentEdge: ['node', '__typename'],
      IssuePayload: ['issue', '__typename'],
      PullRequestPayload: ['pullRequest', '__typename'],
      AddCommentPayload: ['commentEdge', '__typename'],
      Type: ['name', 'fields', 'enumValues', '__typename'],
      TypeField: ['name', '__typename'],
      EnumValue: ['name', '__typename'],
      Node: ['id', 'name', 'nameWithOwner', 'number', 'title', 'state', 'body', 'headRefName', 'baseRefName', 'merged', '__typename'],
    };
    const typeFields: Record<string, string[]> = {
      Issue: ['id', 'number', 'title', 'state', 'body'],
      PullRequest: ['id', 'number', 'headRefName', 'baseRefName', 'mergeable', 'state', 'merged', 'files'],
      Repository: ['id', 'databaseId', 'name', 'nameWithOwner', 'owner', 'defaultBranchRef', 'viewerPermission', 'hasIssuesEnabled', 'issue', 'issues', 'pullRequests', 'pullRequest'],
    };

    const resolveRoot = (field: GraphQLField): unknown => {
      const args = graphQLValue(field.args, variables) as Record<string, unknown>;
      if (field.name === 'viewer') return { __kind: 'User', login };
      if (field.name === '__type') {
        const name = typeof args.name === 'string' ? args.name : '';
        return ['Issue', 'PullRequest', 'Repository', 'SearchType'].includes(name) ? typeValue(name) : null;
      }
      if (field.name === 'repository') {
        if (typeof args.owner !== 'string' || typeof args.name !== 'string') return null;
        const repository = findRepository(args.owner, args.name);
        return repository === undefined ? null : repositoryValue(repository);
      }
      if (field.name === 'node') {
        const parts = globalIdParts(args.id);
        if (parts === null) return null;
        if (parts.type === 'Repository') {
          const repository = [...repositories.values()].find((entry) => entry.id === parts.id);
          return repository === undefined ? null : repositoryValue(repository);
        }
        for (const repository of repositories.values()) {
          const issue = repository.issues.find((entry) => entry.id === parts.id);
          if (parts.type === 'Issue' && issue !== undefined) return issueValue(issue, repository);
          const pull = repository.pulls.find((entry) => entry.id === parts.id);
          if (parts.type === 'PullRequest' && pull !== undefined) return pullValue(pull, repository);
        }
        return null;
      }
      const input = typeof args.input === 'object' && args.input !== null ? args.input as Record<string, unknown> : {};
      if (field.name === 'createIssue') {
        const parts = globalIdParts(input.repositoryId);
        if (parts?.type !== 'Repository') return null;
        const repository = [...repositories.values()].find((entry) => entry.id === parts.id);
        if (repository === undefined || typeof input.title !== 'string') return null;
        return { __kind: 'IssuePayload', issue: issueValue(makeIssue(repository, repository.owner.login, input.title, typeof input.body === 'string' ? input.body : '')) };
      }
      if (field.name === 'closeIssue') {
        const parts = globalIdParts(input.issueId);
        if (parts?.type !== 'Issue') return null;
        for (const repository of repositories.values()) {
          const issue = repository.issues.find((entry) => entry.id === parts.id);
          if (issue === undefined) continue;
          issue.state = 'closed';
          issue.closed_at = new Date().toISOString();
          issue.updated_at = issue.closed_at;
          return { __kind: 'IssuePayload', issue: issueValue(issue, repository) };
        }
        return null;
      }
      if (field.name === 'createPullRequest') {
        const parts = globalIdParts(input.repositoryId);
        if (parts?.type !== 'Repository') return null;
        const repository = [...repositories.values()].find((entry) => entry.id === parts.id);
        if (repository === undefined || typeof input.title !== 'string' || typeof input.headRefName !== 'string' || typeof input.baseRefName !== 'string') return null;
        const pull = makePull(repository, repository.owner.login, {
          title: input.title,
          body: '',
          head: input.headRefName,
          base: input.baseRefName,
        });
        return pull === null ? null : { __kind: 'PullRequestPayload', pullRequest: pullValue(pull, repository) };
      }
      if (field.name === 'mergePullRequest') {
        const parts = globalIdParts(input.pullRequestId);
        if (parts?.type !== 'PullRequest') return null;
        for (const repository of repositories.values()) {
          const pull = repository.pulls.find((entry) => entry.id === parts.id);
          if (pull === undefined) continue;
          const result = mergePull(repository, pull, repository.owner.login);
          if (result.status !== 200) errors.push({ message: String(result.body.message ?? 'Pull request could not be merged') });
          return { __kind: 'PullRequestPayload', pullRequest: pullValue(pull, repository) };
        }
        return null;
      }
      if (field.name === 'addComment') {
        const parts = globalIdParts(input.subjectId);
        if (parts?.type !== 'Issue' || typeof input.body !== 'string') return null;
        for (const repository of repositories.values()) {
          const issue = repository.issues.find((entry) => entry.id === parts.id);
          if (issue === undefined) continue;
          const now = new Date().toISOString();
          const comment: IssueComment = { id: nextCommentId++, body: input.body, created_at: now, updated_at: now, user: { login } };
          const comments = repository.comments.get(issue.number) ?? [];
          comments.push(comment);
          repository.comments.set(issue.number, comments);
          issue.comments = comments.length;
          return { __kind: 'AddCommentPayload', commentEdge: { __kind: 'CommentEdge', node: { __kind: 'Comment', comment } } };
        }
        return null;
      }
      return undefined;
    };

    const resolveField = (parent: unknown, field: GraphQLField): unknown => {
      if (parent === null || typeof parent !== 'object') return undefined;
      const record = parent as Record<string, unknown>;
      const kind = typeof record.__kind === 'string' ? record.__kind : '';
      const args = graphQLValue(field.args, variables) as Record<string, unknown>;
      if (field.name === '__typename') return kind;
      if (field.name === 'login' && kind === 'User') return record.login;
      if (kind === 'IssuePayload' && field.name === 'issue') return record.issue;
      if (kind === 'PullRequestPayload' && field.name === 'pullRequest') return record.pullRequest;
      if (kind === 'AddCommentPayload' && field.name === 'commentEdge') return record.commentEdge;
      if (kind === 'Repository') {
        const repository = record.repository as Repository;
        if (field.name === 'id') return globalId('Repository', repository.id);
        if (field.name === 'databaseId') return repository.id;
        if (field.name === 'name') return repository.name;
        if (field.name === 'nameWithOwner') return repository.full_name;
        if (field.name === 'owner') return { __kind: 'User', login: repository.owner.login };
        if (field.name === 'defaultBranchRef') {
          const sha = repository.branches.get(repository.default_branch);
          return sha === undefined ? null : { __kind: 'Branch', name: repository.default_branch };
        }
        if (field.name === 'viewerPermission') return 'ADMIN';
        if (field.name === 'hasIssuesEnabled') return true;
        if (field.name === 'issue') {
          const issue = repository.issues.find((entry) => entry.number === args.number);
          return issue === undefined ? null : issueValue(issue, repository);
        }
        if (field.name === 'pullRequest') {
          const pull = repository.pulls.find((entry) => entry.number === args.number);
          return pull === undefined ? null : pullValue(pull, repository);
        }
        if (field.name === 'issues') {
          let issues = [...repository.issues];
          if (Array.isArray(args.states)) {
            const states = args.states.map((state) => String(state).toLowerCase());
            issues = issues.filter((issue) => states.includes(issue.state));
          }
          const orderBy = typeof args.orderBy === 'object' && args.orderBy !== null ? args.orderBy as Record<string, unknown> : {};
          if (orderBy.direction === 'DESC') issues.reverse();
          let offset = 0;
          if (typeof args.after === 'string') {
            try {
              const cursor = Buffer.from(args.after, 'base64').toString('utf8');
              const match = cursor.match(/^issues:(\d+)$/);
              if (match !== null) offset = Number.parseInt(match[1] ?? '0', 10);
            } catch {
              errors.push({ message: 'Invalid cursor' });
            }
          }
          const first = typeof args.first === 'number' && args.first >= 0 ? Math.floor(args.first) : issues.length;
          const nodes = issues.slice(offset, offset + first).map((issue) => issueValue(issue, repository));
          const end = offset + nodes.length;
          const connection = { __kind: 'IssueConnection', nodes, hasNextPage: end < issues.length, endCursor: nodes.length === 0 ? null : Buffer.from(`issues:${end}`).toString('base64') };
          return connection;
        }
        if (field.name === 'pullRequests') {
          const pulls = [...repository.pulls].reverse();
          const first = typeof args.first === 'number' && args.first >= 0 ? Math.floor(args.first) : pulls.length;
          return { __kind: 'PullRequestConnection', nodes: pulls.slice(0, first).map((pull) => pullValue(pull, repository)) };
        }
      }
      if (kind === 'Branch' && field.name === 'name') return record.name;
      if (kind === 'Issue') {
        const issue = record.issue as Issue;
        if (field.name === 'id') return globalId('Issue', issue.id);
        if (field.name === 'number') return issue.number;
        if (field.name === 'title') return issue.title;
        if (field.name === 'body') return issue.body;
        if (field.name === 'state') return issue.state.toUpperCase();
      }
      if (kind === 'PullRequest') {
        const pull = record.pull as PullRequest;
        if (field.name === 'id') return globalId('PullRequest', pull.id);
        if (field.name === 'number') return pull.number;
        if (field.name === 'state') return pull.merged ? 'MERGED' : pull.state.toUpperCase();
        if (field.name === 'merged') return pull.merged;
        if (field.name === 'headRefName') return pull.head.ref;
        if (field.name === 'baseRefName') return pull.base.ref;
        if (field.name === 'mergeable') return pull.mergeable === false ? 'CONFLICTING' : 'MERGEABLE';
        if (field.name === 'files') {
          const first = typeof args.first === 'number' && args.first >= 0 ? Math.floor(args.first) : pull.changedFiles.length;
          return { __kind: 'PullRequestFileConnection', nodes: pull.changedFiles.slice(0, first).map((file) => ({ __kind: 'PullRequestFile', path: file.filename })) };
        }
      }
      if (kind === 'IssueConnection' && field.name === 'nodes') return record.nodes;
      if (kind === 'IssueConnection' && field.name === 'pageInfo') return { __kind: 'PageInfo', hasNextPage: record.hasNextPage, endCursor: record.endCursor };
      if ((kind === 'PullRequestConnection' || kind === 'PullRequestFileConnection') && field.name === 'nodes') return record.nodes;
      if (kind === 'PageInfo' && (field.name === 'hasNextPage' || field.name === 'endCursor')) return record[field.name];
      if (kind === 'PullRequestFile' && field.name === 'path') return record.path;
      if (kind === 'Comment' && field.name === 'id') return globalId('Comment', (record.comment as IssueComment).id);
      if (kind === 'Comment' && field.name === 'body') return (record.comment as IssueComment).body;
      if (kind === 'CommentEdge' && field.name === 'node') return record.node;
      if (kind === 'Type') {
        const typeName = record.name as string;
        if (field.name === 'name') return typeName;
        if (field.name === 'fields') return (typeFields[typeName] ?? []).map((name) => ({ __kind: 'TypeField', name }));
        if (field.name === 'enumValues' && typeName === 'SearchType') return ['ISSUE', 'REPOSITORY', 'USER', 'DISCUSSION', 'PULL_REQUEST', 'COMMIT', 'TOPIC', 'ORGANIZATION'].map((name) => ({ __kind: 'EnumValue', name }));
      }
      if ((kind === 'TypeField' || kind === 'EnumValue') && field.name === 'name') return record.name;
      const valid = fieldNames[kind];
      if (valid !== undefined && !valid.includes(field.name)) {
        errors.push({ message: `Cannot query field "${field.name}" on type "${kind}".` });
      }
      return undefined;
    };

    const project = (parent: unknown, selections: GraphQLField[]): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const field of selections) {
        const value = parent === null ? null : (parent === undefined ? resolveRoot(field) : resolveField(parent, field));
        if (Array.isArray(value)) {
          result[field.alias] = value.map((entry) => field.selection.length === 0 ? entry : project(entry, field.selection));
        } else if (value !== null && typeof value === 'object') {
          result[field.alias] = field.selection.length === 0 ? value : project(value, field.selection);
        } else {
          result[field.alias] = value ?? null;
        }
      }
      return result;
    };

    const mutation = /^\s*mutation\b/.test(query);
    const root: Record<string, unknown> = { __kind: mutation ? 'Mutation' : 'Query' };
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      const value = mutation ? resolveRoot(field) : undefined;
      if (mutation) {
        if (value === undefined) {
          errors.push({ message: `Cannot query field "${field.name}" on type "Mutation".` });
          data[field.alias] = null;
        } else if (value !== null && typeof value === 'object') {
          data[field.alias] = project(value, field.selection);
        } else {
          data[field.alias] = value;
        }
      } else {
        const resolved = resolveRoot(field);
        if (Array.isArray(resolved)) data[field.alias] = resolved.map((entry) => field.selection.length === 0 ? entry : project(entry, field.selection));
        else if (resolved !== null && typeof resolved === 'object') data[field.alias] = project(resolved, field.selection);
        else data[field.alias] = resolved ?? null;
      }
    }
    void root;
    return errors.length === 0 ? { data } : { data, errors };
  }

  function gitRefs(repository: Repository): Array<{ name: string; oid: string }> {
    const refs: Array<{ name: string; oid: string }> = [];
    for (const [name, oid] of repository.branches) refs.push({ name: `refs/heads/${name}`, oid });
    for (const [name, oid] of repository.tags) refs.push({ name: `refs/tags/${name}`, oid });
    return refs.sort((left, right) => left.name.localeCompare(right.name));
  }

  function peelTag(repository: Repository, oid: string): string | undefined {
    const object = repository.gitObjects.get(oid);
    if (object?.type !== 'tag') return undefined;
    return object.content.toString('utf8').match(/^object ([0-9a-f]{40})$/m)?.[1];
  }

  function objectClosure(repository: Repository, roots: Iterable<string>, depth?: number, boundary?: Set<string>): Map<string, GitObject> {
    const found = new Map<string, GitObject>();
    const walkedCommits = new Map<string, number>();
    const visitTree = (oid: string): void => {
      if (found.has(oid)) return;
      const object = repository.gitObjects.get(oid);
      if (object === undefined) return;
      found.set(oid, object);
      if (object.type !== 'tree') return;
      let offset = 0;
      while (offset < object.content.length) {
        const space = object.content.indexOf(0x20, offset);
        const nul = space < 0 ? -1 : object.content.indexOf(0, space + 1);
        if (space < 0 || nul < 0 || nul + 21 > object.content.length) break;
        const mode = object.content.toString('ascii', offset, space);
        const child = object.content.subarray(nul + 1, nul + 21).toString('hex');
        if (mode === '40000' || mode === '040000') visitTree(child);
        else {
          const blob = repository.gitObjects.get(child);
          if (blob !== undefined) found.set(child, blob);
        }
        offset = nul + 21;
      }
    };
    const visit = (oid: string, remaining: number): void => {
      const object = repository.gitObjects.get(oid);
      if (object === undefined) return;
      if (object.type === 'tag') {
        if (!found.has(oid)) found.set(oid, object);
        const target = object.content.toString('utf8').match(/^object ([0-9a-f]{40})$/m)?.[1];
        if (target !== undefined) visit(target, remaining);
        return;
      }
      if (object.type !== 'commit') {
        visitTree(oid);
        return;
      }
      const seenDepth = walkedCommits.get(oid);
      if (seenDepth !== undefined && seenDepth >= remaining) return;
      walkedCommits.set(oid, remaining);
      found.set(oid, object);
      const text = object.content.toString('utf8');
      const treeSha = text.match(/^tree ([0-9a-f]{40})$/m)?.[1];
      if (treeSha !== undefined) visitTree(treeSha);
      const parent = text.match(/^parent ([0-9a-f]{40})$/m)?.[1];
      if (parent !== undefined && (depth === undefined || remaining > 1)) visit(parent, depth === undefined ? Number.POSITIVE_INFINITY : remaining - 1);
      else if (parent !== undefined) boundary?.add(oid);
    };
    for (const root of roots) visit(root, depth ?? Number.POSITIVE_INFINITY);
    return found;
  }

  function gitPackFor(repository: Repository, wants: string[], haves: string[], depth?: number, shallow: string[] = []): { pack: Buffer; shallow: string[] } {
    const boundary = new Set<string>();
    const wanted = objectClosure(repository, wants, depth, boundary);
    const held = new Map<string, GitObject>();
    for (const have of haves) {
      const closure = objectClosure(repository, [have], shallow.includes(have) ? 1 : undefined);
      for (const [oid, object] of closure) held.set(oid, object);
    }
    for (const oid of held.keys()) wanted.delete(oid);
    return { pack: packGitObjects(wanted.values()), shallow: [...boundary] };
  }

  function applyPushedObjects(repository: Repository, objects: Map<string, GitObject>): void {
    for (const [oid, object] of objects) repository.gitObjects.set(oid, object);
    for (const [oid, object] of objects) {
      if (object.type !== 'commit') continue;
      const text = object.content.toString('utf8');
      const treeSha = text.match(/^tree ([0-9a-f]{40})$/m)?.[1];
      const parentSha = text.match(/^parent ([0-9a-f]{40})$/m)?.[1] ?? null;
      if (treeSha === undefined) continue;
      const message = text.split('\n\n').slice(1).join('\n\n').replace(/\n$/, '');
      const authorLine = text.match(/^author .+ (\d+) [+-]\d{4}$/m);
      const timestamp = authorLine === null ? Math.floor(Date.now() / 1000) : Number.parseInt(authorLine[1] ?? '0', 10);
      repository.commits.set(oid, { sha: oid, message, treeSha, parentSha, timestamp });
      repository.filesByCommit.set(oid, objectTreeFiles(repository.gitObjects, treeSha));
    }
  }

  function isGitAncestor(repository: Repository, ancestor: string, descendant: string): boolean {
    let current: string | undefined = descendant;
    const visited = new Set<string>();
    while (current !== undefined && !visited.has(current)) {
      if (current === ancestor) return true;
      visited.add(current);
      current = repository.commits.get(current)?.parentSha ?? undefined;
    }
    return false;
  }

  async function handleGit(req: IncomingMessage, res: ServerResponse, requestPath: string): Promise<void> {
    if (token === '' || req.headers.authorization !== `Bearer ${token}`) {
      sendJson(res, 401, errorMessage('Requires authentication'));
      return;
    }
    const match = requestPath.match(/^\/([^/]+)\/([^/]+)\.git\/(info\/refs|git-upload-pack|git-receive-pack)$/);
    if (match === null) {
      sendJson(res, 404, errorMessage('Not Found'));
      return;
    }
    let owner: string;
    let name: string;
    try {
      owner = decodeURIComponent(match[1] ?? '');
      name = decodeURIComponent(match[2] ?? '');
    } catch {
      sendJson(res, 404, errorMessage('Not Found'));
      return;
    }
    const repository = findRepository(owner, name);
    if (repository === undefined) {
      sendJson(res, 404, errorMessage('Not Found'));
      return;
    }
    const endpoint = match[3] ?? '';
    const sendGit = (status: number, contentType: string, bytes: Buffer): void => {
      res.writeHead(status, { 'content-type': contentType, 'content-length': bytes.length, 'cache-control': 'no-cache' });
      res.end(bytes);
    };
    const advertisement = (service: 'git-upload-pack' | 'git-receive-pack', version2: boolean): Buffer => {
      if (version2) {
        return Buffer.concat([
          gitPkt('version 2\n'),
          gitPkt('agent=github-core-clone/1.0\n'),
          gitPkt('ls-refs=unborn\n'),
          gitPkt('fetch=shallow wait-for-done\n'),
          gitPkt('object-format=sha1\n'),
          pktFlush(),
        ]);
      }
      const refs = gitRefs(repository);
      const headRef = `refs/heads/${repository.default_branch}`;
      const headOid = repository.branches.get(repository.default_branch);
      const capabilities = service === 'git-upload-pack'
        ? `multi_ack_detailed side-band-64k thin-pack ofs-delta shallow deepen-since deepen-not agent=github-core-clone/1.0 object-format=sha1 symref=HEAD:${headRef}`
        : 'report-status report-status-v2 side-band-64k delete-refs ofs-delta agent=github-core-clone/1.0 object-format=sha1';
      const lines: Buffer[] = [gitPkt(`${headOid ?? '0'.repeat(40)} HEAD\u0000${capabilities}\n`)];
      if (refs.length === 0) lines.push(gitPkt(`${'0'.repeat(40)} capabilities^{}\n`));
      for (const ref of refs) {
        lines.push(gitPkt(`${ref.oid} ${ref.name}\n`));
        const peeled = peelTag(repository, ref.oid);
        if (peeled !== undefined) lines.push(gitPkt(`${peeled} ${ref.name}^{}\n`));
      }
      return Buffer.concat([gitPkt(`# service=${service}\n`), pktFlush(), ...lines, pktFlush()]);
    };

    if (endpoint === 'info/refs') {
      if (req.method !== 'GET') {
        sendJson(res, 405, errorMessage('Method Not Allowed'));
        return;
      }
      const url = new URL(req.url ?? '/', 'http://entry');
      const service = url.searchParams.get('service');
      if (service !== 'git-upload-pack' && service !== 'git-receive-pack') {
        sendGit(200, 'text/plain; charset=utf-8', Buffer.alloc(0));
        return;
      }
      const version2 = service === 'git-upload-pack' && req.headers['git-protocol'] === 'version=2';
      sendGit(200, `application/x-${service}-advertisement`, advertisement(service, version2));
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, errorMessage('Method Not Allowed'));
      return;
    }
    let body: Buffer;
    try {
      body = await readGitBody(req);
    } catch {
      sendJson(res, 413, errorMessage('Git request body is too large'));
      return;
    }
    if (endpoint === 'git-upload-pack') {
      const isV2 = req.headers['git-protocol'] === 'version=2';
      const requestPackets = decodeGitRequestPackets(body).map((payload) => payload.toString('utf8'));
      if (isV2 && requestPackets.some((packet) => packet.startsWith('command=ls-refs'))) {
        const prefixes = requestPackets.filter((packet) => packet.startsWith('ref-prefix ')).map((packet) => packet.slice(11).trim());
        const wantsPeel = requestPackets.some((packet) => packet.trim() === 'peel');
        const wantsSymrefs = requestPackets.some((packet) => packet.trim() === 'symrefs');
        const keep = (ref: string): boolean => prefixes.length === 0 || prefixes.some((prefix) => ref.startsWith(prefix));
        const lines: Buffer[] = [];
        const headRef = `refs/heads/${repository.default_branch}`;
        const headOid = repository.branches.get(repository.default_branch);
        if (keep('HEAD')) {
          if (headOid === undefined) lines.push(gitPkt(`unborn HEAD${wantsSymrefs ? ` symref-target:${headRef}` : ''}\n`));
          else lines.push(gitPkt(`${headOid} HEAD${wantsSymrefs ? ` symref-target:${headRef}` : ''}\n`));
        }
        for (const ref of gitRefs(repository)) {
          if (!keep(ref.name)) continue;
          const peeled = wantsPeel ? peelTag(repository, ref.oid) : undefined;
          lines.push(gitPkt(`${ref.oid} ${ref.name}${peeled === undefined ? '' : ` peeled:${peeled}`}\n`));
        }
        sendGit(200, 'application/x-git-upload-pack-result', Buffer.concat([...lines, pktFlush()]));
        return;
      }
      const packets = requestPackets;
      let wants: string[] = [];
      let haves: string[] = [];
      let depth: number | undefined;
      let shallow: string[] = [];
      if (isV2) {
        let inArguments = false;
        for (const packet of packets) {
          const line = packet === '\u0001' ? '\u0001' : packet.replace(/\n$/, '');
          if (line === 'command=fetch') continue;
          if (!inArguments) {
            if (line === '\u0001') inArguments = true;
            continue;
          }
          if (line.startsWith('want ')) wants.push(line.slice(5).split(' ')[0] ?? '');
          else if (line.startsWith('have ')) haves.push(line.slice(5));
          else if (line.startsWith('deepen ')) depth = Number.parseInt(line.slice(7), 10);
          else if (line.startsWith('shallow ')) shallow.push(line.slice(8));
        }
      } else {
        for (const packet of packets) {
          const line = packet.replace(/\n$/, '');
          if (line.startsWith('want ')) wants.push(line.slice(5).split(' ')[0] ?? '');
          else if (line.startsWith('have ')) haves.push(line.slice(5));
          else if (line.startsWith('deepen ')) depth = Number.parseInt(line.slice(7), 10);
          else if (line.startsWith('shallow ')) shallow.push(line.slice(8));
        }
      }
      const packed = gitPackFor(repository, wants.filter(Boolean), haves.filter(Boolean), Number.isFinite(depth) ? depth : undefined, shallow);
      const resultParts: Buffer[] = [];
      if (isV2) {
        resultParts.push(gitPkt('acknowledgments\n'), gitPkt('NAK\n'), pktFlush());
        const shallowLines: string[] = [];
        for (const oldBoundary of shallow) {
          if (packed.shallow.some((entry) => entry !== oldBoundary)) shallowLines.push(`unshallow ${oldBoundary}\n`);
        }
        for (const entry of packed.shallow) shallowLines.push(`shallow ${entry}\n`);
        if (shallowLines.length > 0) resultParts.push(gitPkt('shallow-info\n'), ...shallowLines.map(gitPkt), pktFlush());
        resultParts.push(gitPkt('packfile\n'));
        for (let offset = 0; offset < packed.pack.length; offset += 65514) {
          resultParts.push(gitPkt(Buffer.concat([Buffer.from([1]), packed.pack.subarray(offset, offset + 65514)])));
        }
        resultParts.push(pktFlush());
      } else {
        resultParts.push(gitPkt('NAK\n'));
        for (let offset = 0; offset < packed.pack.length; offset += 65514) {
          resultParts.push(gitPkt(Buffer.concat([Buffer.from([1]), packed.pack.subarray(offset, offset + 65514)])));
        }
        resultParts.push(pktFlush());
      }
      sendGit(200, 'application/x-git-upload-pack-result', Buffer.concat(resultParts));
      return;
    }

    const requestPackets = decodeGitPackets(body);
    const commands: Array<{ oldOid: string; newOid: string; ref: string }> = [];
    for (let index = 0; index < requestPackets.payloads.length; index += 1) {
      const line = (requestPackets.payloads[index] ?? Buffer.alloc(0)).toString('utf8').replace(/\n$/, '');
      if (line === '') continue;
      const firstLine = index === 0 ? line.split('\u0000')[0] ?? line : line;
      const parts = firstLine.split(' ');
      if (parts.length !== 3 || !/^[0-9a-f]{40}$/.test(parts[0] ?? '') || !/^[0-9a-f]{40}$/.test(parts[1] ?? '')) continue;
      commands.push({ oldOid: parts[0] ?? '', newOid: parts[1] ?? '', ref: parts[2] ?? '' });
    }
    let unpackOk = true;
    let unpackDetail = 'ok';
    try {
      applyPushedObjects(repository, unpackGitPack(requestPackets.rest));
    } catch (error) {
      unpackOk = false;
      unpackDetail = error instanceof Error ? error.message : 'unpack error';
    }
    const report: Buffer[] = [gitPkt(`unpack ${unpackOk ? 'ok' : 'error'}\n`)];
    for (const command of commands) {
      if (!unpackOk) {
        report.push(gitPkt(`ng ${command.ref} ${unpackDetail}\n`));
        continue;
      }
      const headMatch = command.ref.match(/^refs\/heads\/(.+)$/);
      const tagMatch = command.ref.match(/^refs\/tags\/(.+)$/);
      const refs = headMatch !== null ? repository.branches : tagMatch !== null ? repository.tags : null;
      const refName = headMatch?.[1] ?? tagMatch?.[1] ?? '';
      const current = refs?.get(refName);
      if (refs === null || refName === '' || (command.oldOid === '0'.repeat(40) ? current !== undefined : current !== command.oldOid)) {
        report.push(gitPkt(`ng ${command.ref} stale info\n`));
        continue;
      }
      if (command.newOid === '0'.repeat(40)) {
        refs.delete(refName);
        report.push(gitPkt(`ok ${command.ref}\n`));
        continue;
      }
      if (!repository.gitObjects.has(command.newOid)) {
        report.push(gitPkt(`ng ${command.ref} missing object\n`));
        continue;
      }
      if (headMatch !== null && command.oldOid !== '0'.repeat(40) && !isGitAncestor(repository, command.oldOid, command.newOid)) {
        report.push(gitPkt(`ng ${command.ref} non-fast-forward\n`));
        continue;
      }
      refs.set(refName, command.newOid);
      if (headMatch !== null && repository.branches.size === 1 && repository.default_branch === DEFAULT_BRANCH && !repository.branches.has(DEFAULT_BRANCH)) {
        repository.default_branch = refName;
      }
      const updated = new Date().toISOString();
      repository.updated_at = updated;
      repository.pushed_at = updated;
      report.push(gitPkt(`ok ${command.ref}\n`));
    }
    const reportBytes = Buffer.concat(report);
    const sidebandReport = gitPkt(Buffer.concat([Buffer.from([1]), reportBytes]));
    sendGit(200, 'application/x-git-receive-pack-result', Buffer.concat([sidebandReport, pktFlush()]));
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = pathOf(req);
    const method = req.method ?? 'GET';

    if (method === 'GET' && path === '/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'POST' && path === '/mcp') {
      await handleMcp(req, res);
      return;
    }

    if (method === 'POST' && path === '/api/graphql') {
      if (token === '' || req.headers.authorization !== `Bearer ${token}`) {
        sendJson(res, 401, errorMessage('Requires authentication'));
        return;
      }
      let payload: unknown;
      try {
        payload = await readAnyJsonBody(req);
      } catch {
        sendJson(res, 400, errorMessage('Invalid JSON body'));
        return;
      }
      const execute = (operation: unknown): Record<string, unknown> => {
        if (typeof operation !== 'object' || operation === null || Array.isArray(operation)) {
          return { data: null, errors: [{ message: 'GraphQL request must be an object' }] };
        }
        const request = operation as Record<string, unknown>;
        if (typeof request.query !== 'string') return { data: null, errors: [{ message: 'GraphQL query must be a string' }] };
        return executeGraphQL(request.query, request.variables);
      };
      if (Array.isArray(payload)) {
        sendJson(res, 200, payload.map((operation) => execute(operation)));
        return;
      }
      sendJson(res, 200, execute(payload));
      return;
    }

    if (/^\/[^/]+\/[^/]+\.git\/(?:info\/refs|git-upload-pack|git-receive-pack)$/.test(path)) {
      await handleGit(req, res, path);
      return;
    }

    if (!path.startsWith(API_PREFIX)) {
      sendJson(res, 404, errorMessage('Not Found'));
      return;
    }

    const authorization = req.headers.authorization;
    if (token === '' || authorization !== `Bearer ${token}`) {
      sendApiJson(res, 401, errorMessage('Requires authentication'));
      return;
    }

    if (method === 'GET' && (path === API_PREFIX || path === `${API_PREFIX}/`)) {
      sendApiJson(
        res,
        200,
        { current_user_url: `${API_PREFIX}/user`, rate_limit_url: `${API_PREFIX}/rate_limit` },
        { 'x-oauth-scopes': 'repo, read:org' },
      );
      return;
    }

    if (method === 'GET' && path === `${API_PREFIX}/meta`) {
      sendApiJson(res, 200, { installed_version: '1.0.0' });
      return;
    }

    if (method === 'GET' && path === `${API_PREFIX}/user`) {
      sendApiJson(res, 200, { login, name: login, type: 'User' });
      return;
    }

    if (path === `${API_PREFIX}/user/repos`) {
      if (method === 'GET') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'entry'}`);
        const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
        const requestedSize = Number.parseInt(url.searchParams.get('per_page') ?? '30', 10);
        const perPage = Math.min(100, Math.max(1, Number.isFinite(requestedSize) ? requestedSize : 30));
        const all = [...repositories.values()]
          .filter((repo) => repo.owner.login.toLowerCase() === login.toLowerCase())
          .sort((a, b) => b.id - a.id);
        const start = (page - 1) * perPage;
        const headers: Record<string, string> = {};
        if (start + perPage < all.length) {
          const nextUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'entry'}`);
          nextUrl.searchParams.set('page', String(page + 1));
          nextUrl.searchParams.set('per_page', String(perPage));
          headers.link = `<${nextUrl.toString()}>; rel="next"`;
        }
        sendApiJson(res, 200, all.slice(start, start + perPage), headers);
        return;
      }

      if (method === 'POST') {
        let body: RequestBody;
        try {
          body = await readJsonBody(req);
        } catch (error) {
          const tooLarge = error instanceof Error && error.message === 'Request body is too large';
          sendApiJson(res, tooLarge ? 413 : 400, errorMessage(tooLarge ? error.message : 'Invalid JSON body'));
          return;
        }
        if (typeof body.name !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(body.name)) {
          sendApiJson(res, 422, errorMessage('Repository name is invalid'));
          return;
        }
        const key = repoKey(login, body.name);
        if (repositories.has(key)) {
          sendApiJson(res, 422, errorMessage('Repository already exists'));
          return;
        }
        const repository = makeRepository(nextRepositoryId++, login, body);
        repositories.set(key, repository);
        sendApiJson(res, 201, publicRepository(repository));
        return;
      }
    }

    const repoMatch = path.match(/^\/api\/v3\/repos\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
    if (repoMatch !== null) {
      const owner = decodeURIComponent(repoMatch[1] ?? '');
      const name = decodeURIComponent(repoMatch[2] ?? '');
      const resource = repoMatch[3] ?? '';
      if (owner.toLowerCase() !== login.toLowerCase()) {
        sendApiJson(res, 404, errorMessage('Not Found'));
        return;
      }
      const key = repoKey(owner, name);
      const repository = repositories.get(key);
      if (repository === undefined) {
        sendApiJson(res, 404, errorMessage('Not Found'));
        return;
      }

      if (resource === '') {
        if (method === 'GET') {
          sendApiJson(res, 200, publicRepository(repository));
          return;
        }
        if (method === 'PATCH') {
          const body = await readBodyOrRespond(req, res);
          if (body === null) return;
          if (typeof body.description === 'string' || body.description === null) {
            repository.description = body.description;
            repository.updated_at = new Date().toISOString();
          }
          sendApiJson(res, 200, publicRepository(repository));
          return;
        }
        if (method === 'DELETE') {
          repositories.delete(key);
          res.writeHead(204, { 'x-github-request-id': randomUUID() });
          res.end();
          return;
        }
      }

      if (resource === 'git/refs' && method === 'POST') {
        const body = await readBodyOrRespond(req, res);
        if (body === null) return;
        if (typeof body.ref !== 'string' || typeof body.sha !== 'string' || !body.ref.startsWith('refs/heads/')) {
          sendApiJson(res, 422, errorMessage('Invalid reference'));
          return;
        }
        const ref = branchName(body.ref);
        if (ref === '' || repository.branches.has(ref) || !repository.commits.has(body.sha)) {
          sendApiJson(res, 422, errorMessage('Reference already exists or commit is unknown'));
          return;
        }
        repository.branches.set(ref, body.sha);
        sendApiJson(res, 201, {
          ref: `refs/heads/${ref}`,
          object: { type: 'commit', sha: body.sha },
        });
        return;
      }

      if (resource === 'branches' && method === 'GET') {
        const branches = [...repository.branches.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([branch, sha]) => ({ name: branch, commit: { sha } }));
        sendApiJson(res, 200, branches);
        return;
      }

      if (resource === 'commits' && method === 'GET') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'entry'}`);
        const ref = url.searchParams.get('sha') ?? repository.default_branch;
        const commits = commitHistory(repository, ref).map((commit) => ({
          sha: commit.sha,
          commit: {
            message: commit.message,
            tree: { sha: commit.treeSha },
            author: { date: new Date(commit.timestamp * 1000).toISOString() },
          },
          parents: commit.parentSha === null ? [] : [{ sha: commit.parentSha }],
        }));
        sendApiJson(res, 200, commits);
        return;
      }

      const pullsMatch = resource.match(/^pulls(?:\/(\d+)(?:\/(files|merge))?)?$/);
      if (pullsMatch !== null) {
        const pullNumber = pullsMatch[1] === undefined ? undefined : Number.parseInt(pullsMatch[1], 10);
        const pullAction = pullsMatch[2];
        if (pullNumber === undefined && method === 'POST') {
          const body = await readBodyOrRespond(req, res);
          if (body === null) return;
          if (typeof body.title !== 'string' || typeof body.head !== 'string' || typeof body.base !== 'string') {
            sendApiJson(res, 422, errorMessage('title, head, and base are required'));
            return;
          }
          const headRef = body.head.includes(':') ? body.head.slice(body.head.lastIndexOf(':') + 1) : body.head;
          const baseRef = body.base.includes(':') ? body.base.slice(body.base.lastIndexOf(':') + 1) : body.base;
          const headSha = repository.branches.get(headRef);
          const baseSha = repository.branches.get(baseRef);
          if (headSha === undefined || baseSha === undefined) {
            sendApiJson(res, 422, errorMessage('Head and base must name existing branches'));
            return;
          }
          const now = new Date().toISOString();
          const number = repository.nextPullNumber++;
          const baseRepo = { id: repository.id, name, full_name: repository.full_name, private: repository.private, html_url: repository.html_url };
          const pull: PullRequest = {
            id: nextPullId++,
            number,
            title: body.title,
            body: typeof body.body === 'string' ? body.body : '',
            state: 'open',
            merged: false,
            merged_at: null,
            merge_commit_sha: null,
            head: { label: `${owner}:${headRef}`, ref: headRef, sha: headSha, user: { login: owner }, repo: baseRepo },
            base: { label: `${owner}:${baseRef}`, ref: baseRef, sha: baseSha, user: { login: owner }, repo: baseRepo },
            user: { login },
            created_at: now,
            updated_at: now,
            closed_at: null,
            html_url: `/${owner}/${name}/pull/${number}`,
            mergeable: true,
            changedFiles: pullFilesBetween(
              repository.filesByCommit.get(baseSha) ?? new Map<string, StoredFile>(),
              repository.filesByCommit.get(headSha) ?? new Map<string, StoredFile>(),
            ),
          };
          pull.mergeable = !conflictsWithBase(repository, pull);
          repository.pulls.push(pull);
          sendApiJson(res, 201, pullForJson(pull));
          return;
        }

        if (pullNumber === undefined && method === 'GET') {
          const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'entry'}`);
          const state = url.searchParams.get('state') ?? 'open';
          const pulls = repository.pulls
            .filter((pull) => state === 'all' || (state === 'closed' ? pull.state === 'closed' : pull.state === 'open'))
            .sort((a, b) => b.number - a.number);
          sendApiJson(res, 200, pulls.map(pullForJson));
          return;
        }

        const pull = pullNumber === undefined
          ? undefined
          : repository.pulls.find((item) => item.number === pullNumber);
        if (pull === undefined) {
          sendApiJson(res, 404, errorMessage('Not Found'));
          return;
        }
        if (pullAction === 'files' && method === 'GET') {
          sendApiJson(res, 200, pull.changedFiles);
          return;
        }
        if (pullAction === 'merge' && method === 'PUT') {
          if (pull.state !== 'open') {
            sendApiJson(res, 405, errorMessage('Pull request is not open'));
            return;
          }
          if (conflictsWithBase(repository, pull)) {
            pull.mergeable = false;
            sendApiJson(res, 405, errorMessage('Pull request has merge conflicts'));
            return;
          }
          const files = mergedFiles(repository, pull);
          const commit = createCommit(repository, owner, pull.base.ref, files, `Merge pull request #${pull.number} from ${pull.head.ref}\n\n${pull.title}`);
          pull.state = 'closed';
          pull.merged = true;
          pull.merged_at = new Date().toISOString();
          pull.closed_at = pull.merged_at;
          pull.updated_at = pull.merged_at;
          pull.merge_commit_sha = commit.sha;
          sendApiJson(res, 200, { sha: commit.sha, merged: true, message: 'Pull Request successfully merged' });
          return;
        }
        if (pullAction === undefined && method === 'GET') {
          sendApiJson(res, 200, pullForJson(pull));
          return;
        }
      }

      const contentMatch = resource.match(/^contents(?:\/(.*))?$/);
      if (contentMatch !== null) {
        let filePath: string;
        try {
          filePath = decodeURIComponent(contentMatch[1] ?? '').replace(/^\/+|\/+$/g, '');
        } catch {
          sendApiJson(res, 400, errorMessage('Invalid content path'));
          return;
        }
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'entry'}`);
        const ref = url.searchParams.get('ref') ?? repository.default_branch;
        const tip = repository.branches.get(ref);
        const files = tip === undefined ? undefined : repository.filesByCommit.get(tip);

        if (method === 'GET') {
          if (files === undefined) {
            sendApiJson(res, 404, errorMessage('Not Found'));
            return;
          }
          if (filePath !== '' && files.has(filePath)) {
            const file = files.get(filePath);
            if (file === undefined) {
              sendApiJson(res, 404, errorMessage('Not Found'));
              return;
            }
            sendApiJson(res, 200, {
              type: 'file',
              encoding: 'base64',
              content: file.content.toString('base64'),
              name: filePath.slice(filePath.lastIndexOf('/') + 1),
              path: filePath,
              sha: file.sha,
              size: file.content.length,
              url: `${API_PREFIX}/repos/${owner}/${name}/contents/${filePath}`,
              html_url: `/${owner}/${name}/blob/${ref}/${filePath}`,
              git_url: `${API_PREFIX}/repos/${owner}/${name}/git/blobs/${file.sha}`,
              download_url: null,
              _links: {},
            });
            return;
          }

          const prefix = filePath === '' ? '' : `${filePath}/`;
          const children = new Map<string, { type: 'file' | 'dir'; sha: string; path: string }>();
          for (const file of files.values()) {
            if (!file.path.startsWith(prefix)) continue;
            const remainder = file.path.slice(prefix.length);
            if (remainder === '') continue;
            const slash = remainder.indexOf('/');
            if (slash < 0) {
              children.set(remainder, { type: 'file', sha: file.sha, path: file.path });
            } else {
              const childName = remainder.slice(0, slash);
              const childPath = `${prefix}${childName}`;
              children.set(childName, {
                type: 'dir',
                sha: treeShaFor(repository, files, `${childPath}/`),
                path: childPath,
              });
            }
          }
          if (children.size === 0 && filePath !== '') {
            sendApiJson(res, 404, errorMessage('Not Found'));
            return;
          }
          const entries = [...children.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([entryName, entry]) => ({
              type: entry.type,
              name: entryName,
              path: entry.path,
              sha: entry.sha,
              size: entry.type === 'file' ? files.get(entry.path)?.content.length ?? 0 : 0,
              url: `${API_PREFIX}/repos/${owner}/${name}/contents/${entry.path}`,
              _links: {},
            }));
          sendApiJson(res, 200, entries);
          return;
        }

        if (method === 'PUT') {
          const body = await readBodyOrRespond(req, res);
          if (body === null) return;
          if (filePath === '' || typeof body.content !== 'string' || typeof body.message !== 'string') {
            sendApiJson(res, 422, errorMessage('Content path, base64 content, and commit message are required'));
            return;
          }
          const targetBranch = typeof body.branch === 'string' && body.branch !== '' ? body.branch : repository.default_branch;
          const targetTip = repository.branches.get(targetBranch);
          if (targetTip === undefined && (targetBranch !== repository.default_branch || body.sha !== undefined)) {
            sendApiJson(res, 404, errorMessage('Branch not found'));
            return;
          }
          const currentFiles = targetTip === undefined
            ? new Map<string, StoredFile>()
            : new Map(repository.filesByCommit.get(targetTip) ?? []);
          const currentFile = currentFiles.get(filePath);
          if (currentFile !== undefined && body.sha !== currentFile.sha) {
            sendApiJson(res, 409, errorMessage('The file has changed since you last fetched it'));
            return;
          }
          if (currentFile === undefined && body.sha !== undefined) {
            sendApiJson(res, 409, errorMessage('The file does not exist at the supplied sha'));
            return;
          }

          const content = Buffer.from(body.content, 'base64');
          const file = storedFile(filePath, content);
          repository.gitObjects.set(file.sha, { type: 'blob', content });
          currentFiles.set(filePath, file);
          const commit = createCommit(repository, owner, targetBranch, currentFiles, body.message);
          sendApiJson(res, currentFile === undefined ? 201 : 200, {
            content: {
              name: filePath.slice(filePath.lastIndexOf('/') + 1),
              path: filePath,
              sha: file.sha,
              size: content.length,
              url: `${API_PREFIX}/repos/${owner}/${name}/contents/${filePath}`,
              html_url: `/${owner}/${name}/blob/${targetBranch}/${filePath}`,
              git_url: `${API_PREFIX}/repos/${owner}/${name}/git/blobs/${file.sha}`,
              download_url: null,
              type: 'file',
              encoding: 'base64',
            },
            commit: {
              sha: commit.sha,
              message: commit.message,
              tree: { sha: commit.treeSha },
              parents: commit.parentSha === null ? [] : [{ sha: commit.parentSha }],
            },
          });
          return;
        }

        if (method === 'DELETE') {
          const body = await readBodyOrRespond(req, res);
          if (body === null) return;
          if (filePath === '' || typeof body.message !== 'string' || typeof body.sha !== 'string' || files === undefined) {
            sendApiJson(res, 404, errorMessage('Not Found'));
            return;
          }
          const currentFile = files.get(filePath);
          if (currentFile === undefined) {
            sendApiJson(res, 404, errorMessage('Not Found'));
            return;
          }
          if (currentFile.sha !== body.sha) {
            sendApiJson(res, 409, errorMessage('The file has changed since you last fetched it'));
            return;
          }
          const targetBranch = typeof body.branch === 'string' && body.branch !== '' ? body.branch : repository.default_branch;
          const targetTip = repository.branches.get(targetBranch);
          if (targetTip === undefined) {
            sendApiJson(res, 404, errorMessage('Branch not found'));
            return;
          }
          const nextFiles = new Map(repository.filesByCommit.get(targetTip) ?? []);
          nextFiles.delete(filePath);
          const commit = createCommit(repository, owner, targetBranch, nextFiles, body.message);
          sendApiJson(res, 200, { commit: { sha: commit.sha, message: commit.message } });
          return;
        }
      }

      if (resource === 'labels' && method === 'POST') {
        const body = await readBodyOrRespond(req, res);
        if (body === null) return;
        if (typeof body.name !== 'string' || body.name.trim() === '') {
          sendApiJson(res, 422, errorMessage('Label name is required'));
          return;
        }
        const labelKey = body.name.toLowerCase();
        if (repository.labels.has(labelKey)) {
          sendApiJson(res, 422, errorMessage('Label already exists'));
          return;
        }
        const label: IssueLabel = {
          id: nextLabelId++,
          name: body.name,
          color: typeof body.color === 'string' ? body.color.replace(/^#/, '') : 'ededed',
          description: typeof body.description === 'string' ? body.description : null,
        };
        repository.labels.set(labelKey, label);
        sendApiJson(res, 201, label);
        return;
      }

      const issuePathMatch = resource.match(/^issues(?:\/(\d+)(?:\/(comments))?)?$/);
      if (issuePathMatch !== null) {
        const issueNumber = issuePathMatch[1] === undefined ? undefined : Number.parseInt(issuePathMatch[1], 10);
        const isComments = issuePathMatch[2] === 'comments';

        if (issueNumber === undefined && method === 'POST') {
          const body = await readBodyOrRespond(req, res);
          if (body === null) return;
          if (typeof body.title !== 'string' || body.title.trim() === '') {
            sendApiJson(res, 422, errorMessage('Issue title is required'));
            return;
          }
          const labelNames = Array.isArray(body.labels)
            ? body.labels.map((entry) => typeof entry === 'string' ? entry : typeof entry === 'object' && entry !== null && 'name' in entry ? String(entry.name) : '')
            : [];
          const labels: IssueLabel[] = [];
          for (const labelName of labelNames) {
            const label = repository.labels.get(labelName.toLowerCase());
            if (label === undefined) {
              sendApiJson(res, 422, errorMessage(`Label '${labelName}' does not exist`));
              return;
            }
            labels.push(label);
          }
          const now = new Date().toISOString();
          const number = repository.nextIssueNumber++;
          const issue: Issue = {
            id: nextIssueId++,
            number,
            title: body.title,
            body: typeof body.body === 'string' ? body.body : '',
            state: 'open',
            labels,
            created_at: now,
            updated_at: now,
            closed_at: null,
            comments: 0,
            user: { login },
            html_url: `/${owner}/${name}/issues/${number}`,
          };
          repository.issues.push(issue);
          sendApiJson(res, 201, issueJson(issue, repository));
          return;
        }

        if (issueNumber === undefined && method === 'GET') {
          const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'entry'}`);
          const state = url.searchParams.get('state') ?? 'open';
          const sort = url.searchParams.get('sort') ?? 'created';
          const direction = url.searchParams.get('direction') ?? 'desc';
          const perPage = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('per_page') ?? '30', 10) || 30));
          const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
          const filtered = repository.issues
            .filter((issue) => state === 'all' || issue.state === state)
            .sort((a, b) => {
              const delta = sort === 'created'
                ? Date.parse(a.created_at) - Date.parse(b.created_at) || a.number - b.number
                : a.number - b.number;
              return direction === 'asc' ? delta : -delta;
            });
          sendApiJson(res, 200, filtered.slice((page - 1) * perPage, page * perPage).map((issue) => issueJson(issue, repository)));
          return;
        }

        const issue = issueNumber === undefined
          ? undefined
          : repository.issues.find((item) => item.number === issueNumber);
        if (issue === undefined) {
          sendApiJson(res, 404, errorMessage('Not Found'));
          return;
        }

        if (isComments && method === 'POST') {
          const body = await readBodyOrRespond(req, res);
          if (body === null) return;
          if (typeof body.body !== 'string') {
            sendApiJson(res, 422, errorMessage('Comment body is required'));
            return;
          }
          const now = new Date().toISOString();
          const comments = repository.comments.get(issue.number) ?? [];
          const comment: IssueComment = {
            id: nextCommentId++,
            body: body.body,
            created_at: now,
            updated_at: now,
            user: { login },
          };
          comments.push(comment);
          repository.comments.set(issue.number, comments);
          issue.comments = comments.length;
          issue.updated_at = now;
          sendApiJson(res, 201, { ...comment, issue_url: `/${owner}/${name}/issues/${issue.number}` });
          return;
        }
        if (isComments && method === 'GET') {
          sendApiJson(res, 200, repository.comments.get(issue.number) ?? []);
          return;
        }
        if (!isComments && method === 'GET') {
          sendApiJson(res, 200, issueJson(issue, repository));
          return;
        }
        if (!isComments && method === 'PATCH') {
          const body = await readBodyOrRespond(req, res);
          if (body === null) return;
          if (body.state === 'open' || body.state === 'closed') {
            issue.state = body.state;
            issue.closed_at = body.state === 'closed' ? new Date().toISOString() : null;
          }
          if (typeof body.title === 'string') issue.title = body.title;
          if (typeof body.body === 'string') issue.body = body.body;
          issue.updated_at = new Date().toISOString();
          sendApiJson(res, 200, issueJson(issue, repository));
          return;
        }
      }
    }

    sendApiJson(res, 404, errorMessage('Not Found'));
  }

  return createServer((req, res) => {
    void handleRequest(req, res).catch((error: unknown) => {
      process.stderr.write(`[app] ${error instanceof Error ? error.message : String(error)}\n`);
      if (!res.headersSent) {
        sendApiJson(res, 500, errorMessage('Internal Server Error'));
      } else {
        res.destroy();
      }
    });
  });
}
