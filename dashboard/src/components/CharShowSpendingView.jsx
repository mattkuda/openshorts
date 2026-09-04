import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getApiUrl } from '../config';

const DAY_OPTIONS = [7, 30, 90];

// ---- formatting helpers (duplicated locally per this codebase's convention — see
// CharShowTab/CharShowDeckModal's own formatTimestamp for the same pattern) ---------

function formatUsd(v) {
    return `$${(v || 0).toFixed(2)}`;
}

// Compact tick label: whole dollars drop the decimals ("$50"), fractional keep 2 ("$0.50").
function formatUsdTick(v) {
    return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

// "YYYY-MM-DD" (day-only, from by_day) -> local "M/D", avoiding UTC-midnight shift.
function formatShortDay(value) {
    if (!value) return '';
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

// Full ISO timestamp (recent[].created_at, UTC-offset from the backend) -> local "M/D h:MM AM/PM".
function formatTimestamp(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const dateStr = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
}

function formatDuration(seconds) {
    const s = Math.max(0, Math.round(seconds || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

// Raw provider key ("gemini"/"openai") -> the same human labels used on deck badges
// elsewhere (CharShowTab/CharShowDeckModal's modelBadgeLabel) — duplicated here since
// this view works off the spend endpoint's raw provider strings, not deck slots.
function providerLabel(key) {
    if (!key) return null;
    if (key === 'openai') return 'GPT Image 2';
    if (key === 'gemini') return 'Gemini Pro';
    return key.charAt(0).toUpperCase() + key.slice(1);
}

const KIND_LABELS = { deck: 'Deck', regen: 'Regen', poses: 'Poses' };
function kindLabel(kind) {
    if (!kind) return 'Unknown';
    return KIND_LABELS[kind] || (kind.charAt(0).toUpperCase() + kind.slice(1));
}

// "Nice" axis ticks (D3-style): rounds the step to 1/2/5/10 * 10^n so gridlines land on
// clean numbers, and grows the ceiling so the tallest bar never exceeds the top tick.
function niceTicks(maxVal, count = 5) {
    if (!maxVal || maxVal <= 0) return { ticks: [0, 1], max: 1 };
    const rawStep = maxVal / Math.max(1, count - 1);
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const residual = rawStep / magnitude;
    let niceResidual;
    if (residual > 5) niceResidual = 10;
    else if (residual > 2) niceResidual = 5;
    else if (residual > 1) niceResidual = 2;
    else niceResidual = 1;
    const step = niceResidual * magnitude;
    const niceMax = Math.ceil(maxVal / step) * step;
    const ticks = [];
    for (let v = 0; v <= niceMax + step * 1e-6 && ticks.length < 8; v += step) {
        ticks.push(Math.round(v * 100) / 100);
    }
    return { ticks, max: niceMax || step };
}

// Rounded-top vertical bar (column) — flat/square at the baseline, per marks-and-anatomy's
// "4px rounded data-end, square at the baseline".
function roundedTopBarPath(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h));
    if (rr <= 0.01 || h <= 0.01) return `M ${x} ${y + h} L ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} Z`;
    return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`;
}

// Rounded-right horizontal bar — flat/square at the baseline (left, x=0), rounded at the
// data-end (right tip).
function roundedRightBarPath(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    if (rr <= 0.01 || w <= 0.01) return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
    return `M ${x} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h - rr} Q ${x + w} ${y + h} ${x + w - rr} ${y + h} L ${x} ${y + h} Z`;
}

// Measures a DOM node's rendered width and keeps it in sync via ResizeObserver — used to
// get pixel-accurate bar/gridline geometry instead of leaning on SVG viewBox scaling
// (which would distort the fixed-radius rounded corners at different container widths).
function useElementWidth() {
    const ref = useRef(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect?.width;
            if (w) setWidth(w);
        });
        ro.observe(el);
        setWidth(el.getBoundingClientRect().width);
        return () => ro.disconnect();
    }, []);
    return [ref, width];
}

function StatTile({ label, value, sub }) {
    return (
        <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
    );
}

function TimeRangeControl({ days, onChange }) {
    return (
        <div className="inline-flex items-center gap-1.5">
            {DAY_OPTIONS.map((d) => (
                <button
                    key={d}
                    onClick={() => onChange(d)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        days === d
                            ? 'border-primary bg-primary/10 text-primary-strong'
                            : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                >
                    {d} days
                </button>
            ))}
        </div>
    );
}

// Single-series vertical bar chart — one bar per day, brand-green fill, hairline
// gridlines/axis in border/muted tokens, a hover tooltip per bar with a hit target
// wider than the bar itself (per dataviz interaction rules).
function DailySpendChart({ byDay }) {
    const [wrapRef, width] = useElementWidth();
    const [hoverIdx, setHoverIdx] = useState(null);
    const height = 240; // stays >= 220px per spec, with room left for x-axis labels
    const marginLeft = 46;
    const marginRight = 8;
    const marginTop = 14;
    const marginBottom = 34;
    const plotW = Math.max(0, width - marginLeft - marginRight);
    const plotH = height - marginTop - marginBottom;
    const n = byDay.length;
    const maxUsd = Math.max(0, ...byDay.map((d) => d.usd || 0));
    const { ticks, max: yMax } = niceTicks(maxUsd, 5);
    const slotW = n > 0 ? plotW / n : 0;
    const barW = Math.max(1, Math.min(24, slotW - 2));
    const yFor = (v) => marginTop + plotH - (yMax > 0 ? (v / yMax) * plotH : 0);
    const labelEvery = 5; // x-axis labels for ~every 5th day, per spec
    const hovered = hoverIdx !== null ? byDay[hoverIdx] : null;
    const hoveredCenter = hoverIdx !== null ? marginLeft + hoverIdx * slotW + slotW / 2 : 0;

    return (
        <div ref={wrapRef} className="relative" style={{ height }}>
            {width > 0 && n > 0 && (
                <svg width={width} height={height} className="overflow-visible">
                    {ticks.map((t) => (
                        <g key={t}>
                            <line x1={marginLeft} x2={marginLeft + plotW} y1={yFor(t)} y2={yFor(t)} className="stroke-border" strokeWidth={1} />
                            <text x={marginLeft - 8} y={yFor(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                                {formatUsdTick(t)}
                            </text>
                        </g>
                    ))}

                    {byDay.map((d, i) => {
                        const x = marginLeft + i * slotW + (slotW - barW) / 2;
                        const h = yMax > 0 ? (d.usd / yMax) * plotH : 0;
                        const y = marginTop + plotH - h;
                        const r = Math.min(4, barW / 2, h);
                        return (
                            <g key={d.day}>
                                {h > 0.5 && (
                                    <path
                                        d={roundedTopBarPath(x, y, barW, h, r)}
                                        className="fill-primary"
                                        style={{ opacity: hoverIdx === null || hoverIdx === i ? 1 : 0.55 }}
                                    />
                                )}
                                {/* Hit target — the full column slot, taller/wider than the bar itself. */}
                                <rect
                                    x={marginLeft + i * slotW}
                                    y={marginTop}
                                    width={slotW}
                                    height={plotH}
                                    fill="transparent"
                                    tabIndex={0}
                                    style={{ cursor: 'pointer', outline: 'none' }}
                                    onMouseEnter={() => setHoverIdx(i)}
                                    onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                                    onFocus={() => setHoverIdx(i)}
                                    onBlur={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                                />
                                {i % labelEvery === 0 && (
                                    <text
                                        x={marginLeft + i * slotW + slotW / 2}
                                        y={height - 10}
                                        textAnchor="middle"
                                        className="fill-muted-foreground"
                                        style={{ fontSize: 10 }}
                                    >
                                        {formatShortDay(d.day)}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    <line x1={marginLeft} x2={marginLeft + plotW} y1={marginTop + plotH} y2={marginTop + plotH} className="stroke-border" strokeWidth={1} />
                </svg>
            )}

            {hovered && (
                <div
                    className="absolute z-10 pointer-events-none bg-card border border-border rounded-lg shadow-md px-2.5 py-1.5 whitespace-nowrap"
                    style={{
                        left: Math.min(Math.max(hoveredCenter, 64), Math.max(width - 64, 64)),
                        top: 6,
                        transform: 'translateX(-50%)',
                    }}
                >
                    <p className="text-xs font-semibold text-foreground">{formatShortDay(hovered.day)}</p>
                    <p className="text-xs text-foreground">{formatUsd(hovered.usd)}</p>
                    <p className="text-[11px] text-muted-foreground">{hovered.image_calls || 0} img · {hovered.text_calls || 0} txt</p>
                </div>
            )}
        </div>
    );
}

// Horizontal magnitude bars — sorted desc, single hue, value label riding the bar's tip
// (in a text token color, never the bar's own color). `usableFrac` caps how much of the
// track the longest bar may fill, reserving room so its tip label never overflows.
function HorizontalBarChart({ rows, barHeight = 16, emptyLabel = 'No spend yet' }) {
    const [trackRef, trackWidth] = useElementWidth();
    const sorted = [...rows].filter((r) => r.name).sort((a, b) => (b.usd || 0) - (a.usd || 0));
    if (sorted.length === 0) {
        return <p className="text-xs text-muted-foreground py-2">{emptyLabel}</p>;
    }
    const maxVal = Math.max(0.01, ...sorted.map((r) => r.usd || 0));
    const usableWidth = trackWidth * 0.78;

    return (
        <div className="space-y-2.5">
            {sorted.map((r, i) => {
                const pct = (r.usd || 0) / maxVal;
                const w = Math.max(1, Math.round(usableWidth * pct));
                const barR = Math.min(4, barHeight / 2, w / 2);
                return (
                    <div key={r.name} className="flex items-center gap-2.5">
                        <span className="w-24 shrink-0 text-xs text-muted-foreground text-right truncate" title={r.name}>
                            {r.name}
                        </span>
                        <div
                            ref={i === 0 ? trackRef : undefined}
                            className="relative flex-1"
                            style={{ height: barHeight }}
                        >
                            {trackWidth > 0 && (
                                <>
                                    <svg width={trackWidth} height={barHeight} className="overflow-visible block">
                                        <path d={roundedRightBarPath(0, 0, w, barHeight, barR)} className="fill-primary" />
                                    </svg>
                                    <span
                                        className="absolute top-1/2 text-xs font-medium text-foreground whitespace-nowrap"
                                        style={{ left: w + 6, transform: 'translateY(-50%)' }}
                                    >
                                        {formatUsd(r.usd)}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function KindPill({ kind }) {
    return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border whitespace-nowrap">
            {kindLabel(kind)}
        </span>
    );
}

function ModelBadge({ imageModel }) {
    const label = providerLabel(imageModel);
    if (!label) return <span className="text-xs text-muted-foreground">—</span>;
    return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border whitespace-nowrap">
            {label}
        </span>
    );
}

function RecentEventsTable({ recent, onOpenDeck }) {
    if (recent.length === 0) {
        return (
            <p className="text-sm text-muted-foreground bg-muted border border-border rounded-xl p-6 text-center">
                No events in this window.
            </p>
        );
    }
    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted">
                            <th className="text-left px-4 py-2 whitespace-nowrap">Date</th>
                            <th className="text-left px-4 py-2 whitespace-nowrap">Kind</th>
                            <th className="text-left px-4 py-2 whitespace-nowrap">Series</th>
                            <th className="text-left px-4 py-2 whitespace-nowrap">Deck</th>
                            <th className="text-left px-4 py-2 whitespace-nowrap">Model</th>
                            <th className="text-right px-4 py-2 whitespace-nowrap">Calls</th>
                            <th className="text-right px-4 py-2 whitespace-nowrap">Cost</th>
                            <th className="text-right px-4 py-2 whitespace-nowrap">Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recent.map((r, i) => (
                            <tr key={`${r.creation_id || 'x'}-${i}`} className="border-t border-border hover:bg-muted transition-colors">
                                <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{formatTimestamp(r.created_at)}</td>
                                <td className="px-4 py-2"><KindPill kind={r.kind} /></td>
                                <td className="px-4 py-2 text-foreground max-w-[9rem] truncate" title={r.series_name || ''}>
                                    {r.series_name || '—'}
                                </td>
                                <td className="px-4 py-2 max-w-[14rem]">
                                    {r.creation_id ? (
                                        <button
                                            onClick={() => onOpenDeck?.(r.creation_id)}
                                            className="text-primary-strong hover:underline text-left truncate block max-w-full"
                                            title={r.deck_title || ''}
                                        >
                                            {r.deck_title || 'Untitled deck'}
                                        </button>
                                    ) : (
                                        <span className="text-muted-foreground">{r.deck_title || '—'}</span>
                                    )}
                                </td>
                                <td className="px-4 py-2"><ModelBadge imageModel={r.image_model} /></td>
                                <td className="px-4 py-2 text-right text-muted-foreground whitespace-nowrap">
                                    {(r.image_calls || 0)} img + {(r.text_calls || 0)} txt
                                </td>
                                <td className="px-4 py-2 text-right text-foreground font-medium whitespace-nowrap">{formatUsd(r.est_usd)}</td>
                                <td className="px-4 py-2 text-right text-muted-foreground whitespace-nowrap">{formatDuration(r.seconds)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function CharShowSpendingView({ onBack, onOpenDeck }) {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        // Kick the loading/error resets off the effect's own synchronous call frame
        // (react-hooks' set-state-in-effect rule flags a setState call that runs
        // unconditionally as the effect body's first statement) — a resolved-microtask
        // hop still fires before the fetch can possibly resolve, so the spinner still
        // shows immediately on every days-change.
        Promise.resolve().then(() => {
            if (cancelled) return;
            setLoading(true);
            setError('');
        });
        fetch(getApiUrl(`/api/charshow/spend?days=${days}`))
            .then((res) => {
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                return res.json();
            })
            .then((json) => { if (!cancelled) setData(json); })
            .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load spending data.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [days]);

    const hasWindowSpend = !!data && (data.total_usd || 0) > 0;

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="space-y-6 max-w-6xl">
                <div className="space-y-3">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft size={12} /> Slideshows
                    </button>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <h1 className="text-2xl font-bold text-foreground">Spending</h1>
                        <TimeRangeControl days={days} onChange={setDays} />
                    </div>
                </div>

                {error && <p className="text-sm text-red-700">{error}</p>}

                {loading && !data ? (
                    <div className="flex justify-center py-16">
                        <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
                    </div>
                ) : data && (
                    <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <StatTile label="Total (window)" value={formatUsd(data.total_usd)} sub={`Last ${data.days ?? days} days`} />
                            <StatTile label="All-time" value={formatUsd(data.all_time_usd)} />
                            <StatTile label="Decks generated" value={(data.deck_count || 0).toLocaleString()} />
                            <StatTile label="Avg per deck" value={formatUsd(data.avg_per_deck_usd)} />
                            <StatTile label="Image calls" value={(data.image_calls || 0).toLocaleString()} />
                            <StatTile label="Text calls" value={(data.text_calls || 0).toLocaleString()} />
                        </div>

                        {data.note && <p className="text-xs text-muted-foreground">{data.note}</p>}

                        {!hasWindowSpend ? (
                            <p className="text-sm text-muted-foreground bg-muted border border-border rounded-xl p-8 text-center">
                                No spending in the last {data.days ?? days} days. Try a wider time range above.
                            </p>
                        ) : (
                            <>
                                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                                    <h3 className="text-sm font-semibold text-foreground">Daily spend</h3>
                                    <DailySpendChart byDay={data.by_day || []} />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                                        <h3 className="text-sm font-semibold text-foreground">Spend by series</h3>
                                        <HorizontalBarChart rows={data.by_series || []} />
                                    </div>
                                    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                                        <h3 className="text-sm font-semibold text-foreground">Spend by model</h3>
                                        <HorizontalBarChart
                                            rows={(data.by_model || []).map((r) => ({ name: providerLabel(r.name) || r.name, usd: r.usd }))}
                                        />
                                    </div>
                                    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                                        <h3 className="text-sm font-semibold text-foreground">Spend by kind</h3>
                                        <HorizontalBarChart
                                            rows={(data.by_kind || []).map((r) => ({ name: kindLabel(r.name), usd: r.usd }))}
                                            barHeight={12}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-foreground">Recent events</h3>
                                    <RecentEventsTable recent={data.recent || []} onOpenDeck={onOpenDeck} />
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
