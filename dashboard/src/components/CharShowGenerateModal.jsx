import React, { useState } from 'react';
import { X, Layers } from 'lucide-react';

const COUNT_PRESETS = [1, 3, 7, 14];

const AUDIENCE_OPTIONS = [
    { value: 'auto', label: 'Auto mix' },
    { value: 'men', label: '♂ Men' },
    { value: 'women', label: '♀ Women' },
];

const PER_DAY_OPTIONS = [1, 2, 3];

// Local Toggle — mirrors CharShowSeriesEditor's, duplicated per this codebase's
// convention of not sharing small UI bits across sibling component files.
function Toggle({ on, onChange, title }) {
    return (
        <button
            onClick={onChange}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-primary' : 'bg-muted-foreground/40'}`}
            role="switch"
            aria-checked={!!on}
            title={title}
        >
            <span className={`absolute top-0.5 left-0 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        </button>
    );
}

function tomorrowISO() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return dt;
}

function formatMonthDay(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "7 decks → Sep 2 – Sep 5, 2/day" — per_day decks share a date, then the next day, etc.
function computeSchedulePreview(count, startDate, perDay) {
    if (!startDate || !count || !perDay) return '';
    const totalDays = Math.max(1, Math.ceil(count / perDay));
    const start = addDays(startDate, 0);
    const end = addDays(startDate, totalDays - 1);
    const range = totalDays === 1 ? formatMonthDay(start) : `${formatMonthDay(start)} – ${formatMonthDay(end)}`;
    return `${count} deck${count === 1 ? '' : 's'} → ${range}, ${perDay}/day`;
}

export default function CharShowGenerateModal({ series, onClose, onGenerate }) {
    const [count, setCount] = useState(1);
    const [audience, setAudience] = useState('auto');
    const [scheduleOn, setScheduleOn] = useState(false);
    const [startDate, setStartDate] = useState(() => tomorrowISO());
    const [perDay, setPerDay] = useState(2);

    const isAiFull = series?.render_mode === 'ai_full';
    const estimateText = isAiFull ? '≈1 min + ~7 image generations per deck' : 'fast, no image cost';
    const preview = scheduleOn ? computeSchedulePreview(count, startDate, perDay) : '';
    const canGenerate = count >= 1 && (!scheduleOn || !!startDate);

    const submit = () => {
        if (!canGenerate) return;
        onGenerate({
            count,
            audience: audience === 'auto' ? null : audience,
            schedule: scheduleOn ? { start_date: startDate, per_day: perDay } : null,
        });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-8" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg max-h-full overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border shrink-0">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">Generate decks</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{series?.name || 'Series'}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                    {/* Deck count */}
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Deck count</label>
                        <div className="flex items-center gap-2 flex-wrap">
                            {COUNT_PRESETS.map((n) => (
                                <button
                                    key={n}
                                    onClick={() => setCount(n)}
                                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                                        count === n ? 'border-primary bg-primary/10 text-primary-strong' : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                >
                                    {n}
                                </button>
                            ))}
                            <input
                                type="number" min={1} max={20}
                                value={count}
                                onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                                className="input-field w-16 text-sm py-1.5 text-center"
                            />
                        </div>
                    </div>

                    {/* Audience */}
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Audience</label>
                        <div className="grid grid-cols-3 gap-2">
                            {AUDIENCE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setAudience(opt.value)}
                                    className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                                        audience === opt.value ? 'border-primary bg-primary/10 text-primary-strong' : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Targeted batches use only @men/@women-tagged topics.</p>
                    </div>

                    {/* Schedule */}
                    <div className="bg-muted border border-border rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-foreground">Schedule the batch</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Decks save as Scheduled with dates already set, instead of Unpublished.</p>
                            </div>
                            <Toggle on={scheduleOn} onChange={() => setScheduleOn((v) => !v)} title="Schedule the batch" />
                        </div>
                        {scheduleOn && (
                            <div className="space-y-3 pt-1">
                                <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                                    <div>
                                        <label className="text-xs text-muted-foreground block mb-1.5">Start date</label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="input-field text-sm py-1.5"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-foreground block mb-1.5">Posts per day</label>
                                        <select
                                            value={perDay}
                                            onChange={(e) => setPerDay(Number(e.target.value))}
                                            className="input-field w-24 text-sm py-1.5"
                                        >
                                            {PER_DAY_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {preview && <p className="text-xs font-medium text-primary-strong">{preview}</p>}
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-muted-foreground">{estimateText}</p>
                </div>

                <div className="px-6 py-4 border-t border-border shrink-0 flex items-center gap-3">
                    <button onClick={onClose} className="bg-card border border-border text-foreground hover:bg-muted rounded-xl px-5 py-2.5 text-sm font-medium transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={!canGenerate}
                        className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Layers size={16} />
                        Generate {count} deck{count === 1 ? '' : 's'}
                    </button>
                </div>
            </div>
        </div>
    );
}
