import { Bot, MessageSquare, Radio, Send, SquareTerminal, User } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  fetchPaneTranscript,
  loadTerminalChatTurns,
  splitTerminalChatContent,
  terminalPreviewTail,
  saveTerminalChatTurns,
  terminalChatStorageKey,
  terminalScreenDelta,
  type TerminalChatHttpUrl,
  type TerminalChatTurn,
} from "./terminalChat";
import type { PaneInfo } from "./types";

const ChatMarkdown = lazy(() => import("./ChatMarkdown"));

type Props = {
  pane: PaneInfo | null;
  bridgeId: string;
  screenText: string;
  httpUrl?: TerminalChatHttpUrl;
  onSend: (text: string) => void;
  onOpenTerminal: () => void;
};

type PendingTurn = {
  assistantId: string;
  baseline: string;
  userText: string;
  sawWorking: boolean;
};

export function ChatView({ pane, bridgeId, screenText, httpUrl, onSend, onOpenTerminal }: Props) {
  const storageKey = pane ? terminalChatStorageKey(bridgeId, pane.terminal_id) : "";
  const [turns, setTurns] = useState<TerminalChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [paneReadText, setPaneReadText] = useState<string | null>(null);
  const finalizeTimerRef = useRef<number | null>(null);
  const previousStorageKeyRef = useRef("");

  useEffect(() => {
    if (previousStorageKeyRef.current === storageKey) return;
    previousStorageKeyRef.current = storageKey;
    setTurns(storageKey ? loadTerminalChatTurns(storageKey) : []);
    setPending(null);
    setDraft("");
  }, [storageKey]);

  useEffect(() => {
    if (storageKey) saveTerminalChatTurns(storageKey, turns);
  }, [storageKey, turns]);

  useEffect(() => {
    if (!pane || !httpUrl) {
      setPaneReadText(null);
      return;
    }
    const controller = new AbortController();
    let stopped = false;
    let timer: number | null = null;
    const delay = pane.agent_status === "working" ? 260 : 900;
    const refresh = async () => {
      try {
        const text = await fetchPaneTranscript(httpUrl, pane.pane_id, controller.signal);
        if (stopped) return;
        if (text === null) {
          setPaneReadText(null);
          return;
        }
        setPaneReadText(text);
        timer = window.setTimeout(refresh, delay);
      } catch (error) {
        if (controller.signal.aborted || stopped) return;
        console.debug("pane text fallback to terminal screen", error);
        setPaneReadText(null);
      }
    };
    void refresh();
    return () => {
      stopped = true;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [httpUrl, pane?.agent_status, pane?.pane_id]);

  useEffect(() => () => {
    if (finalizeTimerRef.current !== null) window.clearTimeout(finalizeTimerRef.current);
  }, []);

  const transcriptText = paneReadText ?? screenText;
  const currentPreview = useMemo(
    () => splitTerminalChatContent(terminalPreviewTail(transcriptText)),
    [transcriptText],
  );
  const agentLabel = pane?.display_agent || pane?.agent || "Agent";
  const status = pane?.agent_status ?? "unknown";
  useEffect(() => {
    if (!pending || !pane) return;
    const nextDelta = terminalScreenDelta(pending.baseline, transcriptText, pending.userText);
    const nextContent = splitTerminalChatContent(nextDelta, pending.userText);
    const sawWorking = pending.sawWorking || pane.agent_status === "working";
    if (sawWorking !== pending.sawWorking) {
      setPending((current) => current ? { ...current, sawWorking } : current);
    }
    if (nextContent.text || nextContent.activity.length > 0) {
      setTurns((current) => current.map((turn) =>
        turn.id === pending.assistantId
          ? {
              ...turn,
              text: nextContent.text,
              activity: nextContent.activity,
              rawText: nextDelta,
              status: pane.agent_status,
              live: true,
            }
          : turn,
      ));
    }

    const canFinalize =
      (nextContent.text || nextContent.activity.length > 0) &&
      (pane.agent_status === "done" || pane.agent_status === "idle") &&
      (sawWorking || transcriptText !== pending.baseline);
    if (!canFinalize) return;
    if (finalizeTimerRef.current !== null) window.clearTimeout(finalizeTimerRef.current);
    finalizeTimerRef.current = window.setTimeout(() => finalizePending(pane.agent_status), 450);
  }, [pane, pending, transcriptText]);

  function finalizePending(finalStatus = status) {
    const currentPending = pending;
    if (!currentPending) return;
    if (finalizeTimerRef.current !== null) {
      window.clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    setTurns((current) => current.map((turn) =>
      turn.id === currentPending.assistantId
        ? { ...turn, status: finalStatus, live: false }
        : turn,
    ));
    setPending(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!pane || !text) return;
    if (pending) finalizePending(status);
    const now = Date.now();
    const userTurn: TerminalChatTurn = { id: `u:${now}`, role: "user", text, at: now };
    const assistantId = `a:${now}`;
    const assistantTurn: TerminalChatTurn = {
      id: assistantId, role: "assistant", text: "", at: now + 1, status: "working", live: true,
    };
    setTurns((current) => [...current, userTurn, assistantTurn].slice(-100));
    setPending({
      assistantId,
      baseline: transcriptText,
      userText: text,
      sawWorking: pane.agent_status === "working",
    });
    setDraft("");
    onSend(text);
  }

  if (!pane) {
    return (
      <div className="chat-stage chat-stage-empty">
        <MessageSquare size={30} />
        <strong>Select an agent pane</strong>
        <span>The pane's terminal session will be presented as chat.</span>
      </div>
    );
  }

  return (
    <div className="chat-stage" data-status={status}>
      <header className="chat-context-bar">
        <div>
          <span className="status-dot" data-status={status} />
          <strong>{agentLabel}</strong>
          <span>{pane.title || statusLabel(pane)}</span>
        </div>
        <button type="button" onClick={onOpenTerminal} title="Open raw terminal">
          <SquareTerminal size={15} />
          <span>Raw terminal</span>
        </button>
      </header>

      <div className="chat-scroll" aria-label="Terminal chat transcript">
        {turns.length === 0 ? (
          <section className="chat-imported-state">
            <div className="chat-imported-heading">
              <Radio size={16} />
              <div>
                <strong>Recent terminal preview</strong>
                <span>New messages sent here become clean chat turns.</span>
              </div>
            </div>
            {currentPreview.activity.length > 0 ? (
              <details className="chat-imported-activity">
                <summary>Activity · {currentPreview.activity.length}</summary>
                <ul>{currentPreview.activity.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}</ul>
              </details>
            ) : null}
            {currentPreview.text ? (
              <Suspense fallback={<pre>{currentPreview.text}</pre>}>
                <ChatMarkdown body={currentPreview.text} />
              </Suspense>
            ) : <p>Waiting for terminal output…</p>}
          </section>
        ) : null}

        {turns.map((turn) => (
          <ChatBubble key={turn.id} turn={turn} agentLabel={agentLabel} />
        ))}
      </div>

      <form className="chat-composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={`Message ${agentLabel}…`}
          rows={1}
          aria-label={`Message ${agentLabel}`}
        />
        <button type="submit" disabled={!draft.trim()} aria-label="Send message">
          <Send size={17} />
        </button>
        <span className="chat-composer-hint">Shift+Enter for newline · sent through Herdr PTY</span>
      </form>
    </div>
  );
}

function ChatBubble({ turn, agentLabel }: { turn: TerminalChatTurn; agentLabel: string }) {
  const isUser = turn.role === "user";
  return (
    <article className="chat-turn" data-role={turn.role} data-live={turn.live ? "true" : "false"}>
      <div className="chat-turn-avatar" aria-hidden="true">
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="chat-turn-body">
        <header>
          <strong>{isUser ? "You" : agentLabel}</strong>
          {!isUser && turn.live ? <span className="chat-live-label">live</span> : null}
          {!isUser && turn.status ? <span>{capitalize(turn.status)}</span> : null}
          <time dateTime={new Date(turn.at).toISOString()}>{formatTime(turn.at)}</time>
        </header>
        {!isUser && turn.activity?.length ? (
          <details className="chat-turn-activity" open={Boolean(turn.live)}>
            <summary>Activity · {turn.activity.length}</summary>
            <ul>{turn.activity.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}</ul>
          </details>
        ) : null}
        {turn.text ? (
          isUser ? <p className="chat-user-text">{turn.text}</p> : (
            <Suspense fallback={<pre>{turn.text}</pre>}>
              <ChatMarkdown body={turn.text} />
            </Suspense>
          )
        ) : (
          <p className="chat-working">{turn.activity?.length ? "Working…" : "Waiting for agent output…"}</p>
        )}
        {!isUser && turn.rawText ? (
          <details className="chat-turn-raw">
            <summary><SquareTerminal size={12} /> Raw terminal</summary>
            <pre>{turn.rawText}</pre>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function statusLabel(pane: PaneInfo) {
  return pane.state_labels?.[pane.agent_status] || capitalize(pane.agent_status);
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(value);
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
