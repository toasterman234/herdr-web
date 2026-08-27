import { Activity, Brain, FolderGit2, Radio, Sparkles, TerminalSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentStatus, PaneInfo } from "./types";

type ActivityViewProps = {
  pane: PaneInfo | null;
  bridgeLabel?: string | null;
  lastStatusTransitionAt?: number | null;
};

type TimelineEntry = {
  id: string;
  at: number;
  status: AgentStatus;
  agent: string;
  title: string;
};

const MAX_TIMELINE_ENTRIES = 80;

export function ActivityView({
  pane,
  bridgeLabel,
  lastStatusTransitionAt,
}: ActivityViewProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const paneKeyRef = useRef("");
  const signatureRef = useRef("");
  const paneKey = pane ? `${pane.pane_id}:${pane.terminal_id}` : "";
  const signature = pane ? paneSignature(pane) : "";

  useEffect(() => {
    if (!pane) {
      paneKeyRef.current = "";
      signatureRef.current = "";
      setEntries([]);
      return;
    }

    const nextEntry = activityEntry(pane, normalizedEpochMs(lastStatusTransitionAt) ?? Date.now());
    if (paneKeyRef.current !== paneKey) {
      paneKeyRef.current = paneKey;
      signatureRef.current = signature;
      setEntries([nextEntry]);
      return;
    }
    if (signatureRef.current === signature) {
      return;
    }
    signatureRef.current = signature;
    setEntries((current) => [...current, nextEntry].slice(-MAX_TIMELINE_ENTRIES));
  }, [lastStatusTransitionAt, pane, paneKey, signature]);

  const currentStatusLabel = pane ? statusLabel(pane) : "No pane selected";
  const reversedEntries = useMemo(() => [...entries].reverse(), [entries]);

  if (!pane) {
    return (
      <div className="activity-stage activity-stage-empty">
        <Activity size={28} />
        <strong>Select an agent pane</strong>
        <span>Herdr activity will appear here as the pane changes.</span>
      </div>
    );
  }

  return (
    <div className="activity-stage" data-status={pane.agent_status}>
      <div className="activity-summary">
        <div className="activity-summary-icon" aria-hidden="true">
          <Radio size={20} />
        </div>
        <div className="activity-summary-copy">
          <span className="activity-eyebrow">Live Herdr activity</span>
          <strong>{pane.display_agent || pane.agent || "Agent"}</strong>
          <span>{pane.title || currentStatusLabel}</span>
        </div>
        <span className="activity-live-badge">
          <span className="status-dot" data-status={pane.agent_status} />
          {currentStatusLabel}
        </span>
      </div>

      <div className="activity-facts" aria-label="Agent context">
        <Fact icon={<Brain size={15} />} label="Agent" value={pane.display_agent || pane.agent || "Unknown"} />
        <Fact icon={<FolderGit2 size={15} />} label="Working directory" value={pane.foreground_cwd || pane.cwd || "Unknown"} mono />
        <Fact icon={<TerminalSquare size={15} />} label="Pane" value={pane.pane_id} mono />
        <Fact icon={<Sparkles size={15} />} label="Bridge" value={bridgeLabel || "Local Herdr"} />
      </div>

      <div className="activity-grid">
        <section className="activity-card activity-timeline-card" aria-label="Agent activity timeline">
          <div className="activity-card-heading">
            <div>
              <span className="activity-eyebrow">Event timeline</span>
              <strong>Status and presentation changes</strong>
            </div>
            <span className="activity-event-count">{entries.length}</span>
          </div>
          <div className="activity-timeline">
            {reversedEntries.map((entry, index) => (
              <div className="activity-event" key={entry.id} data-status={entry.status}>
                <span className="activity-event-rail" aria-hidden="true">
                  <span className="status-dot" data-status={entry.status} />
                </span>
                <div className="activity-event-copy">
                  <div className="activity-event-title">
                    <strong>{entry.title}</strong>
                    {index === 0 ? <span className="activity-now">live</span> : null}
                  </div>
                  <span>{entry.agent} · {entry.status}</span>
                </div>
                <time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time>
              </div>
            ))}
          </div>
        </section>

        <section className="activity-card activity-adapter-card" aria-label="Structured event coverage">
          <div className="activity-card-heading">
            <div>
              <span className="activity-eyebrow">Structured stream</span>
              <strong>Coverage</strong>
            </div>
          </div>
          <CoverageRow label="Agent status" state="live" />
          <CoverageRow label="Pane title / task" state="live" />
          <CoverageRow label="Tool calls & results" state="adapter" />
          <CoverageRow label="Reasoning summaries" state="adapter" />
          <CoverageRow label="Diffs / approvals / subagents" state="adapter" />
          <p className="activity-adapter-note">
            Herdr-native events are live now. Agent adapters will normalize richer CLI-specific events here without replacing the raw terminal.
          </p>
        </section>
      </div>
    </div>
  );
}

function Fact({ icon, label, value, mono = false }: { icon: ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="activity-fact">
      <span className="activity-fact-icon" aria-hidden="true">{icon}</span>
      <div>
        <span>{label}</span>
        <strong className={mono ? "mono" : undefined} title={value}>{value}</strong>
      </div>
    </div>
  );
}

function CoverageRow({ label, state }: { label: string; state: "live" | "adapter" }) {
  return (
    <div className="activity-coverage-row">
      <span>{label}</span>
      <span data-state={state}>{state === "live" ? "Live" : "Adapter next"}</span>
    </div>
  );
}

function paneSignature(pane: PaneInfo) {
  return [pane.agent_status, pane.agent, pane.display_agent, pane.title].join("|");
}

function activityEntry(pane: PaneInfo, at: number): TimelineEntry {
  return {
    id: `${pane.pane_id}:${at}:${paneSignature(pane)}`,
    at,
    status: pane.agent_status,
    agent: pane.display_agent || pane.agent || "Agent",
    title: pane.title || statusLabel(pane),
  };
}
function statusLabel(pane: PaneInfo) {
  return pane.state_labels?.[pane.agent_status] || capitalize(pane.agent_status);
}

function normalizedEpochMs(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 1_000_000_000_000 && value < 10_000_000_000_000) {
    return value;
  }
  if (value >= 1_000_000_000 && value < 10_000_000_000) {
    return value * 1_000;
  }
  return null;
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
