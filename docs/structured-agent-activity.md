# Structured Agent Activity UI

This fork keeps Herdr as the runtime authority and adds a semantic web surface beside the raw terminal.

## Principle

The terminal is the universal fallback, not the UI data model.

Herdr continues to own PTYs, panes, tabs, workspaces, process lifecycle, focus, terminal streaming, and universal agent status. The web client renders those native signals immediately. When an agent exposes richer machine-readable events, an adapter normalizes them into a shared activity stream.

No agent is required to support the enhanced stream. Unsupported agents remain fully usable through Herdr's terminal and lifecycle state.

## Current milestone

Implemented on `feat/structured-agent-activity-ui`:

- Activity / Terminal stage switch
- Activity is the default stage view
- current agent, task/title, status, working directory, pane, and bridge context
- in-memory per-pane status/presentation timeline
- real Herdr `pane.agent_status_changed` updates
- raw terminal remains one click away
- responsive desktop/mobile activity layout
- explicit coverage indicator for native vs adapter-backed events

The current native event source is Herdr's existing `/ws/activity` stream plus `/api/agent-activity` transition timestamps.

## Why `/ws/ui-events` is not the semantic stream

`/ws/ui-events` currently broadcasts Herdr-web client coordination events such as:

- `herdr_web.selection_changed`
- `herdr_web.agent_pins_changed`
- `herdr_web.agent_activity_changed`
- `herdr_web.notes_changed`

It does not carry CLI tool calls, reasoning summaries, diffs, approvals, or subagent lifecycle. Those need agent-specific sources.

## Normalized event envelope

The next bridge capability should expose a bounded stream of normalized events. Proposed shape:

```ts
type StructuredAgentEvent = {
  version: 1;
  event_id: string;
  occurred_at: string;
  pane_id: string;
  terminal_id?: string;
  workspace_id?: string;
  tab_id?: string;
  agent?: string;
  session_id?: string;
  type:
    | "message.delta"
    | "message.completed"
    | "reasoning.summary"
    | "tool.started"
    | "tool.completed"
    | "command.started"
    | "command.completed"
    | "file.read"
    | "file.changed"
    | "diff"
    | "approval.requested"
    | "approval.resolved"
    | "subagent.started"
    | "subagent.completed"
    | "usage.updated";
  summary?: string;
  payload?: Record<string, unknown>;
};
```

The UI should depend on this envelope, not on Codex/Pi/OpenCode-specific schemas.

## Adapter boundary

```text
Pi events ---------\
Codex events -------+--> adapter registry --> normalized event bus --> /ws/semantic-activity
OpenCode / ACP ----/                                  |                       |
Herdr lifecycle --------------------------------------+                       +--> Activity UI
Herdr terminal ---------------------------------------------------------------> Terminal UI
```

Adapters are additive. They must not take ownership of processes or bypass Herdr.

## Rendering model

The Activity UI should progressively add typed cards for:

1. assistant streaming/message blocks
2. exposed reasoning summaries or thinking metadata
3. tool calls and tool results
4. shell commands and results
5. file reads/writes
6. diffs
7. approval requests with inline actions
8. subagent parent/child activity
9. context/token/usage metadata when exposed

Do not claim or reconstruct hidden chain-of-thought. Render only reasoning summaries/thinking information that an agent explicitly exposes.

## Recovery and retention

Follow the existing Herdr-web activity design:

- live WebSocket deltas for the frequent path
- bounded client timeline for immediate rendering
- snapshot/history endpoint for reconnect and recovery
- deterministic resync marker when a client lags

A later persistence layer can retain activity across bridge restarts, but persistence is not required for the first semantic adapter.

## Implementation order

### Phase 1 — native activity shell — done

Activity / Terminal switch and Herdr-native timeline.

### Phase 2 — normalized event bus

Add bridge types, adapter registry, `/ws/semantic-activity`, and a small history endpoint. Keep the initial registry empty so generic Herdr behavior remains unchanged.

### Phase 3 — first real adapter

Use the best structured source available on this machine, with Pi as the first candidate because current Herdr panes already run Pi. Avoid ANSI/terminal scraping when an agent/session event source exists.

### Phase 4 — rich cards

Render streaming messages, tool calls, commands, files, diffs, approvals, and subagent trees.

### Phase 5 — more agents

Add Codex and OpenCode/ACP adapters behind the same normalized envelope.

### Phase 6 — durable history and traces

Add search/filtering, session lineage, trace links, export, and optional persistence.

## Acceptance criteria

- every Herdr pane remains usable even with zero adapters installed
- switching to Terminal always exposes the real underlying session
- adapter failure cannot kill or control the Herdr process
- native Herdr status stays authoritative for pane lifecycle
- structured events are attributable to a pane/session and ordered
- reconnect can recover recent structured activity
- mobile view keeps attention/approval actions usable without terminal navigation

## Transcript-First Chat Layer

Chat does not require an agent-specific adapter. The browser keeps a normal Herdr terminal attachment
alive behind the Chat and Activity surfaces and asks the Ghostty renderer for its bounded plain-text
screen mirror. That gives the web client a generic PTY-to-chat source for Pi, Codex, OpenCode, shells,
and other interactive programs.

The default pane views are now:

1. **Chat** — user turns plus terminal-derived assistant turns.
2. **Activity** — Herdr lifecycle and presentation changes.
3. **Terminal** — the lossless raw terminal.

Messages sent from Chat are queued through the same terminal WebSocket as native keyboard input, then
terminated with Enter. This preserves bracketed terminal behavior and reconnect queuing without adding
a second command transport.

The transcriptizer removes obvious terminal chrome, suppresses echoed user input, diffs the visible
screen against the pre-send baseline, and persists up to 100 turns per bridge + terminal in local
storage. Herdr lifecycle state provides the generic turn boundary: `working` keeps the assistant turn
live, `blocked` surfaces the current response without pretending completion, and `idle` / `done`
finalize a changed response.

Agent adapters are therefore optional enrichment only. They can later replace heuristic transcript
sections with exact tool calls, diffs, approvals, subagent relationships, usage, or reasoning summaries,
but the basic chat experience remains available to every Herdr terminal without an adapter.

## Generic pane-text transcript source

The bridge now exposes `GET /api/pane-text?pane_id=...&lines=...` as a narrow read-only wrapper around Herdr `pane.read` with `source=recent_unwrapped`, text format, and ANSI stripping.

Chat prefers this source because it preserves terminal history while joining soft-wrapped rows before presentation. While an agent is working, the client refreshes more frequently; when settled it backs off. If an older or remote bridge does not expose the endpoint, Chat automatically falls back to the Ghostty screen mirror.

The transcriptizer then applies generic presentation rules rather than agent adapters: terminal prompts, provider/status footers, compaction markers, spinners, and decorative rules are removed; large visual-column gaps are split into logical lines; command/action lines are grouped under a collapsible Activity section; single-space continuation rows are rejoined without flattening Markdown lists or code fences.

Existing sessions are intentionally shown only as a bounded **Recent terminal preview**. The UI does not claim to reconstruct historical user/assistant turns that were never observed by the web client. Once a message is sent through Chat, the exact pre-send pane text becomes the baseline, so subsequent assistant turns can be derived much more cleanly.