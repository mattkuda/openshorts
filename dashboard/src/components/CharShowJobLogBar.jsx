import React, { useState, useEffect } from 'react';
import { Terminal, Loader2, Check, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

// Parses a deck-generation job's log lines into a 0-1 completion fraction.
// "🎬 Deck 2/7…" marks deck boundaries. Slides within a deck render in parallel,
// so completion arrives as unordered "✓ Slide 3/8 rendered" lines — the slide
// fraction is (count of "✓ Slide" lines since the last Deck boundary) / M, where
// M comes from any one of those lines. Falls back to the older sequential
// "Slide N/M" format (in-progress, not necessarily completion) when no "✓ Slide"
// lines are present, so both backend versions render sensibly. Returns null when
// the logs don't carry a "Deck N/M" line at all (e.g. a pose-pack job) — callers
// should hide the bar then.
function parseProgress(logs) {
    let totalDecks = null;
    let deckIndex = 0;
    let sinceDeckLines = [];
    for (const line of logs || []) {
        const deckMatch = line.match(/Deck (\d+)\/(\d+)/);
        if (deckMatch) {
            deckIndex = Number(deckMatch[1]);
            totalDecks = Number(deckMatch[2]);
            sinceDeckLines = [];
            continue;
        }
        sinceDeckLines.push(line);
    }
    if (!totalDecks) return null;
    const decksCompleted = Math.max(0, deckIndex - 1);

    const checkedSlides = sinceDeckLines
        .map((l) => l.match(/✓\s*Slide\s*\d+\/(\d+)/))
        .filter(Boolean);

    let slideFraction = 0;
    if (checkedSlides.length > 0) {
        const slideTotal = Number(checkedSlides[0][1]);
        slideFraction = slideTotal > 0 ? Math.min(1, checkedSlides.length / slideTotal) : 0;
    } else {
        let slideNum = 0;
        let slideTotal = 0;
        for (const line of sinceDeckLines) {
            const slideMatch = line.match(/Slide (\d+)\/(\d+)/);
            if (slideMatch) {
                slideNum = Number(slideMatch[1]);
                slideTotal = Number(slideMatch[2]);
            }
        }
        slideFraction = slideTotal > 0 ? slideNum / slideTotal : 0;
    }

    return Math.min(1, (decksCompleted + slideFraction) / totalDecks);
}

// "1m 03s" / "45s" — seconds are zero-padded once a minute is shown, matching
// the "1m 03s elapsed · ~2m 10s remaining" format.
function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    const m = Math.floor(seconds / 60);
    const s = Math.max(0, Math.round(seconds % 60));
    return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

// Ticks its own "Xm Ys elapsed" once a second, independent of the ~2s poll
// cadence. `initialNow` (the job's last poll timestamp — a plain number, not an
// impure call) seeds the first render so there's no "0s" flash; every tick after
// that comes from setInterval's callback, which — unlike a direct call in the
// render body or a synchronous setState in the effect body itself — is exactly
// where the purity rules allow reading the clock and calling setState.
function ElapsedTicker({ startedAt, initialNow }) {
    const [now, setNow] = useState(initialNow || 0);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    if (!startedAt || !now) return null;
    const elapsedSec = (now - startedAt) / 1000;
    return <>{formatDuration(elapsedSec) || '0s'} elapsed</>;
}

export default function CharShowJobLogBar({ job, onDismiss, onOpenDeck }) {
    const [expanded, setExpanded] = useState(false);

    if (!job) return null;

    const fraction = job.status === 'processing' ? parseProgress(job.logs) : null;

    // ETA still updates only at poll cadence (job.lastPolledAt) — only the
    // elapsed half of the line ticks smoothly, via ElapsedTicker above.
    let etaLabel = '';
    if (fraction !== null && job.startedAt && job.lastPolledAt) {
        if (fraction <= 0.05) {
            etaLabel = 'estimating…';
        } else {
            const elapsedSec = (job.lastPolledAt - job.startedAt) / 1000;
            const etaSec = (elapsedSec / fraction) * (1 - fraction);
            const eta = formatDuration(etaSec);
            etaLabel = eta ? `~${eta} remaining` : '';
        }
    }

    const costLine = job.status === 'completed' ? (job.logs || []).find((l) => l.includes('💰')) : null;
    const openableDecks = job.status === 'completed' ? (job.result?.creations || []) : [];
    const logs = job.logs || [];
    const lastLog = logs[logs.length - 1] || '';
    const kindLabel = job.kind === 'poses' ? 'Pose pack generation' : 'Deck generation';

    return (
        <div className="bg-muted rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-muted">
                <span className="text-xs font-mono text-muted-foreground flex items-center gap-2 min-w-0">
                    <Terminal size={12} className="shrink-0" />
                    <span className="truncate">{kindLabel}{job.seriesName ? ` — ${job.seriesName}` : ''}</span>
                    {job.status === 'processing' && <Loader2 size={11} className="shrink-0 animate-spin" />}
                    {job.status === 'completed' && <Check size={11} className="shrink-0 text-green-700" />}
                </span>
                {job.status !== 'processing' && (
                    <button onClick={onDismiss} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" title="Dismiss">
                        <X size={14} />
                    </button>
                )}
            </div>

            {job.status === 'processing' && (
                <p className="px-4 pt-2.5 text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle size={11} className="shrink-0" />
                    Keep this page open — refreshing loses live progress (generation continues server-side).
                </p>
            )}

            {fraction !== null && (
                <div className="px-4 pt-2.5 space-y-1">
                    <div className="h-1.5 w-full bg-card border border-border rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary rounded-full transition-[width] duration-500 ease-out"
                            style={{ width: `${Math.round(fraction * 100)}%` }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {job.startedAt && <ElapsedTicker startedAt={job.startedAt} initialNow={job.lastPolledAt} />}
                        {etaLabel && <> · {etaLabel}</>}
                    </p>
                </div>
            )}

            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full px-4 py-2 flex items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
                <span className="font-mono truncate text-left flex-1">
                    {expanded ? `${logs.length} log line${logs.length === 1 ? '' : 's'}` : (lastLog || '—')}
                </span>
                {expanded ? <ChevronUp size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4 max-h-48 overflow-y-auto font-mono text-xs space-y-1 custom-scrollbar">
                    {logs.map((log, i) => (
                        <div key={i} className={log.toLowerCase().includes('error') ? 'text-red-600' : 'text-muted-foreground'}>
                            {log}
                        </div>
                    ))}
                    {job.status === 'processing' && <div className="animate-pulse text-primary-strong/70">_</div>}
                </div>
            )}

            {job.status === 'completed' && (costLine || openableDecks.length > 0) && (
                <div className="px-4 py-3 border-t border-border space-y-2">
                    {costLine && <p className="text-sm font-semibold text-primary-strong">{costLine}</p>}
                    {openableDecks.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {openableDecks.map((c) => (
                                <button
                                    key={c.id}
                                    onClick={() => onOpenDeck?.(c.id)}
                                    className="text-xs font-medium text-primary-strong hover:underline"
                                >
                                    Open: {c.title || 'Untitled deck'}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
