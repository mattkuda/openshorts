import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ChevronLeft, ChevronRight, X, Instagram, Youtube, Plus, Filter, Clock,
    Check, Send, Repeat, Download, AlertTriangle, Loader2,
} from 'lucide-react';
import { getApiUrl } from '../config';

const label = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';

// Deterministic per-account colors. Static class strings so Tailwind keeps them.
const ACCOUNT_COLORS = [
    { dot: 'bg-sky-500', text: 'text-sky-700' },
    { dot: 'bg-violet-500', text: 'text-violet-700' },
    { dot: 'bg-amber-500', text: 'text-amber-700' },
    { dot: 'bg-rose-500', text: 'text-rose-700' },
    { dot: 'bg-teal-500', text: 'text-teal-700' },
    { dot: 'bg-orange-500', text: 'text-orange-700' },
    { dot: 'bg-indigo-500', text: 'text-indigo-700' },
    { dot: 'bg-lime-600', text: 'text-lime-700' },
];
const NO_ACCOUNT_COLOR = { dot: 'bg-muted-foreground/50', text: 'text-muted-foreground' };

function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toDateKey(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(hhmm) {
    const [h, m] = (hhmm || '00:00').split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function PlatformChip({ platform }) {
    if (platform === 'instagram') return <Instagram className="w-3 h-3 text-muted-foreground" />;
    if (platform === 'youtube') return <Youtube className="w-3 h-3 text-muted-foreground" />;
    return <span className="text-[10px] font-bold text-muted-foreground">TT</span>;
}

function StatusBadge({ status }) {
    const map = {
        planned: { cls: 'bg-sky-500/10 text-sky-700', text: 'Planned · post manually' },
        scheduled: { cls: 'bg-amber-500/10 text-amber-700', text: 'Scheduled via Upload-Post' },
        posted: { cls: 'bg-green-500/10 text-green-700', text: 'Posted' },
        failed: { cls: 'bg-red-500/10 text-red-700', text: 'Failed' },
        canceled: { cls: 'bg-muted text-muted-foreground border border-border', text: 'Canceled' },
        auto: { cls: 'bg-muted text-muted-foreground border border-border', text: 'Automation · posts on its own' },
    };
    const m = map[status] || map.planned;
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${m.cls}`}>{m.text}</span>;
}

function statusIcon(entry) {
    if (entry.type === 'auto') return <Repeat size={10} className="shrink-0 text-muted-foreground" />;
    if (entry.status === 'posted') return <Check size={10} className="shrink-0 text-green-700" />;
    if (entry.status === 'failed') return <AlertTriangle size={10} className="shrink-0 text-red-700" />;
    if (entry.status === 'scheduled') return <Send size={10} className="shrink-0 text-muted-foreground" />;
    return <Clock size={10} className="shrink-0 text-muted-foreground" />;
}

/** Modal to plan a manual post: pick a creation, an account, date/time — then
 *  download the files and post it yourself. Tracks it on the calendar. */
function PlanPostModal({ open, defaultDate, creations, accounts, accountColor, onClose, onSaved }) {
    const [creationId, setCreationId] = useState('');
    const [account, setAccount] = useState(accounts[0] || '');
    const [date, setDate] = useState(defaultDate || toDateKey(new Date()));
    const [time, setTime] = useState('18:00');
    const [platforms, setPlatforms] = useState(['tiktok']);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setCreationId('');
            setDate(defaultDate || toDateKey(new Date()));
            setError('');
        }
    }, [open, defaultDate]);

    if (!open) return null;

    const selected = creations.find((c) => c.id === creationId);

    const togglePlatform = (p) => {
        setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
    };

    const save = async () => {
        if (!creationId) { setError('Pick a post from your Library first.'); return; }
        setSaving(true);
        setError('');
        try {
            const res = await fetch(getApiUrl('/api/schedule/planned'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    creation_id: creationId,
                    account,
                    platforms: platforms.length ? platforms : ['tiktok'],
                    scheduled_at: `${date}T${time}:00`,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    note,
                }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            onSaved();
            onClose();
        } catch (e) {
            setError(`Save failed: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-2xl shadow-xl p-5 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Plan a manual post</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Download the files, post them yourself from the TikTok app, then mark it posted here.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0">
                        <X size={16} />
                    </button>
                </div>

                <div>
                    <p className={`${label} mb-2`}>Post from your Library</p>
                    {creations.length === 0 ? (
                        <p className="text-sm text-muted-foreground bg-muted border border-border rounded-lg p-4 text-center">
                            Nothing in your Library yet — generate a slideshow first.
                        </p>
                    ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                            {creations.map((c) => (
                                <button
                                    key={c.id}
                                    onClick={() => setCreationId(c.id)}
                                    title={c.title}
                                    className={`aspect-[9/16] rounded-lg overflow-hidden bg-black border transition-colors ${
                                        creationId === c.id ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/60'
                                    }`}
                                >
                                    {c.image_paths?.[0] ? (
                                        <img src={getApiUrl(c.image_paths[0])} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="w-full h-full flex items-center justify-center text-[10px] text-white/60 p-1 text-center">
                                            {c.title || 'video'}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                    {selected && (
                        <div className="flex items-center justify-between gap-3 mt-2">
                            <p className="text-xs text-muted-foreground truncate">{selected.title}</p>
                            <a
                                href={getApiUrl(`/api/library/${selected.id}/download`)}
                                className="flex items-center gap-1.5 text-xs font-medium text-primary-strong hover:bg-primary/10 rounded-lg px-2 py-1 transition-colors shrink-0"
                            >
                                <Download size={12} /> Download files
                            </a>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                        <p className={`${label} mb-1.5`}>Account</p>
                        <input
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            list="calendar-accounts"
                            placeholder="e.g. evex.community"
                            className="input-field w-full text-sm py-2"
                        />
                        <datalist id="calendar-accounts">
                            {accounts.map((a) => <option key={a} value={a} />)}
                        </datalist>
                        {account && (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                                <span className={`w-2 h-2 rounded-full ${accountColor(account).dot}`} />
                                calendar color for this account
                            </p>
                        )}
                    </div>
                    <div>
                        <p className={`${label} mb-1.5`}>Platforms</p>
                        <div className="flex gap-2">
                            {['tiktok', 'instagram', 'youtube'].map((p) => (
                                <button
                                    key={p}
                                    onClick={() => togglePlatform(p)}
                                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                                        platforms.includes(p)
                                            ? 'border-primary bg-primary/10 text-primary-strong'
                                            : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                >
                                    {p === 'tiktok' ? 'TikTok' : p === 'instagram' ? 'Instagram' : 'YouTube'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className={`${label} mb-1.5`}>Date</p>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field w-full text-sm py-2" />
                    </div>
                    <div>
                        <p className={`${label} mb-1.5`}>Time</p>
                        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input-field w-full text-sm py-2" />
                    </div>
                </div>

                <div>
                    <p className={`${label} mb-1.5`}>Note (optional)</p>
                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. add trending audio before posting"
                        className="input-field w-full text-sm py-2"
                    />
                </div>

                {error && <p className="text-sm text-red-700">{error}</p>}

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="bg-card border border-border text-foreground hover:bg-muted rounded-xl px-5 py-2.5 text-sm font-medium transition-colors">
                        Cancel
                    </button>
                    <button onClick={save} disabled={saving} className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : 'Add to calendar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Day drill-in: every entry on that day with actions, plus "plan a post". */
function DaySheet({ day, entries, creationsById, accountColor, onClose, onPlan, onChanged }) {
    const [busyId, setBusyId] = useState(null);

    if (!day) return null;

    const patch = async (id, body) => {
        setBusyId(id);
        try {
            await fetch(getApiUrl(`/api/schedule/${id}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            onChanged();
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (entry) => {
        const msg = entry.method === 'manual' ? 'Remove this planned post from the calendar?' : 'Cancel this scheduled post?';
        if (!window.confirm(msg)) return;
        setBusyId(entry.id);
        try {
            await fetch(getApiUrl(`/api/schedule/${entry.id}`), { method: 'DELETE' });
            onChanged();
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-2xl shadow-xl p-5 w-full max-w-lg space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-foreground">
                        {day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h2>
                    <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {entries.length === 0 && (
                    <p className="text-sm text-muted-foreground bg-muted border border-border rounded-lg p-4 text-center">
                        Nothing on this day yet.
                    </p>
                )}

                {entries.map((entry) => {
                    const creation = creationsById[entry.creation_id];
                    const color = accountColor(entry.account);
                    const busy = busyId === entry.id;
                    return (
                        <div key={entry.id} className={`bg-muted border border-border rounded-xl p-3 space-y-2 ${entry.status === 'canceled' ? 'opacity-60' : ''}`}>
                            <div className="flex gap-3">
                                <div className="w-12 aspect-[9/16] rounded-lg overflow-hidden bg-black shrink-0">
                                    {creation?.image_paths?.[0] && (
                                        <img src={getApiUrl(creation.image_paths[0])} alt="" className="w-full h-full object-cover" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-semibold text-foreground">
                                            {new Date(entry.scheduled_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                        </span>
                                        <StatusBadge status={entry.type === 'auto' ? 'auto' : entry.status} />
                                    </div>
                                    <p className={`text-sm text-foreground ${entry.status === 'canceled' ? 'line-through' : ''} truncate`}>
                                        {entry.title || 'Untitled'}
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {entry.account && (
                                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <span className={`w-2 h-2 rounded-full ${color.dot}`} /> {entry.account}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            {(entry.platforms || []).map((p) => <PlatformChip key={p} platform={p} />)}
                                        </span>
                                    </div>
                                    {entry.note && <p className="text-xs text-muted-foreground italic">{entry.note}</p>}
                                </div>
                            </div>

                            {entry.type !== 'auto' && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {creation && (
                                        <a
                                            href={getApiUrl(`/api/library/${creation.id}/download`)}
                                            className="flex items-center gap-1.5 text-xs font-medium text-primary-strong hover:bg-primary/10 rounded-lg px-2 py-1.5 transition-colors"
                                        >
                                            <Download size={12} /> Download
                                        </a>
                                    )}
                                    {entry.status === 'planned' && (
                                        <button
                                            onClick={() => patch(entry.id, { status: 'posted' })}
                                            disabled={busy}
                                            className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:bg-green-500/10 rounded-lg px-2 py-1.5 transition-colors disabled:opacity-50"
                                        >
                                            <Check size={12} /> Mark posted
                                        </button>
                                    )}
                                    {entry.status === 'posted' && entry.method === 'manual' && (
                                        <button
                                            onClick={() => patch(entry.id, { status: 'planned' })}
                                            disabled={busy}
                                            className="text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-card rounded-lg px-2 py-1.5 transition-colors disabled:opacity-50"
                                        >
                                            Undo posted
                                        </button>
                                    )}
                                    {entry.status !== 'canceled' && (
                                        <button
                                            onClick={() => remove(entry)}
                                            disabled={busy}
                                            className="text-xs font-medium text-red-700 hover:bg-red-500/10 rounded-lg px-2 py-1.5 transition-colors ml-auto disabled:opacity-50"
                                        >
                                            {entry.method === 'manual' ? 'Remove' : 'Cancel'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                <button
                    onClick={onPlan}
                    className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted border border-dashed border-border rounded-lg py-2.5 transition-colors"
                >
                    <Plus size={14} /> Plan a post for this day
                </button>
            </div>
        </div>
    );
}

export default function CalendarTab({ userProfiles }) {
    const [scheduled, setScheduled] = useState([]);
    const [creations, setCreations] = useState([]);
    const [automations, setAutomations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [monthStart, setMonthStart] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });
    const [filterOpen, setFilterOpen] = useState(false);
    const [hiddenAccounts, setHiddenAccounts] = useState(() => new Set());
    const [showAuto, setShowAuto] = useState(true);
    const [sheetDay, setSheetDay] = useState(null);      // Date | null — day drill-in
    const [planFor, setPlanFor] = useState(null);        // 'YYYY-MM-DD' | null — plan modal
    const filterRef = useRef(null);

    const fetchAll = useCallback(async () => {
        setError('');
        try {
            const [sRes, lRes, aRes] = await Promise.all([
                fetch(getApiUrl('/api/schedule')),
                fetch(getApiUrl('/api/library')),
                fetch(getApiUrl('/api/automations')),
            ]);
            if (!sRes.ok) throw new Error(`Request failed (${sRes.status})`);
            setScheduled((await sRes.json()).scheduled || []);
            if (lRes.ok) setCreations((await lRes.json()).creations || []);
            if (aRes.ok) setAutomations((await aRes.json()).automations || []);
        } catch (err) {
            setError(err.message || 'Failed to load calendar.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Close the filter popover on outside click
    useEffect(() => {
        if (!filterOpen) return undefined;
        const onDown = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
        };
        window.addEventListener('mousedown', onDown);
        return () => window.removeEventListener('mousedown', onDown);
    }, [filterOpen]);

    const creationsById = useMemo(() => Object.fromEntries(creations.map((c) => [c.id, c])), [creations]);

    // All accounts we know about: connected profiles + anything on existing entries.
    const accounts = useMemo(() => {
        const set = new Set();
        (userProfiles || []).forEach((p) => set.add(p.username));
        scheduled.forEach((p) => { if (p.account) set.add(p.account); });
        automations.forEach((a) => { if (a.tiktok?.user_id) set.add(a.tiktok.user_id); });
        return [...set].sort();
    }, [userProfiles, scheduled, automations]);

    const accountColor = useCallback((account) => {
        if (!account) return NO_ACCOUNT_COLOR;
        const i = accounts.indexOf(account);
        return ACCOUNT_COLORS[(i >= 0 ? i : 0) % ACCOUNT_COLORS.length];
    }, [accounts]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Month grid: leading days from the previous month, trailing to fill the last week.
    const gridDays = useMemo(() => {
        const first = new Date(monthStart);
        const lead = first.getDay(); // 0 = Sunday
        const start = new Date(first);
        start.setDate(first.getDate() - lead);
        const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        const weeks = Math.ceil((lead + daysInMonth) / 7);
        return Array.from({ length: weeks * 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    }, [monthStart]);

    // Entries per day-key: real ScheduledPost rows + projected automation runs.
    const entriesByDay = useMemo(() => {
        const map = {};
        const push = (key, entry) => {
            (map[key] = map[key] || []).push(entry);
        };
        scheduled.forEach((p) => {
            if (hiddenAccounts.has(p.account || '')) return;
            const when = new Date(p.scheduled_at);
            if (Number.isNaN(when.getTime())) return;
            push(toDateKey(when), { ...p, type: 'post' });
        });
        if (showAuto) {
            automations.filter((a) => a.status === 'active').forEach((a) => {
                const account = a.tiktok?.user_id || '';
                if (hiddenAccounts.has(account)) return;
                const times = a.schedule?.times || [];
                gridDays.forEach((d) => {
                    if (d < today) return;
                    times.forEach((t) => {
                        if (!(t.days || []).includes(d.getDay())) return;
                        push(toDateKey(d), {
                            id: `auto-${a.id}-${toDateKey(d)}-${t.time}`,
                            type: 'auto',
                            title: a.name,
                            account,
                            platforms: a.tiktok?.platforms || ['tiktok'],
                            scheduled_at: `${toDateKey(d)}T${t.time || '00:00'}:00`,
                            status: 'auto',
                        });
                    });
                });
            });
        }
        Object.values(map).forEach((list) => list.sort((x, y) => new Date(x.scheduled_at) - new Date(y.scheduled_at)));
        return map;
    }, [scheduled, automations, gridDays, hiddenAccounts, showAuto, today]);

    const monthKeyPrefix = toDateKey(monthStart).slice(0, 7);
    const monthIsEmpty = !Object.keys(entriesByDay).some((k) => k.startsWith(monthKeyPrefix) && entriesByDay[k].length > 0);

    const shiftMonth = (delta) => {
        setMonthStart((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    };

    const toggleAccountHidden = (account) => {
        setHiddenAccounts((prev) => {
            const next = new Set(prev);
            if (next.has(account)) next.delete(account);
            else next.add(account);
            return next;
        });
    };

    const sheetEntries = sheetDay ? entriesByDay[toDateKey(sheetDay)] || [] : [];

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Content Calendar</h1>
                        <p className="text-xs text-muted-foreground mt-1">
                            Planned manual posts, Upload-Post schedules, and upcoming automation runs — color-coded by account.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative" ref={filterRef}>
                            <button
                                onClick={() => setFilterOpen((v) => !v)}
                                className={`flex items-center gap-2 bg-card border border-border rounded-lg text-sm px-3 py-1.5 transition-colors hover:bg-muted ${
                                    hiddenAccounts.size > 0 || !showAuto ? 'text-primary-strong border-primary/40' : 'text-foreground'
                                }`}
                            >
                                <Filter size={14} /> Filter
                            </button>
                            {filterOpen && (
                                <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-md p-3 space-y-2 z-50">
                                    <p className={label}>Accounts</p>
                                    {accounts.length === 0 && <p className="text-xs text-muted-foreground">No accounts yet.</p>}
                                    {accounts.map((a) => (
                                        <label key={a} className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={!hiddenAccounts.has(a)}
                                                onChange={() => toggleAccountHidden(a)}
                                                className="accent-[hsl(var(--primary))]"
                                            />
                                            <span className={`w-2 h-2 rounded-full ${accountColor(a).dot}`} />
                                            <span className="truncate">{a}</span>
                                        </label>
                                    ))}
                                    <div className="border-t border-border pt-2">
                                        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={showAuto}
                                                onChange={() => setShowAuto((v) => !v)}
                                                className="accent-[hsl(var(--primary))]"
                                            />
                                            Show automation runs
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => shiftMonth(-1)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                            title="Previous month"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => shiftMonth(1)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                            title="Next month"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-semibold text-foreground w-28">
                            {monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        </span>
                        <button
                            onClick={() => { const d = new Date(); setMonthStart(new Date(d.getFullYear(), d.getMonth(), 1)); }}
                            className="bg-card border border-border text-foreground hover:bg-muted rounded-lg text-sm px-3 py-1.5 transition-colors"
                        >
                            Today
                        </button>
                        <button onClick={() => setPlanFor(toDateKey(new Date()))} className="btn-primary flex items-center gap-2 text-sm px-4 py-2">
                            <Plus size={14} /> Plan post
                        </button>
                    </div>
                </div>

                {/* Account legend */}
                {accounts.length > 0 && (
                    <div className="flex items-center gap-4 flex-wrap">
                        {accounts.map((a) => (
                            <span key={a} className={`flex items-center gap-1.5 text-xs text-muted-foreground ${hiddenAccounts.has(a) ? 'opacity-40 line-through' : ''}`}>
                                <span className={`w-2 h-2 rounded-full ${accountColor(a).dot}`} /> {a}
                            </span>
                        ))}
                    </div>
                )}

                {error && <p className="text-sm text-red-700">{error}</p>}

                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
                    </div>
                ) : (
                    <div className="relative">
                        {/* Weekday header */}
                        <div className="grid grid-cols-7">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                                <p key={d} className="text-xs uppercase tracking-wider text-muted-foreground font-bold px-2 pb-2">{d}</p>
                            ))}
                        </div>
                        {/* Month grid */}
                        <div className="grid grid-cols-7 border-t border-l border-border rounded-xl overflow-hidden bg-card">
                            {gridDays.map((day) => {
                                const inMonth = day.getMonth() === monthStart.getMonth();
                                const isToday = isSameDay(day, new Date());
                                const entries = entriesByDay[toDateKey(day)] || [];
                                const shown = entries.slice(0, 3);
                                return (
                                    <div
                                        key={day.toISOString()}
                                        onClick={() => setSheetDay(day)}
                                        className={`group min-h-[112px] border-r border-b border-border p-1.5 space-y-1 cursor-pointer transition-colors hover:bg-muted/60 ${
                                            inMonth ? '' : 'bg-surface/60'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span
                                                className={`text-xs w-6 h-6 inline-flex items-center justify-center rounded-full font-medium ${
                                                    isToday
                                                        ? 'bg-primary text-primary-foreground font-semibold'
                                                        : inMonth ? 'text-foreground' : 'text-muted-foreground/60'
                                                }`}
                                            >
                                                {day.getDate()}
                                            </span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setPlanFor(toDateKey(day)); }}
                                                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground hover:bg-card rounded transition-all"
                                                title="Plan a post on this day"
                                            >
                                                <Plus size={12} />
                                            </button>
                                        </div>
                                        {shown.map((entry) => {
                                            const color = accountColor(entry.account);
                                            const canceled = entry.status === 'canceled';
                                            return (
                                                <div
                                                    key={entry.id}
                                                    className={`flex items-center gap-1 text-[11px] leading-tight rounded-md px-1.5 py-1 border ${
                                                        entry.type === 'auto'
                                                            ? 'border-dashed border-border text-muted-foreground bg-transparent'
                                                            : `border-border bg-muted text-foreground ${canceled ? 'opacity-50 line-through' : ''}`
                                                    }`}
                                                    title={`${entry.title}${entry.account ? ` · ${entry.account}` : ''}`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
                                                    {statusIcon(entry)}
                                                    <span className="truncate">{entry.title || 'Untitled'}</span>
                                                </div>
                                            );
                                        })}
                                        {entries.length > 3 && (
                                            <p className="text-[11px] text-muted-foreground px-1">+{entries.length - 3} more</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {monthIsEmpty && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="bg-card border border-border rounded-2xl shadow-md p-6 text-center pointer-events-auto max-w-sm">
                                    <p className="text-sm font-semibold text-foreground">No content this month</p>
                                    <p className="text-xs text-muted-foreground mt-1 mb-4">
                                        Plan a manual post from your Library, or turn on an automation and its runs show up here.
                                    </p>
                                    <button onClick={() => setPlanFor(toDateKey(new Date()))} className="btn-primary text-sm px-5 py-2">
                                        Plan a post
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <DaySheet
                day={sheetDay}
                entries={sheetEntries}
                creationsById={creationsById}
                accountColor={accountColor}
                onClose={() => setSheetDay(null)}
                onPlan={() => { setPlanFor(toDateKey(sheetDay)); setSheetDay(null); }}
                onChanged={fetchAll}
            />

            <PlanPostModal
                open={planFor !== null}
                defaultDate={planFor}
                creations={creations}
                accounts={accounts}
                accountColor={accountColor}
                onClose={() => setPlanFor(null)}
                onSaved={fetchAll}
            />
        </div>
    );
}
