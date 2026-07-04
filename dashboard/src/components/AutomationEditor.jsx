import { useState, useEffect, useCallback, useRef } from 'react';
import {
    ArrowLeft, Sparkles, Wand2, Loader2, Plus, Trash2, X, Play, Pause,
    ChevronLeft, ChevronRight, Images, Clock,
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

function SegmentedPair({ value, options, onChange }) {
    return (
        <div
            className="grid bg-muted rounded-lg p-0.5 text-xs font-medium"
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        >
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`px-2 py-1 rounded-md transition-colors ${
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
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-primary' : 'bg-border'}`}
            role="switch"
            aria-checked={!!on}
            title={title}
        >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        </button>
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
                    className="w-full flex items-center gap-2 bg-card border border-border text-sm rounded-xl px-3 py-2.5 hover:bg-muted transition-colors text-left"
                >
                    <Images size={14} className="text-muted-foreground shrink-0" />
                    {coll ? (
                        <span className="text-foreground truncate">
                            {coll.name} <span className="text-muted-foreground">· {coll.images.length} photos</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">Pick a photo collection…</span>
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

export default function AutomationEditor({ automationId, geminiApiKey, userProfiles, debug, onBack }) {
    const [auto, setAuto] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedNote, setSavedNote] = useState('');
    const [dirty, setDirty] = useState(false);
    const [hooksBusy, setHooksBusy] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState(null);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [collections, setCollections] = useState([]);
    const [pickerTarget, setPickerTarget] = useState(null); // 'hook' | slide index

    const mock = !!debug?.mockAI || !geminiApiKey;

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
        setResult(null);
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
            setResult(data);
            setPreviewIndex(0);
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
    const previewImages = result?.images || [];
    const connectedProfiles = (userProfiles || []).filter((p) => p.connected?.includes('tiktok'));
    const content = auto.content || {};
    const maxContent = content.count_mode === 'vary' ? (content.count_max ?? 6) : (content.slide_count ?? 4);
    const totalSlides = 1 + Number(maxContent || 4) + (auto.cta?.enabled ? 1 : 0);
    const slideNumbers = Array.from({ length: Math.max(totalSlides - 1, 1) }, (_, i) => i + 2);
    const countLabel = content.count_mode === 'vary'
        ? `${content.count_min ?? 3}–${content.count_max ?? 6} content slides`
        : `${content.slide_count ?? 4} content slides`;

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft size={16} /> All automations
                    </button>
                    <div className="flex items-center gap-3">
                        {savedNote && <span className="text-xs font-medium text-green-700">{savedNote}</span>}
                        {error && <span className="text-xs font-medium text-red-700 max-w-xs truncate">{error}</span>}
                        <button
                            onClick={() => update({ status: auto.status === 'active' ? 'paused' : 'active' })}
                            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                                auto.status === 'active'
                                    ? 'bg-green-500/10 text-green-700 border-green-500/20'
                                    : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                            }`}
                        >
                            {auto.status === 'active' ? <Pause size={12} /> : <Play size={12} />}
                            {auto.status === 'active' ? 'Active' : 'Paused'}
                        </button>
                        <button
                            onClick={() => save()}
                            disabled={saving || !dirty}
                            className="btn-primary text-sm px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
                    <div className="space-y-6">
                        {/* Content */}
                        <div className="bg-card border border-border rounded-xl p-5 space-y-5">
                            <h2 className="text-lg font-semibold text-foreground">Content</h2>
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
                                    onChange={(e) => update({ tone_preset: e.target.value })}
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

                        {/* Slides */}
                        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">Slides</h2>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Slide 1 is always the intro (from your hook bank). The AI writes the rest
                                    from your instructions — add an override only where a slide needs specifics.
                                </p>
                            </div>

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
                                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
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
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong">Override</span>
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

                            {/* CTA */}
                            <div className="bg-muted border border-border rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-semibold text-foreground">CTA slide</span>
                                        {auto.cta?.enabled && (
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
                                        )}
                                    </div>
                                    <Toggle
                                        on={!!auto.cta?.enabled}
                                        onChange={() => update({ cta: { ...auto.cta, enabled: !auto.cta?.enabled } })}
                                        title="Enable CTA slide"
                                    />
                                </div>
                                {auto.cta?.enabled && (
                                    <input
                                        value={auto.cta?.direction || ''}
                                        onChange={(e) => update({ cta: { ...auto.cta, direction: e.target.value } })}
                                        placeholder="e.g. soft CTA to track your lifts with the Evex app"
                                        className="input-field w-full text-sm"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Images */}
                        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">Images</h2>
                                <p className="text-xs text-muted-foreground mt-1">
                                    A default for every slide, plus per-slide overrides (AI prompt · collection · a specific pinned image).
                                </p>
                            </div>

                            <div className="bg-muted border border-border rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong">Hook</span>
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

                            <div className="bg-muted border border-border rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-foreground">Default for all other slides</span>
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
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong">Image override</span>
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
                        </div>

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
                                <button
                                    onClick={() => update({ tiktok: { ...auto.tiktok, auto_post: !auto.tiktok?.auto_post } })}
                                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${auto.tiktok?.auto_post ? 'bg-primary' : 'bg-border'}`}
                                    role="switch"
                                    aria-checked={!!auto.tiktok?.auto_post}
                                    title="Auto-post"
                                >
                                    <span
                                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform ${auto.tiktok?.auto_post ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
                                    />
                                </button>
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
                    </div>

                    {/* Preview / generate column */}
                    <div className="lg:sticky lg:top-0 space-y-3">
                        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                            <button
                                onClick={generateNow}
                                disabled={generating}
                                className="btn-primary w-full flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                            >
                                {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                {generating ? 'Generating…' : 'Generate now'}
                            </button>
                            {mock && (
                                <p className="text-xs text-muted-foreground text-center">
                                    Mock mode — placeholder images, no API cost.
                                </p>
                            )}

                            <div className={`aspect-[9/16] rounded-xl overflow-hidden relative ${previewImages.length > 0 ? 'bg-black' : 'bg-muted border border-border'}`}>
                                {previewImages.length > 0 ? (
                                    <>
                                        <img
                                            src={getApiUrl(previewImages[previewIndex])}
                                            alt={`Slide ${previewIndex + 1}`}
                                            className="w-full h-full object-contain"
                                        />
                                        {previewImages.length > 1 && (
                                            <>
                                                <button
                                                    onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
                                                    disabled={previewIndex === 0}
                                                    className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-card/80 text-foreground disabled:opacity-30"
                                                >
                                                    <ChevronLeft size={16} />
                                                </button>
                                                <button
                                                    onClick={() => setPreviewIndex((p) => Math.min(previewImages.length - 1, p + 1))}
                                                    disabled={previewIndex === previewImages.length - 1}
                                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-card/80 text-foreground disabled:opacity-30"
                                                >
                                                    <ChevronRight size={16} />
                                                </button>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-5 text-center">
                                        <p className="text-xs text-muted-foreground">
                                            {(auto.hooks || []).filter((h) => h.trim()).length > 0
                                                ? `Slide 1: “${(auto.hooks.find((h) => h.trim()) || '').slice(0, 60)}”`
                                                : 'Add hooks and instructions, then generate a preview.'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {countLabel}
                                            {content.numbering ? ' · numbered' : ''}
                                            {auto.cta?.enabled
                                                ? ` + CTA (${auto.cta?.position === 'last' || !auto.cta?.position ? 'last' : `slide ${auto.cta.position}`})`
                                                : ''}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {previewImages.length > 0 && (
                                <div className="flex items-center justify-center gap-1.5">
                                    {previewImages.map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setPreviewIndex(i)}
                                            className={`w-1.5 h-1.5 rounded-full transition-colors ${i === previewIndex ? 'bg-primary' : 'bg-border'}`}
                                            aria-label={`Slide ${i + 1}`}
                                        />
                                    ))}
                                </div>
                            )}

                            {result && (
                                <p className="text-xs text-green-700 text-center">Saved to Library.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

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
