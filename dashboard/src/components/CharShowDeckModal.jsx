import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, Copy, Check, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, Trash2, Send } from 'lucide-react';
import { getApiUrl } from '../config';

const ROLE_LABELS = { hook: 'HOOK', content: 'CONTENT', plug: 'PLUG', cta: 'PLUG' };

// Formats an ISO created_at/updated_at timestamp (always a full UTC-offset instant
// from the backend, per db.py's `_now()`) into local "M/D h:MM AM/PM" — duplicated
// locally since this codebase doesn't share a date-format utility across components
// (see ScheduleWeekModal.formatDate for the same convention). Goes through the Date
// constructor (unlike formatDateTime below) so the UTC offset is correctly converted
// to the viewer's local time, rather than read off as if it were already local.
function formatTimestamp(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const dateStr = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
}

const AUDIENCE_LABELS = { men: '♂ men', women: '♀ women' };
const DECK_TYPE_LABELS = { workout: 'Workout', info: 'Info' };

function deckTypeLabel(deckType) {
    if (!deckType) return '';
    return DECK_TYPE_LABELS[deckType] || (deckType.charAt(0).toUpperCase() + deckType.slice(1));
}

// 3-way model badge: "Typeset" for the classic render path, else the image provider
// used for the ai_full render — "Gemini Pro" (default) or "GPT Image 2" (openai).
function modelBadgeLabel(slots) {
    if (!slots || slots.render_mode !== 'ai_full') return 'Typeset';
    return slots.image_model === 'openai' ? 'GPT Image 2' : 'Gemini Pro';
}

// "Generated in 1m 12s · 14 img + 9 txt calls · ≈$0.58" — only new decks carry
// slots.gen_stats, so callers should skip rendering this when it's absent. Appends
// "· updated M/D h:MM AM/PM" when updatedAt is more than a minute after createdAt
// (i.e. the deck was edited/re-rendered after its initial generation).
function formatGenStats(stats, createdAt, updatedAt) {
    if (!stats) return '';
    const seconds = stats.seconds || 0;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    const time = m > 0 ? `${m}m ${s}s` : `${s}s`;
    const estUsd = (stats.est_usd || 0).toFixed(2);
    let line = `Generated in ${time} · ${stats.image_calls || 0} img + ${stats.text_calls || 0} txt calls · ≈$${estUsd}`;
    if (createdAt && updatedAt) {
        const createdMs = new Date(createdAt).getTime();
        const updatedMs = new Date(updatedAt).getTime();
        if (!Number.isNaN(createdMs) && !Number.isNaN(updatedMs) && Math.abs(updatedMs - createdMs) > 60000) {
            line += ` · updated ${formatTimestamp(updatedAt)}`;
        }
    }
    return line;
}

// Formats a "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" value into "M/D" or "M/D h:MM AM/PM".
function formatDateTime(value) {
    if (!value) return '';
    const [datePart, timePart] = value.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    if (!timePart) {
        const dt = new Date(y, m - 1, d);
        if (Number.isNaN(dt.getTime())) return '';
        return dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    }
    const [hh, mm] = timePart.split(':').map(Number);
    const dt = new Date(y, m - 1, d, hh, mm);
    if (Number.isNaN(dt.getTime())) return '';
    const dateStr = dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
}

const STATUS_LABELS = { draft: 'Unpublished', scheduled: 'Scheduled', published: 'Published' };

function statusMeta(status, scheduledFor, publishedAt) {
    if (status === 'published') {
        const dt = formatDateTime(publishedAt);
        return { label: dt ? `Published ${dt}` : STATUS_LABELS.published, classes: 'bg-green-500/10 text-green-700 border-green-500/20', dot: 'bg-green-500' };
    }
    if (status === 'scheduled') {
        const dt = formatDateTime(scheduledFor);
        return { label: dt ? `Scheduled ${dt}` : STATUS_LABELS.scheduled, classes: 'bg-amber-500/10 text-amber-700 border-amber-500/20', dot: 'bg-amber-500' };
    }
    return { label: STATUS_LABELS.draft, classes: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground/40' };
}

// Local YYYY-MM-DDTHH:MM builders for the datetime-local inputs below.
function toDatetimeLocalValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function tomorrow9AM() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return toDatetimeLocalValue(d);
}
function nowDatetimeLocal() {
    return toDatetimeLocalValue(new Date());
}
// A stored value might be date-only ("YYYY-MM-DD", from the old date-only scheduler) —
// pad it to a valid datetime-local value instead of leaving the input blank.
function asDatetimeLocalValue(value, fallback) {
    if (!value) return fallback;
    return value.includes('T') ? value : `${value}T09:00`;
}

// ---- Structured "list" slide <-> textarea serialization -------------------
// line 1 = headline text
// one line per bullet: "- Label :: body text"
// optional last line: "TIP: tip text"
function serializeListSlide(slide) {
    const lines = [slide.text || ''];
    (slide.bullets || []).forEach((b) => {
        lines.push(`- ${b.label || ''} :: ${b.text || ''}`);
    });
    if (slide.tip) lines.push(`TIP: ${slide.tip}`);
    return lines.join('\n');
}

function parseListSlide(raw, original) {
    const lines = (raw || '').replace(/\r\n/g, '\n').split('\n');
    const text = (lines[0] || '').trim();
    const originalBullets = original.bullets || [];
    const bullets = [];
    let tip = '';
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const tipMatch = line.match(/^TIP:\s*(.*)$/i);
        if (tipMatch) { tip = tipMatch[1].trim(); continue; }
        // Merge onto the original bullet at this same output position first, so
        // per-bullet fields the textarea doesn't represent (pose_hint, pose, …)
        // survive a text edit instead of being dropped. Bullets beyond the
        // original count fall back to {} — just {label, text}.
        const base = originalBullets[bullets.length] || {};
        const bulletMatch = line.match(/^-\s*(.*?)\s*::\s*(.*)$/);
        if (bulletMatch) {
            bullets.push({ ...base, label: bulletMatch[1].trim(), text: bulletMatch[2].trim() });
        } else {
            const stripped = line.replace(/^-\s*/, '').trim();
            if (stripped) bullets.push({ ...base, label: '', text: stripped });
        }
    }
    // Preserve every field the textarea doesn't represent (layout, pose_hint,
    // bullet_poses, role) — only text/bullets/tip come from the parse.
    return { ...original, text, bullets, tip };
}

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    if (!text) return null;
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
            title="Copy"
        >
            {copied ? <Check size={13} className="text-green-700" /> : <Copy size={13} />}
        </button>
    );
}

// A small split/dropdown export control — mirrors CharShowTab's DeckStatusControl
// interaction pattern (click to open, mousedown-outside to close).
function ExportControl({ exporting, onExport }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                disabled={exporting}
                className="flex items-center gap-1.5 bg-card border border-border text-foreground hover:bg-muted rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            >
                {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Export
                <ChevronDown size={11} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-md p-1 w-44">
                    <button
                        onClick={() => { setOpen(false); onExport(false); }}
                        className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg text-foreground hover:bg-muted transition-colors"
                    >
                        Export deck
                    </button>
                    <button
                        onClick={() => { setOpen(false); onExport(true); }}
                        className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg text-foreground hover:bg-muted transition-colors"
                    >
                        Export images only
                    </button>
                </div>
            )}
        </div>
    );
}

// Status control: Unpublished / Scheduled / Published, with a datetime-local input
// for the latter two. Self-contained — PATCHes /api/charshow/deck/{id} directly and
// reports the updated creation up via onSaved (same prop the modal's other actions
// already use to sync CharShowTab's creations state).
function DeckStatusControl({ creation, onSaved }) {
    const [open, setOpen] = useState(false);
    const [pickingMode, setPickingMode] = useState(null); // null | 'scheduled' | 'published'
    const [dateTimeVal, setDateTimeVal] = useState('');
    const [patching, setPatching] = useState(false);
    const [patchError, setPatchError] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
                setPickingMode(null);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const meta = statusMeta(creation.status, creation.scheduled_for, creation.published_at);

    const patch = async (body) => {
        setPatching(true);
        setPatchError('');
        try {
            const res = await fetch(getApiUrl(`/api/charshow/deck/${creation.id}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            onSaved?.(data.creation || {});
        } catch (e) {
            setPatchError(`Update failed: ${e.message}`);
        } finally {
            setPatching(false);
        }
    };

    const choose = (status) => {
        if (status === 'scheduled') {
            setDateTimeVal(asDatetimeLocalValue(creation.scheduled_for, tomorrow9AM()));
            setPickingMode('scheduled');
            return;
        }
        if (status === 'published') {
            setDateTimeVal(asDatetimeLocalValue(creation.published_at, nowDatetimeLocal()));
            setPickingMode('published');
            return;
        }
        setOpen(false);
        patch({ status: 'draft' });
    };

    // Re-selecting the CURRENT status (just adjusting its datetime) sends the datetime
    // field alone — no status field — per the backend's "no status field" update path,
    // so a later time edit can't accidentally re-stamp published_at to now.
    const confirmDateTime = () => {
        if (!dateTimeVal) return;
        const field = pickingMode === 'scheduled' ? 'scheduled_for' : 'published_at';
        const body = pickingMode === creation.status ? { [field]: dateTimeVal } : { status: pickingMode, [field]: dateTimeVal };
        patch(body);
        setPickingMode(null);
        setOpen(false);
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                disabled={patching}
                className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${meta.classes}`}
            >
                {patching ? <Loader2 size={11} className="animate-spin" /> : <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />}
                {meta.label}
                <ChevronDown size={11} />
            </button>
            {open && (
                <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-md p-1 w-56">
                    {!pickingMode ? (
                        ['draft', 'scheduled', 'published'].map((s) => (
                            <button
                                key={s}
                                onClick={() => choose(s)}
                                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                                    creation.status === s ? 'bg-primary/10 text-primary-strong' : 'text-foreground hover:bg-muted'
                                }`}
                            >
                                {STATUS_LABELS[s]}
                            </button>
                        ))
                    ) : (
                        <div className="p-1.5 space-y-1.5">
                            <input
                                type="datetime-local"
                                value={dateTimeVal}
                                onChange={(e) => setDateTimeVal(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') confirmDateTime(); }}
                                className="input-field w-full text-xs py-1.5"
                                autoFocus
                            />
                            <button onClick={confirmDateTime} disabled={!dateTimeVal} className="btn-primary w-full text-xs py-1.5 disabled:opacity-50">
                                {pickingMode === 'scheduled' ? 'Set schedule' : 'Set published time'}
                            </button>
                        </div>
                    )}
                    {patchError && <p className="text-xs text-red-700 px-2.5 py-1">{patchError}</p>}
                </div>
            )}
        </div>
    );
}

// "Post to TikTok" — a confirm popover fetching the Upload-Post profile list, then
// POSTing the direct-post request. Self-contained like DeckStatusControl/ExportControl.
function PostToTikTokControl({ creation, uploadPostKey, onSaved, onPosted }) {
    const [open, setOpen] = useState(false);
    const [profiles, setProfiles] = useState(null); // null = not fetched yet
    const [profilesLoading, setProfilesLoading] = useState(false);
    const [profilesError, setProfilesError] = useState('');
    const [selectedProfile, setSelectedProfile] = useState('');
    const [posting, setPosting] = useState(false);
    const [postError, setPostError] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const fetchProfiles = async () => {
        setProfilesLoading(true);
        setProfilesError('');
        try {
            const res = await fetch(getApiUrl('/api/social/user'), {
                headers: uploadPostKey ? { 'X-Upload-Post-Key': uploadPostKey } : {},
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            const list = data.profiles || [];
            setProfiles(list);
            if (list.length > 0) setSelectedProfile(list[0].username);
        } catch (e) {
            setProfilesError(`Couldn't load profiles: ${e.message}`);
        } finally {
            setProfilesLoading(false);
        }
    };

    const openPopover = () => {
        setOpen(true);
        setPostError('');
        if (profiles === null) fetchProfiles();
    };

    const doPost = async () => {
        if (!selectedProfile) return;
        setPosting(true);
        setPostError('');
        try {
            const res = await fetch(getApiUrl('/api/charshow/post'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(uploadPostKey ? { 'X-Upload-Post-Key': uploadPostKey } : {}) },
                body: JSON.stringify({ creation_id: creation.id, user_id: selectedProfile, auto_add_music: true }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            onSaved?.(data.creation || {});
            setOpen(false);
            onPosted?.();
        } catch (e) {
            setPostError(`Post failed: ${e.message}`);
        } finally {
            setPosting(false);
        }
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={openPopover}
                disabled={!uploadPostKey}
                title={uploadPostKey ? undefined : 'Set your Upload-Post API key in Settings first'}
                className="flex items-center gap-1.5 btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
            >
                <Send size={13} />
                Post to TikTok
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-md p-3 w-72 space-y-2.5">
                    {profilesLoading ? (
                        <div className="flex items-center justify-center py-3">
                            <Loader2 size={16} className="animate-spin text-muted-foreground" />
                        </div>
                    ) : profilesError ? (
                        <p className="text-xs text-red-700">{profilesError}</p>
                    ) : profiles && profiles.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No Upload-Post profiles found for this key.</p>
                    ) : (
                        <>
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1.5">Post as</label>
                                <select
                                    value={selectedProfile}
                                    onChange={(e) => setSelectedProfile(e.target.value)}
                                    className="input-field w-full text-sm py-1.5"
                                >
                                    {(profiles || []).map((p) => <option key={p.username} value={p.username}>{p.username}</option>)}
                                </select>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Posts as a TikTok photo carousel with auto-added music (changeable in-app after posting).
                            </p>
                            {postError && <p className="text-xs text-red-700">{postError}</p>}
                            <button
                                onClick={doPost}
                                disabled={posting || !selectedProfile}
                                className="btn-primary w-full text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                {posting ? 'Posting…' : 'Post now'}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// A plain clickable slide thumbnail — opens the full Lightbox at this slide's index.
function SlidePreview({ src, onOpen }) {
    return (
        <div
            onClick={() => src && onOpen()}
            className={`w-72 aspect-[9/16] bg-black rounded-lg overflow-hidden shrink-0 ${src ? 'cursor-zoom-in' : ''}`}
        >
            {src && <img src={src} alt="Slide" className="w-full h-full object-cover" />}
        </div>
    );
}

// Full-screen click-triggered lightbox: current slide (up to 85vh) with wrapping
// left/right navigation, a jump-to-slide thumbnail strip, keyboard nav (arrows +
// Esc), and a click-the-scrim-to-close scrim. Rendered as a sibling of the deck
// modal's own backdrop (not nested inside it) so its `fixed inset-0` covers the
// real viewport — nesting it inside the modal's `backdrop-blur-sm` container would
// make that ancestor the fixed positioning context instead, per the CSS spec for
// backdrop-filter. Locks body scroll for as long as it's open.
function Lightbox({ slides, index, onClose, onNavigate }) {
    const thumbRefs = useRef([]);
    const total = slides.length;
    const current = slides[index];

    const goTo = (i) => onNavigate(((i % total) + total) % total);
    const prev = () => goTo(index - 1);
    const next = () => goTo(index + 1);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
            else if (e.key === 'ArrowLeft') prev();
            else if (e.key === 'ArrowRight') next();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index, total]);

    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prevOverflow; };
    }, []);

    useEffect(() => {
        thumbRefs.current[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [index]);

    if (!current) return null;
    const role = (current.role || 'content').toLowerCase();

    return (
        <div className="fixed inset-0 z-[110] bg-black/90 flex flex-col" onClick={onClose}>
            <div className="flex items-center justify-between px-6 py-4 shrink-0">
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs font-mono text-white/70">{index + 1} / {total}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/10 text-white">
                        {ROLE_LABELS[role] || role.toUpperCase()}
                    </span>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title="Close"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 flex items-center justify-center gap-4 px-4 min-h-0">
                <button
                    onClick={(e) => { e.stopPropagation(); prev(); }}
                    className="shrink-0 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Previous slide"
                >
                    <ChevronLeft size={22} />
                </button>
                {current.src && (
                    <img
                        src={current.src}
                        alt={`Slide ${index + 1}`}
                        onClick={(e) => e.stopPropagation()}
                        className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-xl"
                    />
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); next(); }}
                    className="shrink-0 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Next slide"
                >
                    <ChevronRight size={22} />
                </button>
            </div>

            <div className="shrink-0 px-4 py-4 overflow-x-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 w-max mx-auto">
                    {slides.map((s, i) => (
                        <button
                            key={i}
                            ref={(el) => { thumbRefs.current[i] = el; }}
                            onClick={() => goTo(i)}
                            className={`h-20 aspect-[9/16] rounded-lg overflow-hidden shrink-0 bg-black transition-opacity ${
                                i === index ? 'ring-2 ring-primary' : 'opacity-60 hover:opacity-100'
                            }`}
                        >
                            {s.src && <img src={s.src} alt={`Slide ${i + 1} thumbnail`} className="w-full h-full object-cover" />}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function CharShowDeckModal({ creation, onClose, onSaved, onDeleted, seriesList, onOpenSeries, geminiApiKey, mock, uploadPostKey }) {
    const slots = creation.slots || {};
    const roles = slots.roles || [];
    const isStructured = Array.isArray(slots.slides);
    const sourceSeries = slots.series_id ? (seriesList || []).find((s) => s.id === slots.series_id) || null : null;

    const [slidesBase, setSlidesBase] = useState(() => (isStructured ? slots.slides : null));
    const [textDrafts, setTextDrafts] = useState(() => (
        isStructured
            ? slots.slides.map((s) => (s.layout === 'list' ? serializeListSlide(s) : (s.text || '')))
            : (slots.texts || [])
    ));
    const [images, setImages] = useState(() => creation.image_paths || []);
    const [cacheBust, setCacheBust] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [savedNote, setSavedNote] = useState('');
    const [lightboxIndex, setLightboxIndex] = useState(null);
    // Per-slide art-regen UI state, keyed by slide index: { open, guidance, loading, error }
    const [regenState, setRegenState] = useState({});
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState(null);
    const [exportError, setExportError] = useState('');
    const [exportCopied, setExportCopied] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [postSuccess, setPostSuccess] = useState(false);

    const setTextDraft = (i, value) => setTextDrafts((prev) => prev.map((t, idx) => (idx === i ? value : t)));

    const deleteDeck = async () => {
        if (!window.confirm(`Delete "${creation.title || 'this deck'}"? This can't be undone.`)) return;
        setDeleting(true);
        setError('');
        try {
            const res = await fetch(getApiUrl(`/api/charshow/deck/${creation.id}`), { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            onDeleted?.(creation.id);
            onClose();
        } catch (e) {
            setError(`Delete failed: ${e.message}`);
        } finally {
            setDeleting(false);
        }
    };

    const exportDeck = async (imagesOnly) => {
        setExporting(true);
        setExportError('');
        setExportResult(null);
        try {
            const res = await fetch(getApiUrl('/api/charshow/export'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creation_ids: [creation.id], images_only: imagesOnly, reveal: true }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            setExportResult(data.path || '');
        } catch (e) {
            setExportError(`Export failed: ${e.message}`);
        } finally {
            setExporting(false);
        }
    };

    const getRegen = (i) => regenState[i] || { open: false, guidance: '', loading: false, error: '' };
    const updateRegen = (i, patch) => setRegenState((prev) => ({ ...prev, [i]: { ...getRegen(i), ...patch } }));

    const regenerateSlide = async (i) => {
        const r = getRegen(i);
        if (r.loading) return;
        updateRegen(i, { loading: true, error: '' });
        try {
            const res = await fetch(getApiUrl('/api/charshow/slide/regen'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}) },
                body: JSON.stringify({ creation_id: creation.id, slide_index: i + 1, guidance: r.guidance.trim(), mock: !!mock }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            const updated = data.creation || {};
            if (updated.image_paths) setImages(updated.image_paths);
            const updatedSlots = updated.slots || {};
            // Refresh only the structural fields (pose/bullet_poses) the regen changed —
            // textDrafts (unsaved text edits, any slide) are untouched by this.
            if (Array.isArray(updatedSlots.slides)) setSlidesBase(updatedSlots.slides);
            setCacheBust((prev) => prev + 1);
            updateRegen(i, { loading: false, open: false, guidance: '' });
            onSaved?.({ ...creation, ...updated });
        } catch (e) {
            updateRegen(i, { loading: false, error: `Regenerate failed: ${e.message}` });
        }
    };

    const rows = isStructured
        ? slidesBase.map((base, i) => ({
            role: (base.role || 'content').toLowerCase(),
            isList: base.layout === 'list',
            value: textDrafts[i] ?? '',
            onChange: (v) => setTextDraft(i, v),
        }))
        : textDrafts.map((t, i) => ({
            role: (roles[i] || 'content').toLowerCase(),
            isList: false,
            value: t,
            onChange: (v) => setTextDraft(i, v),
        }));

    const lightboxSlides = rows.map((row, i) => ({
        src: images[i] ? `${getApiUrl(images[i])}${cacheBust ? `?t=${cacheBust}` : ''}` : null,
        role: row.role,
    }));

    const buildStructuredSlides = () => slidesBase.map((base, i) => (
        base.layout === 'list' ? parseListSlide(textDrafts[i], base) : { ...base, text: textDrafts[i] ?? '' }
    ));

    const saveAndRerender = async () => {
        setSaving(true);
        setError('');
        setSavedNote('');
        try {
            const body = isStructured
                ? { creation_id: creation.id, slides: buildStructuredSlides() }
                : { creation_id: creation.id, texts: textDrafts };
            const res = await fetch(getApiUrl('/api/charshow/rerender'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            const updated = data.creation || {};
            if (updated.image_paths) setImages(updated.image_paths);
            const updatedSlots = updated.slots || {};
            if (Array.isArray(updatedSlots.slides)) {
                setSlidesBase(updatedSlots.slides);
                setTextDrafts(updatedSlots.slides.map((s) => (s.layout === 'list' ? serializeListSlide(s) : (s.text || ''))));
            } else if (Array.isArray(updatedSlots.texts)) {
                setTextDrafts(updatedSlots.texts);
            }
            setCacheBust((prev) => prev + 1);
            setSavedNote('Re-rendered');
            onSaved?.({ ...creation, ...updated });
            setTimeout(() => setSavedNote(''), 2500);
        } catch (e) {
            setError(`Re-render failed: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-8" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-5xl max-h-full overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border shrink-0">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{creation.title || 'Deck'}</p>
                        {(slots.topic || slots.category) && (
                            <p className="text-xs text-muted-foreground truncate">
                                Topic: {[slots.topic, slots.category].filter(Boolean).join(' · ')}
                            </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-1">
                            <span>{rows.length} slides</span>
                            <span className="text-border">·</span>
                            <span>Created {formatTimestamp(creation.created_at)}</span>
                            <span className="text-border">·</span>
                            <DeckStatusControl creation={creation} onSaved={onSaved} />
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                {modelBadgeLabel(slots)}
                            </span>
                            {slots.deck_type && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                    {deckTypeLabel(slots.deck_type)}
                                </span>
                            )}
                            {slots.audience && AUDIENCE_LABELS[slots.audience] && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                    {AUDIENCE_LABELS[slots.audience]}
                                </span>
                            )}
                            {slots.series_id && (
                                <>
                                    <span className="text-border">·</span>
                                    {sourceSeries ? (
                                        <button
                                            onClick={() => { onOpenSeries?.(sourceSeries); onClose(); }}
                                            className="text-primary-strong hover:underline"
                                        >
                                            Series: {sourceSeries.name}
                                        </button>
                                    ) : (
                                        <span>series deleted</span>
                                    )}
                                </>
                            )}
                        </div>
                        {slots.gen_stats && (
                            <p className="text-xs text-muted-foreground mt-1">
                                {formatGenStats(slots.gen_stats, creation.created_at, creation.updated_at)}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {savedNote && <span className="text-xs font-medium text-green-700">{savedNote}</span>}
                        {error && <span className="text-xs font-medium text-red-700 max-w-[16rem] truncate">{error}</span>}
                        <PostToTikTokControl
                            creation={creation}
                            uploadPostKey={uploadPostKey}
                            onSaved={onSaved}
                            onPosted={() => setPostSuccess(true)}
                        />
                        <ExportControl exporting={exporting} onExport={exportDeck} />
                        <button
                            onClick={deleteDeck}
                            disabled={deleting}
                            className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete deck"
                        >
                            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                        <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {(exportResult !== null || exportError) && (
                    <div className="px-6 pt-4 shrink-0">
                        {exportResult !== null && (
                            <div className="flex items-center justify-between gap-3 text-sm text-green-700 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                                <span className="truncate">Exported to <span className="font-mono">{exportResult}</span></span>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(exportResult);
                                            setExportCopied(true);
                                            setTimeout(() => setExportCopied(false), 1500);
                                        }}
                                        className="p-1.5 text-green-700 hover:bg-green-500/10 rounded-lg transition-colors"
                                        title="Copy path"
                                    >
                                        {exportCopied ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                    <button onClick={() => setExportResult(null)} className="p-1.5 text-green-700 hover:bg-green-500/10 rounded-lg transition-colors" title="Dismiss">
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                        {exportError && <p className="text-xs text-red-700 mt-2">{exportError}</p>}
                        {exportResult !== null && (
                            <p className="text-xs text-muted-foreground mt-2">
                                AirDrop tip: select the PNG files themselves (⌘A inside the folder) — files land in Photos; AirDropping the folder goes to the Files app instead.
                            </p>
                        )}
                    </div>
                )}

                {postSuccess && (
                    <div className="px-6 pt-4 shrink-0">
                        <div className="flex items-center justify-between gap-3 text-sm text-green-700 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                            <span>Posted to TikTok.</span>
                            <button onClick={() => setPostSuccess(false)} className="p-1.5 text-green-700 hover:bg-green-500/10 rounded-lg transition-colors" title="Dismiss">
                                <X size={14} />
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Check the TikTok app — you can swap the auto-added music on the live post.
                        </p>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                    {rows.map((row, i) => {
                        const img = images[i];
                        const src = img ? `${getApiUrl(img)}${cacheBust ? `?t=${cacheBust}` : ''}` : null;
                        const regen = getRegen(i);
                        return (
                            <div key={i} className="flex gap-4 bg-muted border border-border rounded-xl p-4">
                                <SlidePreview src={src} onOpen={() => setLightboxIndex(i)} />
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong inline-block">
                                            {ROLE_LABELS[row.role] || row.role.toUpperCase()}
                                        </span>
                                        {row.isList && (
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border inline-block">
                                                LIST
                                            </span>
                                        )}
                                    </div>
                                    <textarea
                                        value={row.value}
                                        onChange={(e) => row.onChange(e.target.value)}
                                        rows={row.isList ? 6 : 2}
                                        className={`input-field w-full resize-y text-sm ${row.isList ? 'font-mono' : ''}`}
                                    />
                                    {row.isList && (
                                        <p className="text-[11px] text-muted-foreground">
                                            Line 1 is the headline. Then one line per bullet: <span className="font-mono">- Label :: body text</span>.
                                            Optional last line: <span className="font-mono">TIP: tip text</span>.
                                        </p>
                                    )}

                                    <div className="pt-1 space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => regenerateSlide(i)}
                                                disabled={regen.loading}
                                                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                            >
                                                {regen.loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                                {regen.loading ? 'Regenerating image…' : 'Regenerate image'}
                                            </button>
                                            <button
                                                onClick={() => updateRegen(i, { open: !regen.open })}
                                                disabled={regen.loading}
                                                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                                title={regen.open ? 'Hide guidance' : 'Add guidance'}
                                            >
                                                {regen.open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                            </button>
                                        </div>
                                        {regen.open && (
                                            <input
                                                value={regen.guidance}
                                                onChange={(e) => updateRegen(i, { guidance: e.target.value })}
                                                onKeyDown={(e) => { if (e.key === 'Enter') regenerateSlide(i); }}
                                                placeholder="What to fix (optional) — e.g. different pose, holding a barbell"
                                                disabled={regen.loading}
                                                className="input-field w-full text-xs py-1.5 disabled:opacity-50"
                                            />
                                        )}
                                        <p className="text-[11px] text-muted-foreground">
                                            Regenerates the ART only — edit the text above and Save &amp; re-render for text changes.
                                        </p>
                                        {regen.error && <p className="text-xs text-red-700">{regen.error}</p>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {(slots.caption || slots.first_comment) && (
                        <div className="space-y-2 pt-2 border-t border-border">
                            {slots.caption && (
                                <div className="bg-muted border border-border rounded-lg p-3 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Caption</p>
                                        <p className="text-sm text-foreground whitespace-pre-wrap">{slots.caption}</p>
                                    </div>
                                    <CopyButton text={slots.caption} />
                                </div>
                            )}
                            {slots.first_comment && (
                                <div className="bg-muted border border-border rounded-lg p-3 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">First comment</p>
                                        <p className="text-sm text-foreground whitespace-pre-wrap">{slots.first_comment}</p>
                                    </div>
                                    <CopyButton text={slots.first_comment} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-border shrink-0">
                    <button onClick={saveAndRerender} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        {saving ? 'Re-rendering…' : 'Save & re-render'}
                    </button>
                </div>
            </div>
        </div>
        {lightboxIndex !== null && (
            <Lightbox
                slides={lightboxSlides}
                index={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
                onNavigate={setLightboxIndex}
            />
        )}
        </>
    );
}
