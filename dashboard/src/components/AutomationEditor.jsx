import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ArrowLeft, Sparkles, Wand2, Loader2, Plus, Trash2, X, Play, Pause,
    ChevronLeft, ChevronRight, Images, Clock, GalleryHorizontal, LayoutGrid, Copy,
} from 'lucide-react';
import { getApiUrl } from '../config';
import CollectionPickerModal from './CollectionPickerModal';

const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const TONE_OPTIONS = [
    { value: 'conversational', label: 'Conversational & Relatable' },
    { value: 'motivational', label: 'Motivational & Empowering' },
    { value: 'educational', label: 'Educational & Informative' },
    { value: 'bold', label: 'Bold & Provocative' },
    { value: 'calm', label: 'Calm & Reflective' },
    { value: 'witty', label: 'Witty & Humorous' },
    { value: 'custom', label: 'Custom' },
];

const TIMEZONES = [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney',
];

const label = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';

// Starting point dropped into the custom tone box so users edit an example
// instead of staring at an empty prompt.
const CUSTOM_TONE_PREFILL = 'first person ("i", "my"), like texting a friend — plain words, '
    + 'no motivational clichés or hype, all lowercase, one concrete detail per slide';

/** Underline-style tabs: highlighted label with a colored bar below (no pill). */
function TabBar({ tabs, value, onChange, small = false }) {
    return (
        <div className="flex items-center gap-6 border-b border-border">
            {tabs.map((t) => (
                <button
                    key={t.value}
                    onClick={() => onChange(t.value)}
                    className={`-mb-px border-b-2 font-medium transition-colors ${small ? 'pb-2 text-xs' : 'pb-2.5 text-sm'} ${
                        value === t.value
                            ? 'border-primary text-foreground'
                            : `border-transparent hover:text-foreground ${t.muted ? 'text-muted-foreground/60' : 'text-muted-foreground'}`
                    }`}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

function SegmentedPair({ value, options, onChange }) {
    return (
        <div
            className="grid bg-muted border border-border rounded-lg p-0.5 text-xs font-medium"
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        >
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`px-2 py-1 rounded-md whitespace-nowrap transition-colors ${
                        value === opt.value
                            ? 'bg-card shadow-sm text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function Toggle({ on, onChange, title }) {
    return (
        <button
            onClick={onChange}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-primary' : 'bg-muted-foreground/40'}`}
            role="switch"
            aria-checked={!!on}
            title={title}
        >
            {/* Thumb stays white in both themes — the switch-knob convention; it must read on the green (on) and gray (off) tracks alike. */}
            <span className={`absolute top-0.5 left-0 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        </button>
    );
}

const PLAN_TEXT_PX = { sm: 12, md: 16, lg: 21 };
const PLAN_ANCHOR = { top: 'flex-start', center: 'center', bottom: 'flex-end' };

/** Simulates one rendered 1080x1920 slide before generation. Colors here are
 *  canvas simulation (what the PIL renderer outputs), not UI theme tokens.
 *  `compact` renders for small grid tiles: scaled-down text, no badge. */
function PlanSlide({ slide, textStyle, compact = false }) {
    const px = (PLAN_TEXT_PX[textStyle.size] || 16) * (compact ? 0.45 : 1);
    const lineStyle = textStyle.style === 'white_bg'
        ? { background: '#ffffff', color: '#141414', borderRadius: compact ? 3 : 5,
            padding: compact ? '1px 3px' : '2px 7px',
            boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', lineHeight: 2 }
        : textStyle.style === 'white'
            ? { color: '#ffffff' }
            : { color: '#ffffff', textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 3px rgba(0,0,0,0.6)' };
    return (
        <div className="w-full h-full relative">
            {slide.img ? (
                <>
                    <img src={getApiUrl(slide.img)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    {textStyle.style !== 'white_bg' && <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.25)' }} />}
                </>
            ) : (
                <div
                    className="absolute inset-0 flex items-end justify-center p-3"
                    style={{ background: 'linear-gradient(160deg, #2b2b30, #16161a)' }}
                >
                    {!compact && (
                        <p className="text-[10px] text-center mb-8" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            {slide.imgNote}
                        </p>
                    )}
                </div>
            )}
            <div
                className="absolute inset-0 flex flex-col px-2"
                style={{ justifyContent: PLAN_ANCHOR[textStyle.position] || 'flex-start', paddingTop: '20%', paddingBottom: '20%' }}
            >
                <p
                    className="mx-auto text-center font-bold"
                    style={{
                        width: `${textStyle.width || 80}%`, fontSize: px, lineHeight: 1.4,
                        ...(slide.placeholder ? { opacity: 0.7, fontStyle: 'italic', fontWeight: 500 } : {}),
                        ...lineStyle,
                    }}
                >
                    {slide.text}
                </p>
            </div>
            {!compact && (
                <span
                    className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap max-w-[95%] truncate"
                    style={{ background: 'rgba(0,0,0,0.65)', color: 'rgba(255,255,255,0.85)' }}
                >
                    {slide.badge}
                </span>
            )}
        </div>
    );
}

function ImageSourceControl({ image, collections, onChange, onOpenPicker, allowSpecific = false }) {
    const source = image?.source || 'ai';
    const coll = collections.find((c) => c.id === image?.collection_id);
    const fileRef = useRef(null);
    const [uploading, setUploading] = useState(false);

    const uploadSpecific = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(getApiUrl('/api/automations/assets'), { method: 'POST', body: fd });
            if (!res.ok) throw new Error(`Upload failed (${res.status})`);
            const data = await res.json();
            onChange({ ...image, source: 'specific', image_path: data.image_path });
        } catch {
            /* surfaced by the unchanged filename */
        } finally {
            setUploading(false);
        }
    };

    const options = [
        { value: 'ai', label: 'AI image' },
        { value: 'collection', label: 'Collection' },
        ...(allowSpecific ? [{ value: 'specific', label: 'Specific' }] : []),
    ];

    return (
        <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadSpecific} />
            <SegmentedPair value={source} options={options} onChange={(v) => onChange({ ...image, source: v })} />
            {source === 'ai' && (
                <input
                    value={image?.image_prompt || ''}
                    onChange={(e) => onChange({ ...image, image_prompt: e.target.value })}
                    placeholder="Describe the photo… (e.g. gym bag by the door, morning light)"
                    className="input-field text-sm"
                />
            )}
            {source === 'collection' && (
                <button
                    onClick={onOpenPicker}
                    className="w-full bg-card border border-border rounded-xl p-2 hover:bg-muted transition-colors text-left"
                >
                    {coll ? (
                        <div className="flex items-center gap-3">
                            <div className="grid grid-cols-4 gap-1 w-36 shrink-0">
                                {[0, 1, 2, 3].map((i) => (
                                    <div key={i} className="aspect-square bg-muted rounded overflow-hidden">
                                        {coll.images[i] ? (
                                            <img src={getApiUrl(coll.images[i].image_path)} alt="" className="w-full h-full object-cover" />
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm text-foreground truncate">{coll.name}</p>
                                <p className="text-xs text-muted-foreground">{coll.images.length} photos · random pick per post</p>
                            </div>
                        </div>
                    ) : (
                        <span className="flex items-center gap-2 px-1 py-1 text-sm text-muted-foreground">
                            <Images size={14} className="shrink-0" /> Pick a photo collection…
                        </span>
                    )}
                </button>
            )}
            {source === 'specific' && (
                <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full flex items-center gap-2 bg-card border border-border text-sm rounded-xl px-3 py-2.5 hover:bg-muted transition-colors text-left disabled:opacity-50"
                >
                    {image?.image_path ? (
                        <>
                            <img src={getApiUrl(image.image_path)} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                            <span className="text-foreground truncate">{image.image_path.split('_').slice(1).join('_') || 'pinned image'}</span>
                            <span className="text-muted-foreground text-xs ml-auto shrink-0">Replace</span>
                        </>
                    ) : (
                        <span className="text-muted-foreground">{uploading ? 'Uploading…' : 'Upload the exact image to use…'}</span>
                    )}
                </button>
            )}
        </div>
    );
}

/** Modal viewer over the automation's generation history — keeps results out of
 *  the editing view; the preview column always shows the live plan. Arrow keys
 *  step through slides; Newer/Older steps through generations. */
function GenerationViewer({ history, index, fresh, onNavigate, onClose }) {
    const [idx, setIdx] = useState(0);
    const gen = index !== null ? history[index] : null;
    const images = gen?.image_paths || [];

    useEffect(() => {
        setIdx(0);
    }, [index]);

    useEffect(() => {
        if (!gen) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') setIdx((p) => Math.max(0, p - 1));
            if (e.key === 'ArrowRight') setIdx((p) => Math.min(images.length - 1, p + 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [gen, images.length, onClose]);

    if (!gen) return null;

    const when = gen.created_at
        ? new Date(gen.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : '';

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={onClose}
        >
            <div
                className="bg-card border border-border rounded-2xl shadow-xl p-4 w-full max-w-md space-y-3"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{gen.title || 'Generation'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                            {when && <span>Generated {when}</span>}
                            {gen.status === 'published' && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-700">
                                    Posted
                                </span>
                            )}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="aspect-[9/16] max-h-[70vh] mx-auto rounded-xl overflow-hidden relative bg-black">
                    {images[idx] && (
                        <img
                            src={getApiUrl(images[Math.min(idx, images.length - 1)])}
                            alt={`Slide ${idx + 1}`}
                            className="w-full h-full object-contain"
                        />
                    )}
                    {images.length > 1 && (
                        <>
                            <button
                                onClick={() => setIdx((p) => Math.max(0, p - 1))}
                                disabled={idx === 0}
                                className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-card/80 text-foreground disabled:opacity-30"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                onClick={() => setIdx((p) => Math.min(images.length - 1, p + 1))}
                                disabled={idx >= images.length - 1}
                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-card/80 text-foreground disabled:opacity-30"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </>
                    )}
                </div>
                <div className="flex items-center justify-center gap-1.5">
                    {images.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setIdx(i)}
                            className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? 'bg-primary' : 'bg-border'}`}
                            aria-label={`Slide ${i + 1}`}
                        />
                    ))}
                </div>
                {fresh && <p className="text-xs text-green-700 text-center">Saved to Library.</p>}
                {history.length > 1 && (
                    <div className="flex items-center justify-between border-t border-border pt-3">
                        <button
                            onClick={() => onNavigate(index - 1)}
                            disabled={index <= 0}
                            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg px-2 py-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <ChevronLeft size={14} /> Newer
                        </button>
                        <span className="text-xs text-muted-foreground">
                            {index + 1} of {history.length}
                        </span>
                        <button
                            onClick={() => onNavigate(index + 1)}
                            disabled={index >= history.length - 1}
                            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg px-2 py-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                            Older <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AutomationEditor({ automationId, geminiApiKey, userProfiles, debug, navGuard, onBack }) {
    const [auto, setAuto] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedNote, setSavedNote] = useState('');
    const [dirty, setDirty] = useState(false);
    const [hooksBusy, setHooksBusy] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [collections, setCollections] = useState([]);
    const [pickerTarget, setPickerTarget] = useState(null); // 'hook' | 'default' | image-override index
    const [viewerIdx, setViewerIdx] = useState(null);       // index into history — generation modal (null = closed)
    const [viewerFresh, setViewerFresh] = useState(false);  // viewing a generation that just finished
    const [history, setHistory] = useState([]);             // recent generations for this automation
    const [viewLayout, setViewLayout] = useState('strip');  // preview layout: 'strip' | 'grid'
    const [tab, setTab] = useState('format');               // main tab: 'format' | 'style' | 'history' | 'settings'
    const [formatTab, setFormatTab] = useState('hook');     // format sub-tab: 'hook' | 'content' | 'cta'
    const stripRef = useRef(null);
    const stripProgrammatic = useRef(false);                // true while we drive the strip's scroll

    // Warn before losing unsaved changes: browser close/refresh…
    useEffect(() => {
        if (!dirty) return undefined;
        const onBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);

    // …in-app sidebar navigation (App consults this guard before switching tabs)…
    useEffect(() => {
        if (!navGuard) return undefined;
        navGuard.current = dirty
            ? () => window.confirm('You have unsaved changes — leave without saving?')
            : null;
        return () => { navGuard.current = null; };
    }, [navGuard, dirty]);

    // …and the in-editor back button.
    const handleBack = () => {
        if (dirty && !window.confirm('You have unsaved changes — leave without saving?')) return;
        onBack();
    };

    const fetchHistory = useCallback(async () => {
        try {
            const r = await fetch(getApiUrl('/api/library'));
            const d = await r.json();
            const h = (d.creations || [])
                .filter((c) => c.kind === 'auto_slideshow' && c.slots?.automation_id === automationId)
                .slice(0, 24);
            setHistory(h);
            return h;
        } catch {
            return []; /* history optional */
        }
    }, [automationId]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // The pre-generation "plan" carousel: one entry per planned slide, mirroring
    // the backend's resolve_layout. Collection slides sample a photo (random pick
    // happens at generation), AI slides show their prompt, overrides show their text.
    const planSlides = useMemo(() => {
        if (!auto) return [];
        const c = auto.content || {};
        const n = Math.max(1, Number((c.count_mode === 'vary' ? c.count_max : c.slide_count) ?? 4));
        const ctaOn = !!auto.cta?.enabled;
        const total = 1 + n + (ctaOn ? 1 : 0);
        const layout = { 1: 'hook' };
        if (ctaOn) {
            const pos = Number(auto.cta?.position);
            const ctaPos = Number.isInteger(pos) && pos >= 2 ? Math.min(pos, total) : total;
            layout[ctaPos] = 'cta';
        }
        let p = 2;
        for (let i = 0; i < n; i++) {
            while (layout[p]) p += 1;
            layout[p] = 'content';
            p += 1;
        }
        const dirOverrides = Object.fromEntries((auto.slides || []).map((o) => [o.slide_n, o.direction]));
        const imgOverrides = Object.fromEntries((auto.image_overrides || []).map((o) => [o.slide_n, o]));
        let contentIdx = 0;
        return Object.keys(layout).map(Number).sort((a, b) => a - b).map((pos) => {
            const role = layout[pos];
            const spec = role === 'hook' ? (auto.hook_image || {}) : (imgOverrides[pos] || auto.image_default || {});
            let text = '';
            let placeholder = false;
            if (role === 'hook') {
                text = (auto.hooks || []).find((h) => h.trim()) || 'a hook from your bank';
                placeholder = !(auto.hooks || []).some((h) => h.trim());
            } else if (role === 'cta') {
                text = auto.cta?.direction || 'call to action';
                placeholder = !auto.cta?.direction;
            } else {
                contentIdx += 1;
                const prefix = c.numbering ? `${contentIdx}. ` : '';
                if ((dirOverrides[pos] || '').trim()) {
                    text = prefix + dirOverrides[pos];
                } else {
                    text = `${prefix}AI writes this from your instructions`;
                    placeholder = true;
                }
            }
            const coll = collections.find((x) => x.id === spec.collection_id);
            let img = null;
            let imgNote = '';
            let badge = '';
            if (spec.source === 'collection') {
                if (coll?.images?.length) {
                    img = coll.images[pos % coll.images.length].image_path;
                    badge = `✳ random pick from ${coll.name}`;
                } else {
                    imgNote = 'pick a collection for this slide';
                    badge = '✳ collection not set';
                }
            } else if (spec.source === 'specific') {
                if (spec.image_path) {
                    img = spec.image_path;
                    badge = 'pinned image';
                } else {
                    imgNote = 'upload the exact image to pin';
                    badge = 'pinned image missing';
                }
            } else {
                imgNote = spec.image_prompt ? `AI image: “${spec.image_prompt}”` : 'AI image (add a prompt or pick a collection)';
                badge = spec.image_prompt ? `AI: ${spec.image_prompt.slice(0, 40)}` : 'AI image';
            }
            const slideLabel = role === 'hook' ? 'Hook' : role === 'cta' ? 'CTA' : `Content ${contentIdx}`;
            return { pos, role, label: slideLabel, text, placeholder, img, imgNote, badge: `${pos === 1 ? 'hook · ' : role === 'cta' ? 'CTA · ' : ''}${badge}` };
        });
    }, [auto, collections]);

    const mock = !!debug?.mockAI || !geminiApiKey;

    // Filmstrip ↔ selection sync. Selecting a slide (dots/arrows/peek click) centers
    // it in the strip; manual swipes update the selection to the nearest-center slide.
    useEffect(() => {
        if (viewLayout !== 'strip') return undefined;
        const c = stripRef.current;
        const el = c?.children[previewIndex];
        if (!c || !el) return undefined;
        stripProgrammatic.current = true;
        c.scrollTo({ left: el.offsetLeft - (c.clientWidth - el.clientWidth) / 2, behavior: 'smooth' });
        const t = setTimeout(() => { stripProgrammatic.current = false; }, 700);
        return () => clearTimeout(t);
    }, [previewIndex, viewLayout, planSlides.length]);

    // Jump the preview to the slide the active Format sub-tab configures.
    useEffect(() => {
        if (tab !== 'format') return;
        const i = formatTab === 'hook'
            ? 0
            : planSlides.findIndex((s) => s.role === (formatTab === 'cta' ? 'cta' : 'content'));
        if (i >= 0) setPreviewIndex(i);
        // planSlides intentionally omitted — only re-run on tab switches, not plan edits
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, formatTab]);

    const onStripScroll = () => {
        if (stripProgrammatic.current) return;
        const c = stripRef.current;
        if (!c) return;
        const center = c.scrollLeft + c.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        Array.from(c.children).forEach((ch, i) => {
            const d = Math.abs(ch.offsetLeft + ch.offsetWidth / 2 - center);
            if (d < bestDist) { bestDist = d; best = i; }
        });
        setPreviewIndex((p) => (p === best ? p : best));
    };

    useEffect(() => {
        fetch(getApiUrl(`/api/automations/${automationId}`))
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Automation not found'))))
            .then((d) => setAuto(d.automation))
            .catch((e) => setError(e.message));
        fetch(getApiUrl('/api/collections'))
            .then((r) => r.json())
            .then((d) => setCollections(d.collections || []))
            .catch(() => { /* collections optional */ });
    }, [automationId]);

    const update = useCallback((patch) => {
        setAuto((prev) => ({ ...prev, ...patch }));
        setDirty(true);
        setSavedNote('');
    }, []);

    const save = async (extraPatch = {}) => {
        setSaving(true);
        setError('');
        try {
            const body = {
                name: auto.name, status: auto.status, topic: auto.topic,
                tone_preset: auto.tone_preset, tone_prompt: auto.tone_prompt,
                hooks: auto.hooks, hook_image: auto.hook_image,
                content: auto.content, slides: auto.slides,
                image_default: auto.image_default, image_overrides: auto.image_overrides,
                cta: auto.cta, schedule: auto.schedule, tiktok: auto.tiktok,
                ...extraPatch,
            };
            const res = await fetch(getApiUrl(`/api/automations/${automationId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            setAuto(data.automation);
            setDirty(false);
            setSavedNote('Saved');
            setTimeout(() => setSavedNote(''), 2500);
        } catch (e) {
            setError(`Save failed: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const duplicateAutomation = async () => {
        setError('');
        try {
            if (dirty) await save();
            const res = await fetch(getApiUrl('/api/automations'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `${auto.name} (copy)` }),
            });
            if (!res.ok) throw new Error(`Create failed (${res.status})`);
            const data = await res.json();
            const body = {
                name: `${auto.name} (copy)`, status: 'paused', topic: auto.topic,
                tone_preset: auto.tone_preset, tone_prompt: auto.tone_prompt,
                hooks: auto.hooks, hook_image: auto.hook_image,
                content: auto.content, slides: auto.slides,
                image_default: auto.image_default, image_overrides: auto.image_overrides,
                cta: auto.cta, schedule: auto.schedule, tiktok: auto.tiktok,
            };
            const res2 = await fetch(getApiUrl(`/api/automations/${data.automation.id}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res2.ok) throw new Error(`Copy failed (${res2.status})`);
            onBack(); // back to the list, where the copy now shows (paused)
        } catch (e) {
            setError(`Duplicate failed: ${e.message}`);
        }
    };

    const deleteAutomation = async () => {
        if (!window.confirm(`Delete "${auto.name}"? Generated slideshows stay in your Library.`)) return;
        setError('');
        try {
            const res = await fetch(getApiUrl(`/api/automations/${automationId}`), { method: 'DELETE' });
            if (!res.ok) throw new Error(`Delete failed (${res.status})`);
            setDirty(false);
            onBack();
        } catch (e) {
            setError(`${e.message}`);
        }
    };

    const generateHooks = async () => {
        setHooksBusy(true);
        setError('');
        try {
            if (dirty) await save();
            const res = await fetch(getApiUrl(`/api/automations/${automationId}/hooks/generate`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}),
                },
                body: JSON.stringify({ mock }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            setAuto((prev) => ({ ...prev, hooks: data.hooks }));
        } catch (e) {
            setError(`Hook generation failed: ${e.message}`);
        } finally {
            setHooksBusy(false);
        }
    };

    const generateNow = async () => {
        setGenerating(true);
        setError('');
        try {
            if (dirty) await save();
            const res = await fetch(getApiUrl(`/api/automations/${automationId}/generate`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}),
                },
                body: JSON.stringify({ mock }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            const h = await fetchHistory();
            const i = h.findIndex((c) => c.id === data.creation?.id);
            if (h.length > 0) {
                setViewerFresh(true);
                setViewerIdx(i >= 0 ? i : 0);
            }
        } catch (e) {
            setError(`Generation failed: ${e.message}`);
        } finally {
            setGenerating(false);
        }
    };

    // --- content / override helpers ---
    const setContent = (patch) => update({ content: { ...auto.content, ...patch } });

    const setOverride = (i, patch) => {
        update({ slides: auto.slides.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
    };
    const addOverride = () => {
        const taken = new Set(auto.slides.map((o) => o.slide_n));
        let n = 2;
        while (taken.has(n)) n += 1;
        update({ slides: [...auto.slides, { slide_n: n, direction: '' }] });
    };
    const removeOverride = (i) => update({ slides: auto.slides.filter((_, idx) => idx !== i) });

    const setImageOverride = (i, patch) => {
        update({ image_overrides: auto.image_overrides.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
    };
    const addImageOverride = () => {
        const taken = new Set(auto.image_overrides.map((o) => o.slide_n));
        let n = 2;
        while (taken.has(n)) n += 1;
        update({
            image_overrides: [...auto.image_overrides,
                { slide_n: n, source: 'ai', image_prompt: '', collection_id: '', image_path: '' }],
        });
    };
    const removeImageOverride = (i) => update({ image_overrides: auto.image_overrides.filter((_, idx) => idx !== i) });

    // --- schedule helpers ---
    const setTime = (i, patch) => {
        const times = auto.schedule.times.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
        update({ schedule: { ...auto.schedule, times } });
    };
    const toggleDay = (i, day) => {
        const t = auto.schedule.times[i];
        const days = t.days.includes(day) ? t.days.filter((d) => d !== day) : [...t.days, day].sort();
        setTime(i, { days });
    };
    const addTime = () => {
        update({
            schedule: {
                ...auto.schedule,
                times: [...(auto.schedule.times || []), { time: '12:00', days: [0, 1, 2, 3, 4, 5, 6] }],
            },
        });
    };
    const removeTime = (i) => {
        update({ schedule: { ...auto.schedule, times: auto.schedule.times.filter((_, idx) => idx !== i) } });
    };

    if (!auto) {
        return (
            <div className="h-full flex items-center justify-center">
                {error ? (
                    <p className="text-sm text-red-700">{error}</p>
                ) : (
                    <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
                )}
            </div>
        );
    }

    const perWeek = (auto.schedule?.times || []).reduce((n, t) => n + (t.days?.length || 0), 0);
    const slideCount = planSlides.length;
    const connectedProfiles = (userProfiles || []).filter((p) => p.connected?.includes('tiktok'));
    const content = auto.content || {};
    const maxContent = content.count_mode === 'vary' ? (content.count_max ?? 6) : (content.slide_count ?? 4);
    const totalSlides = 1 + Number(maxContent || 4) + (auto.cta?.enabled ? 1 : 0);
    const slideNumbers = Array.from({ length: Math.max(totalSlides - 1, 1) }, (_, i) => i + 2);
    const countLabel = content.count_mode === 'vary'
        ? `${content.count_min ?? 3}–${content.count_max ?? 6} slides`
        : `${content.slide_count ?? 4} slides`;
    const textStyle = { style: 'outline', size: 'md', position: 'top', width: 80, ...(content.text_style || {}) };
    const setTextStyle = (patch) => setContent({ text_style: { ...textStyle, ...patch } });

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft size={16} /> All automations
                    </button>
                    <div className="flex items-center gap-3">
                        {savedNote && <span className="text-xs font-medium text-green-700">{savedNote}</span>}
                        {error && <span className="text-xs font-medium text-red-700 max-w-xs truncate">{error}</span>}
                        <button
                            onClick={() => update({ status: auto.status === 'active' ? 'paused' : 'active' })}
                            className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl border transition-colors ${
                                auto.status === 'active'
                                    ? 'bg-green-500/10 text-green-700 border-green-500/20'
                                    : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                            }`}
                        >
                            {auto.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                            {auto.status === 'active' ? 'Active' : 'Paused'}
                        </button>
                        <button
                            onClick={() => save()}
                            disabled={saving || !dirty}
                            className="btn-primary text-sm px-7 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                </div>

                <input
                    value={auto.name}
                    onChange={(e) => update({ name: e.target.value })}
                    className="w-full bg-transparent text-2xl font-bold text-foreground outline-none border-b border-transparent focus:border-border pb-1"
                    placeholder="Automation name"
                />

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_480px] gap-6 items-start">
                    <div className="space-y-5">
                        <TabBar
                            value={tab}
                            onChange={setTab}
                            tabs={[
                                { value: 'format', label: 'Format' },
                                { value: 'style', label: 'Hooks & Style' },
                                { value: 'history', label: 'History' },
                                { value: 'settings', label: 'Settings' },
                            ]}
                        />

                        {/* Hooks & Style — topic, voice, and the hook bank */}
                        {tab === 'style' && (
                        <div className="bg-card border border-border rounded-xl p-5 space-y-5">
                            <div>
                                <label className={`${label} block mb-2`}>What&apos;s this series about?</label>
                                <textarea
                                    value={auto.topic}
                                    onChange={(e) => update({ topic: e.target.value })}
                                    rows={2}
                                    placeholder="e.g. how i actually stick to my workout plan — soft-sells the Evex lifting app"
                                    className="input-field w-full resize-y"
                                />
                            </div>
                            <div>
                                <label className={`${label} block mb-2`}>Tone &amp; style</label>
                                <select
                                    value={auto.tone_preset}
                                    onChange={(e) => update({
                                        tone_preset: e.target.value,
                                        // Seed the custom box with an editable example, not a blank stare
                                        ...(e.target.value === 'custom' && !(auto.tone_prompt || '').trim()
                                            ? { tone_prompt: CUSTOM_TONE_PREFILL }
                                            : {}),
                                    })}
                                    className="input-field w-full"
                                >
                                    {TONE_OPTIONS.map((t) => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                                {auto.tone_preset === 'custom' && (
                                    <textarea
                                        value={auto.tone_prompt}
                                        onChange={(e) => update({ tone_prompt: e.target.value })}
                                        rows={3}
                                        placeholder="Voice, perspective, reading level, banned words… e.g. first person, 7th-grade reading level, like texting a friend"
                                        className="input-field w-full resize-y mt-2"
                                    />
                                )}
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className={label}>Hooks — one per line, each post picks one</label>
                                    <button
                                        onClick={generateHooks}
                                        disabled={hooksBusy}
                                        className="flex items-center gap-1.5 text-xs font-medium text-primary-strong hover:bg-primary/10 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                                    >
                                        {hooksBusy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                        Generate 10 more
                                    </button>
                                </div>
                                <textarea
                                    value={(auto.hooks || []).join('\n')}
                                    onChange={(e) => update({ hooks: e.target.value.split('\n') })}
                                    rows={6}
                                    placeholder={'how i went from skipping the gym to 5 days a week:\n5 things nobody tells you about consistency:'}
                                    className="input-field w-full resize-y font-mono text-sm"
                                />
                            </div>
                        </div>
                        )}

                        {/* Format — what each slide is, organized Hook / Content / CTA */}
                        {tab === 'format' && (
                        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                            <TabBar
                                small
                                value={formatTab}
                                onChange={setFormatTab}
                                tabs={[
                                    { value: 'hook', label: 'Hook' },
                                    { value: 'content', label: 'Content' },
                                    { value: 'cta', label: 'CTA', muted: !auto.cta?.enabled },
                                ]}
                            />

                            {formatTab === 'hook' && (
                                <div className="space-y-3">
                                    <p className="text-xs text-muted-foreground">
                                        Slide 1 opens every post with a hook from your bank (edit the bank in
                                        Hooks &amp; Style) over the image below.
                                    </p>
                                    <div className="bg-muted border border-border rounded-lg p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong whitespace-nowrap shrink-0">Hook</span>
                                            <span className="text-xs text-muted-foreground">Slide 1 image</span>
                                        </div>
                                        <ImageSourceControl
                                            image={auto.hook_image}
                                            collections={collections}
                                            allowSpecific
                                            onChange={(image) => update({ hook_image: image })}
                                            onOpenPicker={() => setPickerTarget('hook')}
                                        />
                                    </div>
                                </div>
                            )}

                            {formatTab === 'content' && (
                            <>
                            <p className="text-xs text-muted-foreground">
                                The AI writes each content slide from your instructions — add an override only
                                where a slide needs specifics.
                            </p>

                            {/* Count / numbering / length row */}
                            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                                <div>
                                    <label className={`${label} block mb-1.5`}>Content slides</label>
                                    <div className="flex items-center gap-2">
                                        {content.count_mode === 'vary' ? (
                                            <>
                                                <input
                                                    type="number" min={1} max={12}
                                                    value={content.count_min ?? 3}
                                                    onChange={(e) => setContent({ count_min: Number(e.target.value) })}
                                                    className="input-field w-16 text-sm py-1.5"
                                                />
                                                <span className="text-xs text-muted-foreground">to</span>
                                                <input
                                                    type="number" min={1} max={12}
                                                    value={content.count_max ?? 6}
                                                    onChange={(e) => setContent({ count_max: Number(e.target.value) })}
                                                    className="input-field w-16 text-sm py-1.5"
                                                />
                                            </>
                                        ) : (
                                            <input
                                                type="number" min={1} max={12}
                                                value={content.slide_count ?? 4}
                                                onChange={(e) => setContent({ slide_count: Number(e.target.value) })}
                                                className="input-field w-16 text-sm py-1.5"
                                            />
                                        )}
                                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">
                                            <input
                                                type="checkbox"
                                                checked={content.count_mode === 'vary'}
                                                onChange={(e) => setContent({ count_mode: e.target.checked ? 'vary' : 'fixed' })}
                                                className="accent-[hsl(var(--primary))]"
                                            />
                                            vary per post
                                        </label>
                                    </div>
                                </div>
                                <div>
                                    <label className={`${label} block mb-1.5`}>Numbered list</label>
                                    <div className="flex items-center gap-2 h-8">
                                        <Toggle
                                            on={!!content.numbering}
                                            onChange={() => setContent({ numbering: !content.numbering })}
                                            title="Prefix content slides with 1. 2. 3."
                                        />
                                        <span className="text-xs text-muted-foreground">1. 2. 3. — intro &amp; CTA never numbered</span>
                                    </div>
                                </div>
                                <div>
                                    <label className={`${label} block mb-1.5`}>Text length</label>
                                    <SegmentedPair
                                        value={content.text_length || 'short'}
                                        options={[
                                            { value: 'short', label: 'Short' },
                                            { value: 'medium', label: 'Medium' },
                                            { value: 'long', label: 'Long' },
                                        ]}
                                        onChange={(v) => setContent({ text_length: v })}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground -mt-1">
                                {(content.text_length || 'short') === 'short' && 'One punchy line per slide (≤12 words).'}
                                {content.text_length === 'medium' && '2–3 sentences per slide (~25–45 words).'}
                                {content.text_length === 'long' && '4–6 sentences per slide (~60–90 words) — storytime depth.'}
                            </p>

                            {/* Global instructions */}
                            <div>
                                <label className={`${label} block mb-2`}>What should the slides cover?</label>
                                <textarea
                                    value={content.instructions || ''}
                                    onChange={(e) => setContent({ instructions: e.target.value })}
                                    rows={3}
                                    placeholder="e.g. tips for actually sticking to a workout plan — showing up consistently, form over weight, rest days, tracking progress. supportive, all lowercase."
                                    className="input-field w-full resize-y"
                                />
                            </div>

                            {/* Sparse slide overrides */}
                            {(auto.slides || []).map((ov, i) => (
                                <div key={i} className="bg-muted border border-border rounded-lg p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong whitespace-nowrap shrink-0">Override</span>
                                            <select
                                                value={ov.slide_n}
                                                onChange={(e) => setOverride(i, { slide_n: Number(e.target.value) })}
                                                className="input-field w-auto text-xs py-1"
                                            >
                                                {slideNumbers.map((n) => (
                                                    <option key={n} value={n}>Slide {n}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <button
                                            onClick={() => removeOverride(i)}
                                            className="p-1 text-muted-foreground hover:text-foreground hover:bg-card rounded transition-colors"
                                            title="Remove override"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                    <textarea
                                        value={ov.direction}
                                        onChange={(e) => setOverride(i, { direction: e.target.value })}
                                        rows={2}
                                        placeholder="What must THIS slide do? e.g. subtly mention tracking lifts with the Evex app — as something that helped, not an ad"
                                        className="input-field w-full resize-y text-sm"
                                    />
                                </div>
                            ))}
                            <button
                                onClick={addOverride}
                                className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted border border-dashed border-border rounded-lg py-2.5 transition-colors"
                            >
                                <Plus size={14} /> Add slide override
                            </button>

                            {/* Default image + per-slide image overrides */}
                            <div className="bg-muted border border-border rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-foreground">Default image for content slides</span>
                                </div>
                                <ImageSourceControl
                                    image={auto.image_default}
                                    collections={collections}
                                    onChange={(image) => update({ image_default: image })}
                                    onOpenPicker={() => setPickerTarget('default')}
                                />
                            </div>

                            {(auto.image_overrides || []).map((ov, i) => (
                                <div key={i} className="bg-muted border border-border rounded-lg p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong whitespace-nowrap shrink-0">Image override</span>
                                            <select
                                                value={ov.slide_n}
                                                onChange={(e) => setImageOverride(i, { slide_n: Number(e.target.value) })}
                                                className="input-field w-auto text-xs py-1"
                                            >
                                                {slideNumbers.map((n) => (
                                                    <option key={n} value={n}>Slide {n}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <button
                                            onClick={() => removeImageOverride(i)}
                                            className="p-1 text-muted-foreground hover:text-foreground hover:bg-card rounded transition-colors"
                                            title="Remove image override"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                    <ImageSourceControl
                                        image={ov}
                                        collections={collections}
                                        allowSpecific
                                        onChange={(patch) => setImageOverride(i, patch)}
                                        onOpenPicker={() => setPickerTarget(i)}
                                    />
                                </div>
                            ))}
                            <button
                                onClick={addImageOverride}
                                className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted border border-dashed border-border rounded-lg py-2.5 transition-colors"
                            >
                                <Plus size={14} /> Add image override
                            </button>
                            </>
                            )}

                            {formatTab === 'cta' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-xs text-muted-foreground">
                                            Ends (or interrupts) each post with a call to action — e.g. a soft plug for your app.
                                        </p>
                                        <Toggle
                                            on={!!auto.cta?.enabled}
                                            onChange={() => update({ cta: { ...auto.cta, enabled: !auto.cta?.enabled } })}
                                            title="Enable CTA slide"
                                        />
                                    </div>
                                    {auto.cta?.enabled ? (
                                        <div className="bg-muted border border-border rounded-lg p-3 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong whitespace-nowrap shrink-0">CTA</span>
                                                <select
                                                    value={auto.cta?.position ?? 'last'}
                                                    onChange={(e) => update({
                                                        cta: { ...auto.cta, position: e.target.value === 'last' ? 'last' : Number(e.target.value) },
                                                    })}
                                                    className="input-field w-auto text-xs py-1"
                                                >
                                                    <option value="last">Position: last</option>
                                                    {slideNumbers.map((n) => (
                                                        <option key={n} value={n}>Position: slide {n}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <input
                                                value={auto.cta?.direction || ''}
                                                onChange={(e) => update({ cta: { ...auto.cta, direction: e.target.value } })}
                                                placeholder="e.g. soft CTA to track your lifts with the Evex app"
                                                className="input-field w-full text-sm"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Uses the default image unless an image override targets its slide.
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground bg-muted border border-border rounded-lg p-3">
                                            CTA slide is off — posts end on the last content slide.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        )}

                        {/* History — past generations for this automation */}
                        {tab === 'history' && (
                            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-foreground">Past generations</h2>
                                    <p className="text-xs text-muted-foreground">{history.length} saved to Library</p>
                                </div>
                                {history.length === 0 ? (
                                    <p className="text-sm text-muted-foreground bg-muted border border-border rounded-lg p-4 text-center">
                                        Nothing yet — hit &ldquo;Generate test post&rdquo; to make the first one.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                                        {history.map((c, i) => (
                                            <button
                                                key={c.id}
                                                onClick={() => { setViewerFresh(false); setViewerIdx(i); }}
                                                className="text-left border border-border rounded-xl p-2.5 hover:border-primary/60 transition-colors"
                                            >
                                                <div className="aspect-[9/16] rounded-lg overflow-hidden bg-black mb-2">
                                                    {c.image_paths?.[0] && (
                                                        <img src={getApiUrl(c.image_paths[0])} alt="" className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                                <p className="text-xs font-medium text-foreground truncate">{c.title || 'Generation'}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                                    {c.created_at
                                                        ? new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
                                                        : ''}
                                                    {c.status === 'published' && (
                                                        <span className="font-medium px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-700">Posted</span>
                                                    )}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Settings — schedule, posting account & copy, manage */}
                        {tab === 'settings' && (
                        <>
                        {/* Schedule */}
                        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Posting times</h2>
                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                                        <Clock size={12} />
                                        {(auto.schedule?.times || []).length}× per day · {perWeek}/week
                                    </p>
                                </div>
                                <select
                                    value={auto.schedule?.timezone || 'UTC'}
                                    onChange={(e) => update({ schedule: { ...auto.schedule, timezone: e.target.value } })}
                                    className="input-field text-xs w-auto py-1.5"
                                >
                                    {[...new Set([auto.schedule?.timezone || 'UTC', ...TIMEZONES])].map((tz) => (
                                        <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                {(auto.schedule?.times || []).map((t, i) => (
                                    <div key={i} className="flex flex-wrap items-center gap-2 bg-muted border border-border rounded-lg p-2.5">
                                        <input
                                            type="time"
                                            value={t.time}
                                            onChange={(e) => setTime(i, { time: e.target.value })}
                                            className="input-field w-auto text-sm py-1.5"
                                        />
                                        <div className="flex gap-1 flex-1">
                                            {DAY_LETTERS.map((d, day) => {
                                                const on = (t.days || []).includes(day);
                                                return (
                                                    <button
                                                        key={d}
                                                        onClick={() => toggleDay(i, day)}
                                                        className={`w-8 h-8 text-xs font-medium rounded-lg border transition-colors ${
                                                            on
                                                                ? 'border-primary bg-primary/10 text-primary-strong'
                                                                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                                                        }`}
                                                    >
                                                        {d}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <button
                                            onClick={() => removeTime(i)}
                                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card rounded-lg transition-colors"
                                            title="Remove posting time"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={addTime}
                                className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted border border-dashed border-border rounded-lg py-2.5 transition-colors"
                            >
                                <Plus size={14} /> Add posting time
                            </button>
                        </div>

                        {/* TikTok */}
                        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">TikTok posting</h2>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Scheduled runs generate into your Library; turn on auto-post to publish via
                                        Upload-Post. Headless runs use the server keys in <code>.env.local</code>.
                                    </p>
                                </div>
                                <Toggle
                                    on={!!auto.tiktok?.auto_post}
                                    onChange={() => update({ tiktok: { ...auto.tiktok, auto_post: !auto.tiktok?.auto_post } })}
                                    title="Auto-post"
                                />
                            </div>

                            <div>
                                <label className={`${label} block mb-2`}>TikTok account (Upload-Post profile)</label>
                                {connectedProfiles.length > 0 ? (
                                    <select
                                        value={auto.tiktok?.user_id || ''}
                                        onChange={(e) => update({ tiktok: { ...auto.tiktok, user_id: e.target.value } })}
                                        className="input-field w-full"
                                    >
                                        <option value="">No account</option>
                                        {connectedProfiles.map((p) => (
                                            <option key={p.username} value={p.username}>{p.username}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <p className="text-xs text-muted-foreground bg-muted border border-border rounded-lg p-3">
                                        No connected TikTok profiles — connect Upload-Post in Settings first.
                                    </p>
                                )}
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4">
                                {[
                                    { key: 'title', modeKey: 'title_mode', name: 'Post title' },
                                    { key: 'caption', modeKey: 'caption_mode', name: 'Caption' },
                                ].map(({ key, modeKey, name }) => (
                                    <div key={key} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className={label}>{name}</label>
                                            <SegmentedPair
                                                value={auto.tiktok?.[modeKey] || 'prompt'}
                                                options={[
                                                    { value: 'prompt', label: 'AI prompt' },
                                                    { value: 'static', label: 'Static' },
                                                ]}
                                                onChange={(v) => update({ tiktok: { ...auto.tiktok, [modeKey]: v } })}
                                            />
                                        </div>
                                        <textarea
                                            value={auto.tiktok?.[key] || ''}
                                            onChange={(e) => update({ tiktok: { ...auto.tiktok, [key]: e.target.value } })}
                                            rows={2}
                                            placeholder={
                                                (auto.tiktok?.[modeKey] || 'prompt') === 'prompt'
                                                    ? `Instruction for the AI, e.g. ${key === 'title' ? 'title-case the hook' : '3-5 broad lowercase hashtags'}`
                                                    : `Exact ${name.toLowerCase()} used on every post`
                                            }
                                            className="input-field w-full resize-y text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Manage */}
                        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                            <h2 className="text-lg font-semibold text-foreground">Manage</h2>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={duplicateAutomation}
                                    className="flex items-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
                                >
                                    <Copy size={14} /> Duplicate automation
                                </button>
                                <button
                                    onClick={deleteAutomation}
                                    className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
                                >
                                    <Trash2 size={14} /> Delete automation
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Duplicating saves your edits and creates a paused copy. Deleting removes the
                                automation and its schedule — generated slideshows stay in your Library.
                            </p>
                        </div>
                        </>
                        )}
                    </div>

                    {/* Preview / generate column */}
                    <div className="lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto custom-scrollbar space-y-3">
                        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                            {/* Preview header: filmstrip ↔ grid layout toggle */}
                            <div className="flex items-center justify-between">
                                <p className={label}>Preview</p>
                                <div className="flex items-center gap-0.5 bg-muted border border-border rounded-lg p-0.5">
                                    <button
                                        onClick={() => setViewLayout('strip')}
                                        className={`p-1.5 rounded-md transition-colors ${viewLayout === 'strip' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        title="Slide view"
                                    >
                                        <GalleryHorizontal size={14} />
                                    </button>
                                    <button
                                        onClick={() => setViewLayout('grid')}
                                        className={`p-1.5 rounded-md transition-colors ${viewLayout === 'grid' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        title="Grid view"
                                    >
                                        <LayoutGrid size={14} />
                                    </button>
                                </div>
                            </div>

                            {viewLayout === 'strip' ? (
                                <div className="relative">
                                    <div
                                        ref={stripRef}
                                        onScroll={onStripScroll}
                                        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide px-[11%]"
                                    >
                                        {planSlides.map((s, i) => (
                                            <div key={i} className="w-[78%] shrink-0 snap-center">
                                                <p className={`text-xs text-center mb-1.5 truncate transition-colors ${i === previewIndex ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                                    {s.label}
                                                </p>
                                                <div
                                                    onClick={() => setPreviewIndex(i)}
                                                    className={`aspect-[9/16] rounded-xl overflow-hidden relative bg-black transition-opacity ${i === previewIndex ? '' : 'opacity-50 cursor-pointer hover:opacity-75'}`}
                                                >
                                                    <PlanSlide slide={s} textStyle={textStyle} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {slideCount > 1 && (
                                        <>
                                            <button
                                                onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
                                                disabled={previewIndex === 0}
                                                className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-card/90 border border-border text-foreground shadow-sm disabled:opacity-30"
                                            >
                                                <ChevronLeft size={16} />
                                            </button>
                                            <button
                                                onClick={() => setPreviewIndex((p) => Math.min(slideCount - 1, p + 1))}
                                                disabled={previewIndex >= slideCount - 1}
                                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-card/90 border border-border text-foreground shadow-sm disabled:opacity-30"
                                            >
                                                <ChevronRight size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-2">
                                    {planSlides.map((s, i) => (
                                        <button
                                            key={i}
                                            onClick={() => { setPreviewIndex(i); setViewLayout('strip'); }}
                                            title={s.label}
                                            className={`aspect-[9/16] rounded-lg overflow-hidden relative bg-black border transition-colors ${
                                                i === Math.min(previewIndex, slideCount - 1)
                                                    ? 'border-primary ring-1 ring-primary/40'
                                                    : 'border-border hover:border-primary/60'
                                            }`}
                                        >
                                            <PlanSlide slide={s} textStyle={textStyle} compact />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {viewLayout === 'strip' && (
                                <div className="flex items-center justify-center gap-1.5">
                                    {Array.from({ length: slideCount }, (_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setPreviewIndex(i)}
                                            className={`w-1.5 h-1.5 rounded-full transition-colors ${i === Math.min(previewIndex, slideCount - 1) ? 'bg-primary' : 'bg-border'}`}
                                            aria-label={`Slide ${i + 1}`}
                                        />
                                    ))}
                                </div>
                            )}

                            <p className="text-xs text-muted-foreground text-center truncate">
                                Plan · {countLabel}
                                {content.numbering ? ' · numbered' : ''}
                                {auto.cta?.enabled
                                    ? ` · CTA ${auto.cta?.position === 'last' || !auto.cta?.position ? 'last' : `#${auto.cta.position}`}`
                                    : ''}
                            </p>

                            {/* Text style — reflected live in the preview above */}
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                <div>
                                    <label className={`${label} block mb-1`}>Style</label>
                                    <select
                                        value={textStyle.style}
                                        onChange={(e) => setTextStyle({ style: e.target.value })}
                                        className="input-field w-full text-xs py-1.5"
                                    >
                                        <option value="outline">Outlined text</option>
                                        <option value="white">White text</option>
                                        <option value="white_bg">White box</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={`${label} block mb-1`}>Width</label>
                                    <select
                                        value={textStyle.width}
                                        onChange={(e) => setTextStyle({ width: Number(e.target.value) })}
                                        className="input-field w-full text-xs py-1.5"
                                    >
                                        {[60, 70, 80, 90, 100].map((w) => (
                                            <option key={w} value={w}>{w}%</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={`${label} block mb-1`}>Size</label>
                                    <SegmentedPair
                                        value={textStyle.size}
                                        options={[
                                            { value: 'sm', label: 'S' },
                                            { value: 'md', label: 'M' },
                                            { value: 'lg', label: 'L' },
                                        ]}
                                        onChange={(v) => setTextStyle({ size: v })}
                                    />
                                </div>
                                <div>
                                    <label className={`${label} block mb-1`}>Position</label>
                                    <SegmentedPair
                                        value={textStyle.position}
                                        options={[
                                            { value: 'top', label: 'Top' },
                                            { value: 'center', label: 'Mid' },
                                            { value: 'bottom', label: 'Low' },
                                        ]}
                                        onChange={(v) => setTextStyle({ position: v })}
                                    />
                                </div>
                            </div>

                            <button
                                onClick={generateNow}
                                disabled={generating}
                                className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2.5 disabled:opacity-50"
                            >
                                {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                {generating ? 'Generating…' : 'Generate test post'}
                            </button>
                            <p className="text-xs text-muted-foreground text-center">
                                {mock
                                    ? 'Mock mode — placeholder images, no API cost.'
                                    : 'Runs this recipe once and saves the post to your Library. Doesn’t publish to TikTok.'}
                            </p>

                        </div>
                    </div>
                </div>
            </div>

            <GenerationViewer
                history={history}
                index={viewerIdx}
                fresh={viewerFresh}
                onNavigate={(i) => { setViewerFresh(false); setViewerIdx(i); }}
                onClose={() => setViewerIdx(null)}
            />

            <CollectionPickerModal
                open={pickerTarget !== null}
                selectedId={
                    pickerTarget === 'hook'
                        ? auto.hook_image?.collection_id
                        : pickerTarget === 'default'
                            ? auto.image_default?.collection_id
                            : typeof pickerTarget === 'number'
                                ? auto.image_overrides[pickerTarget]?.collection_id
                                : undefined
                }
                onPick={(coll) => {
                    if (pickerTarget === 'hook') {
                        update({ hook_image: { ...auto.hook_image, source: 'collection', collection_id: coll.id } });
                    } else if (pickerTarget === 'default') {
                        update({ image_default: { ...auto.image_default, source: 'collection', collection_id: coll.id } });
                    } else if (typeof pickerTarget === 'number') {
                        setImageOverride(pickerTarget, { source: 'collection', collection_id: coll.id });
                    }
                    setPickerTarget(null);
                    fetch(getApiUrl('/api/collections'))
                        .then((r) => r.json())
                        .then((d) => setCollections(d.collections || []))
                        .catch(() => {});
                }}
                onClose={() => {
                    setPickerTarget(null);
                    fetch(getApiUrl('/api/collections'))
                        .then((r) => r.json())
                        .then((d) => setCollections(d.collections || []))
                        .catch(() => {});
                }}
            />
        </div>
    );
}
