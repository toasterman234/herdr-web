import type { AgentStatus } from "./types";

export type TerminalChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  status?: AgentStatus;
  live?: boolean;
};

const MAX_SCREEN_CHARACTERS = 12_000;
const DECORATIVE_LINE = /^[\s─━═_—│┌┐└┘├┤┬┴┼╭╮╰╯·•◔◑◕●⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+$/u;

export function cleanTerminalScreen(text: string, userText = "") {
  const normalizedUser = normalizeLine(userText);
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => !isDecorativeLine(line));

  const withoutEcho = normalizedUser
    ? lines.filter((line) => !isUserEcho(line, normalizedUser))
    : lines;
  return boundNewestText(collapseBlankLines(withoutEcho).join("\n").trim());
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
