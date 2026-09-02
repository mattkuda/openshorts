import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, Copy, Check, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { getApiUrl } from '../config';

const ROLE_LABELS = { hook: 'HOOK', content: 'CONTENT', plug: 'PLUG', cta: 'PLUG' };

// Mirrors the "M/D" short-date formatting used on the deck cards (CharShowTab) —
// duplicated locally since this codebase doesn't share a date-format utility across
// components (see ScheduleWeekModal.formatDate for the same convention).
function formatShortDate(value) {
    if (!value) return '';
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, day] = value.split('-').map(Number);
        d = new Date(y, m - 1, day);
    } else {
        d = new Date(value);
    }
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

const AUDIENCE_LABELS = { men: '♂ men', women: '♀ women' };

function statusMeta(status, scheduledFor) {
    if (status === 'published') {
        return { label: 'Published', classes: 'bg-green-500/10 text-green-700 border-green-500/20', dot: 'bg-green-500' };
    }
    if (status === 'scheduled') {
        const label = scheduledFor ? `Publish on ${formatShortDate(scheduledFor)}` : 'Scheduled';
        return { label, classes: 'bg-amber-500/10 text-amber-700 border-amber-500/20', dot: 'bg-amber-500' };
    }
    return { label: 'Unpublished', classes: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground/40' };
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

export default function CharShowDeckModal({ creation, onClose, onSaved, seriesList, onOpenSeries }) {
    const slots = creation.slots || {};
    const roles = slots.roles || [];
    const isStructured = Array.isArray(slots.slides);
    const isAiFull = slots.render_mode === 'ai_full';
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

    const setTextDraft = (i, value) => setTextDrafts((prev) => prev.map((t, idx) => (idx === i ? value : t)));

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
            setCacheBust(Date.now());
            setSavedNote('Re-rendered');
            onSaved?.({ ...creation, ...updated });
            setTimeout(() => setSavedNote(''), 2500);
        } catch (e) {
            setError(`Re-render failed: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const meta = statusMeta(creation.status, creation.scheduled_for);

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
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-1">
                            <span>{rows.length} slides</span>
                            <span className="text-border">·</span>
                            <span>Created {formatShortDate(creation.created_at)}</span>
                            <span className="text-border">·</span>
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-medium ${meta.classes}`}>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                                {meta.label}
                            </span>
                            {isAiFull && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                    FULL AI
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
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {savedNote && <span className="text-xs font-medium text-green-700">{savedNote}</span>}
                        {error && <span className="text-xs font-medium text-red-700 max-w-[16rem] truncate">{error}</span>}
                        <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                    {rows.map((row, i) => {
                        const img = images[i];
                        const src = img ? `${getApiUrl(img)}${cacheBust ? `?t=${cacheBust}` : ''}` : null;
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
                        {saving
                            ? (isAiFull ? 'Regenerating…' : 'Re-rendering…')
                            : (isAiFull ? 'Save & regenerate (AI)' : 'Save & re-render')}
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
