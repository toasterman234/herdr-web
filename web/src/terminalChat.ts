import type { AgentStatus } from "./types";

export type TerminalChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  activity?: string[];
  rawText?: string;
  at: number;
  status?: AgentStatus;
  live?: boolean;
};

export type TerminalChatContent = {
  text: string;
  activity: string[];
};

const MAX_SCREEN_CHARACTERS = 12_000;
const DECORATIVE_LINE = /^[\s─━═_—│┌┐└┘├┤┬┴┼╭╮╰╯·•◔◑◕●⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+$/u;
const SPINNER_PREFIX = /^[\s]*[◐◓◑◒◔◕◖◗⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⟳↻]\s*/u;
const INPUT_HINT_FOOTER = /(?:ctrl\+|shift\+enter|esc to|tab to|press enter|send with)/iu;
const METRIC_FOOTER = /(?:↑[^\n]{0,40}↓|\b\d+(?:\.\d+)?%\s*\/\s*\d|\b(?:tokens?|context)\s*[:=]\s*\d)/iu;
const SHELL_PROMPT = /^(?:[~/.][^\n]{0,100})(?:\s+\([^)]{1,80}\))?\s*(?:[%$#❯›»>]\s*)?$/u;
const USER_HOST_PROMPT = /^[\w.-]+@[\w.-]+\s+.{0,120}\s[%$#❯›»>]$/u;
const PROVIDER_FOOTER = /^\([^)]*(?:litellm|provider|gateway|ollama|openai|anthropic)[^)]*\)\s+\S.{0,100}$/iu;
const ACTIVITY_PREFIX = /^(?:reading|read|searching|search|grepping|grep|running|run|executing|execute|writing|write|editing|edit|updated|updating|modified|modifying|creating|create|checking|check|inspecting|inspect|analyzing|analyse|testing|test|building|build|fetching|fetch|installing|install|opening|open|listing|list|scanning|scan|thinking|planning|calling|called|tool|bash|shell|command)\b/iu;
const SESSION_MARKER = /^(?:\[compaction\]|compacted from \d|press ctrl\+o to show|escape interrupt|pi v\d)/iu;
const COMMAND_LINE = /^[$#❯›»>]\s+\S/u;


export type TerminalChatHttpUrl = (path: string, query?: URLSearchParams) => string;

export async function fetchPaneTranscript(
  httpUrl: TerminalChatHttpUrl,
  paneId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const query = new URLSearchParams({ pane_id: paneId, lines: "500" });
  const response = await fetch(httpUrl("/api/pane-text", query), { signal });
  if (response.status === 404 || response.status === 405) return null;
  if (!response.ok) throw new Error(`pane text failed (${response.status})`);
  const body = (await response.json()) as { text?: unknown };
  return typeof body.text === "string" ? body.text : "";
}

export function cleanTerminalScreen(text: string, userText = "") {
  const normalizedUser = normalizeLine(userText);
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap(splitVisualColumns)
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => !isDecorativeLine(line))
    .filter((line) => !isTerminalChrome(line));

  const withoutEcho = normalizedUser
    ? lines.filter((line) => !isUserEcho(line, normalizedUser))
    : lines;
  return boundNewestText(
    collapseBlankLines(unwrapSingleSpaceContinuations(withoutEcho)).join("\n").trim(),
  );
}
export function splitTerminalChatContent(text: string, userText = ""): TerminalChatContent {
  const clean = cleanTerminalScreen(text, userText);
  if (!clean) return { text: "", activity: [] };
  const answer: string[] = [];
  const activity: string[] = [];
  let commandOutput = false;
  for (const line of clean.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      answer.push("");
      commandOutput = false;
      continue;
    }
    if (COMMAND_LINE.test(trimmed)) {
      activity.push(trimmed.replace(/^[$#❯›»>]\s*/u, ""));
      commandOutput = true;
      continue;
    }
    if (commandOutput || isActivityLine(trimmed)) {
      activity.push(stripSpinner(trimmed));
      continue;
    }
    answer.push(line);
  }
  return {
    text: collapseBlankLines(answer).join("\n").trim(),
    activity: dedupeAdjacent(activity).slice(-24),
  };
}

export function terminalPreviewTail(text: string, maxLines = 42) {
  const cleaned = cleanTerminalScreen(text);
  if (!cleaned) return "";
  return cleaned.split("\n").slice(-Math.max(1, maxLines)).join("\n");
}

export function terminalScreenDelta(baseline: string, current: string, userText = "") {
  const before = cleanTerminalScreen(baseline, userText).split("\n");
  const after = cleanTerminalScreen(current, userText).split("\n");
  if (after.length === 0 || (after.length === 1 && after[0] === "")) {
    return "";
  }

  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const changed = after.slice(prefix, after.length - suffix);
  const delta = collapseBlankLines(changed).join("\n").trim();
  return boundNewestText(delta || cleanTerminalScreen(current, userText));
}
export function loadTerminalChatTurns(storageKey: string): TerminalChatTurn[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredTurn).slice(-100);
  } catch {
    return [];
  }
}

export function saveTerminalChatTurns(storageKey: string, turns: TerminalChatTurn[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(turns.slice(-100)));
  } catch {
    // Persistence is best-effort; the live chat should still work without storage.
  }
}

export function terminalChatStorageKey(bridgeId: string, terminalId: string) {
  return `herdr-web:terminal-chat:v1:${bridgeId}:${terminalId}`;
}

function isStoredTurn(value: unknown): value is TerminalChatTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Partial<TerminalChatTurn>;
  return (
    typeof turn.id === "string" &&
    (turn.role === "user" || turn.role === "assistant") &&
    typeof turn.text === "string" &&
    typeof turn.at === "number"
  );
}
function isDecorativeLine(line: string) {
  const trimmed = line.trim();
  return trimmed.length > 0 && DECORATIVE_LINE.test(trimmed);
}

function isUserEcho(line: string, userText: string) {
  const normalized = normalizeLine(line)
    .replace(/^[>❯›»$#]\s*/u, "")
    .replace(/^you:\s*/iu, "");
  return normalized === userText;
}

function normalizeLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function collapseBlankLines(lines: string[]) {
  const result: string[] = [];
  for (const line of lines) {
    if (line.trim() === "" && result.at(-1)?.trim() === "") continue;
    result.push(line);
  }
  while (result[0]?.trim() === "") result.shift();
  while (result.at(-1)?.trim() === "") result.pop();
  return result;
}
function boundNewestText(value: string) {
  if (value.length <= MAX_SCREEN_CHARACTERS) return value;
  return value.slice(-MAX_SCREEN_CHARACTERS).replace(/^.*?\n/, "");
}

function isTerminalChrome(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const withoutRule = trimmed.replace(/^[─━═_—│┌┐└┘├┤┬┴┼╭╮╰╯]+/u, "").trim();
  if (SESSION_MARKER.test(withoutRule)) return true;
  if (INPUT_HINT_FOOTER.test(withoutRule)) return true;
  if (withoutRule.length <= 180 && METRIC_FOOTER.test(withoutRule)) return true;
  if (PROVIDER_FOOTER.test(withoutRule)) return true;
  if (SHELL_PROMPT.test(withoutRule) && /[~/.]/u.test(withoutRule[0] || "")) return true;
  if (USER_HOST_PROMPT.test(withoutRule)) return true;
  return false;
}

function isActivityLine(line: string) {
  const normalized = stripSpinner(line)
    .replace(/^[✓✔✗✘⚠→›»•*-]\s*/u, "")
    .replace(/^\[[^\]]{1,24}\]\s*/u, "");
  if (ACTIVITY_PREFIX.test(normalized)) return true;
  return /^(?:\S+\.(?:ts|tsx|js|jsx|py|rs|go|md|json|ya?ml|toml|sh))\s+(?:read|edited|changed|created|updated)$/iu.test(normalized);
}

function stripSpinner(line: string) {
  return line.replace(SPINNER_PREFIX, "").trim();
}

function dedupeAdjacent(lines: string[]) {
  const result: string[] = [];
  for (const line of lines) {
    if (!line || result.at(-1) === line) continue;
    result.push(line);
  }
  return result;
}

function splitVisualColumns(line: string) {
  const trimmedRight = line.replace(/\s+$/g, "").replace(/^\s{20,}/u, "");
  if (!/\S\s{20,}\S/u.test(trimmedRight)) return [trimmedRight];
  return trimmedRight
    .split(/\s{20,}/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function unwrapSingleSpaceContinuations(lines: string[]) {
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const previous = result.at(-1);
    const markdownBoundary = /^(?:[-*+>]\s|#{1,6}\s|```|~~~|\d+[.)]\s)/u.test(trimmed);
    if (/^ \S/u.test(line) && previous?.trim() && !markdownBoundary) {
      result[result.length - 1] = `${previous.trimEnd()} ${trimmed}`;
      continue;
    }
    result.push(markdownBoundary ? line.replace(/^ /u, "") : line);
  }
  return result;
}
