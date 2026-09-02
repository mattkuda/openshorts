import React, { useState } from 'react';
import { ArrowLeft, Plus, X, Loader2, Image as ImageIcon, Layers, Terminal, Check, Trash2 } from 'lucide-react';
import { getApiUrl } from '../config';

const label = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';

const TONE_OPTIONS = [
    { value: 'conversational', label: 'Conversational & Relatable' },
    { value: 'motivational', label: 'Motivational & Empowering' },
    { value: 'educational', label: 'Educational & Informative' },
    { value: 'bold', label: 'Bold & Provocative' },
    { value: 'calm', label: 'Calm & Reflective' },
    { value: 'witty', label: 'Witty & Humorous' },
];

const STYLE_PRESETS = [
    { key: 'impact', label: 'Impact', desc: 'Bold condensed uppercase, accent-colored key words, SAVE badge. Loud, save-bait, fitness-native.' },
    { key: 'minimal', label: 'Minimal', desc: 'Centered sentence-case, bold keywords, lots of whitespace. Calmer, generalizes past fitness.' },
];

const RENDER_MODE_OPTIONS = [
    { key: 'typeset', label: 'Typeset' },
    { key: 'ai_full', label: 'Full AI' },
];

const ACCENT_PRESETS = ['#00C080', '#E08A00', '#7C3AED', '#EF4444', '#2563EB', '#111111'];

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

// Shared thumbnail-grid picker used for both the primary character and the
// optional female-mascot override below it.
function CharacterGrid({ characters, selectedId, onSelect, allowNone }) {
    return (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {allowNone && (
                <button
                    onClick={() => onSelect('')}
                    className={`rounded-xl border p-1.5 flex flex-col items-center gap-1.5 transition-colors ${
                        !selectedId ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/60'
                    }`}
                    title="None"
                >
                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                        <X size={16} className="text-muted-foreground" />
                    </div>
                    <span className="text-[10px] text-foreground truncate w-full text-center">None</span>
                </button>
            )}
            {characters.map((c) => (
                <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className={`rounded-xl border p-1.5 flex flex-col items-center gap-1.5 transition-colors ${
                        selectedId === c.id ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/60'
                    }`}
                    title={c.name}
                >
                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted">
                        {c.portrait_path && <img src={getApiUrl(c.portrait_path)} alt={c.name} className="w-full h-full object-cover" />}
                    </div>
                    <span className="text-[10px] text-foreground truncate w-full text-center">{c.name}</span>
                </button>
            ))}
        </div>
    );
}

function topicBankToSections(bank) {
    const entries = Object.entries(bank || {});
    if (entries.length === 0) return [{ category: 'General', text: '' }];
    return entries.map(([category, topics]) => ({ category, text: (topics || []).join('\n') }));
}

function sectionsToTopicBank(sections) {
    const bank = {};
    sections.forEach((s) => {
        const cat = s.category.trim();
        if (!cat) return;
        bank[cat] = s.text.split('\n').map((t) => t.trim()).filter(Boolean);
    });
    return bank;
}

function makeDefaultSeries() {
    return {
        name: 'New series',
        character_id: '',
        female_character_id: '',
        style_key: 'impact',
        render_mode: 'typeset',
        accent_hex: '#00C080',
        niche: '',
        tone: 'conversational',
        topic_bank: {},
        used_topics: [],
        slide_min: 4,
        slide_max: 6,
        plug: { app_name: '', pitch: '', frequency: 'every_deck', position: 'late', screenshots: [] },
        caption_cfg: { enabled: true },
    };
}

export default function CharShowSeriesEditor({
    initialSeries, characters, onSave, onCancel,
    onOpenGenerate, onDeleteSeries, jobBusyForSeries, job, onDismissJob,
}) {
    const [draft, setDraft] = useState(() => ({
        ...makeDefaultSeries(),
        ...(initialSeries || {}),
        render_mode: initialSeries?.render_mode || 'typeset',
    }));
    const [sections, setSections] = useState(() => topicBankToSections(initialSeries?.topic_bank));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
    const updatePlug = (patch) => setDraft((prev) => ({ ...prev, plug: { ...prev.plug, ...patch } }));

    const setSection = (i, patch) => setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    const addSection = () => setSections((prev) => [...prev, { category: '', text: '' }]);
    const removeSection = (i) => setSections((prev) => prev.filter((_, idx) => idx !== i));

    const save = async () => {
        if (!draft.name.trim()) { setError('Give the series a name.'); return; }
        if (!draft.character_id) { setError('Pick a character.'); return; }
        setSaving(true);
        setError('');
        try {
            await onSave({ ...draft, topic_bank: sectionsToTopicBank(sections) });
        } catch (e) {
            setError(e.message || 'Save failed.');
        } finally {
            setSaving(false);
        }
    };

    const screenshots = draft.plug?.screenshots || [];

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <button onClick={onCancel} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft size={16} /> All series
                    </button>
                    <div className="flex items-center gap-3">
                        {error && <span className="text-xs font-medium text-red-700 max-w-xs truncate">{error}</span>}
                        {initialSeries?.id && (
                            <>
                                <button
                                    onClick={() => onOpenGenerate(initialSeries)}
                                    disabled={jobBusyForSeries}
                                    className="flex items-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    {jobBusyForSeries ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
                                    Generate
                                </button>
                                <button
                                    onClick={() => onDeleteSeries(initialSeries)}
                                    className="p-2.5 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors"
                                    title="Delete series"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </>
                        )}
                        <button onClick={save} disabled={saving} className="btn-primary text-sm px-7 py-2.5 disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save series'}
                        </button>
                    </div>
                </div>

                {job && (
                    <div className="bg-muted rounded-xl border border-border overflow-hidden">
                        <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-muted">
                            <span className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                                <Terminal size={12} />
                                {job.kind === 'poses' ? 'Pose pack generation' : 'Deck generation'}
                                {job.status === 'processing' && <Loader2 size={11} className="animate-spin" />}
                                {job.status === 'completed' && <Check size={11} className="text-green-700" />}
                            </span>
                            {job.status !== 'processing' && (
                                <button onClick={onDismissJob} className="text-muted-foreground hover:text-foreground transition-colors" title="Dismiss">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <div className="p-4 max-h-48 overflow-y-auto font-mono text-xs space-y-1 custom-scrollbar">
                            {job.logs.map((log, i) => (
                                <div key={i} className={log.toLowerCase().includes('error') ? 'text-red-600' : 'text-muted-foreground'}>
                                    {log}
                                </div>
                            ))}
                            {job.status === 'processing' && <div className="animate-pulse text-primary-strong/70">_</div>}
                        </div>
                    </div>
                )}

                <input
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                    className="w-full bg-transparent text-2xl font-bold text-foreground outline-none border-b border-transparent focus:border-border pb-1"
                    placeholder="Series name"
                />

                {/* Character */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                    <label className={label}>Character</label>
                    {characters.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No characters yet — create one in the Characters tab first.
                        </p>
                    ) : (
                        <>
                            <CharacterGrid
                                characters={characters}
                                selectedId={draft.character_id}
                                onSelect={(id) => update({ character_id: id })}
                            />
                            <div className="pt-3 border-t border-border">
                                <label className={`${label} block mb-2`}>Female mascot (optional)</label>
                                <CharacterGrid
                                    characters={characters}
                                    selectedId={draft.female_character_id || ''}
                                    onSelect={(id) => update({ female_character_id: id })}
                                    allowNone
                                />
                                <p className="text-xs text-muted-foreground mt-2">Topics tagged @women render with this mascot.</p>
                            </div>
                        </>
                    )}
                </div>

                {/* Style preset + accent */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-5">
                    <div>
                        <label className={`${label} block mb-2`}>Style preset</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {STYLE_PRESETS.map((p) => (
                                <button
                                    key={p.key}
                                    onClick={() => update({ style_key: p.key })}
                                    className={`text-left rounded-xl border p-3 transition-colors ${
                                        draft.style_key === p.key ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted'
                                    }`}
                                >
                                    <p className={`text-sm font-semibold ${draft.style_key === p.key ? 'text-primary-strong' : 'text-foreground'}`}>{p.label}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className={`${label} block mb-2`}>Render mode</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {RENDER_MODE_OPTIONS.map((m) => (
                                <button
                                    key={m.key}
                                    onClick={() => update({ render_mode: m.key })}
                                    className={`text-left rounded-xl border p-3 transition-colors ${
                                        (draft.render_mode || 'typeset') === m.key ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted'
                                    }`}
                                >
                                    <p className={`text-sm font-semibold ${(draft.render_mode || 'typeset') === m.key ? 'text-primary-strong' : 'text-foreground'}`}>{m.label}</p>
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Typeset = code-drawn text (pixel-consistent, instant edits) · Full AI = Gemini renders the whole slide (better spacing, risk of typos, edits regenerate).
                        </p>
                    </div>
                    <div>
                        <label className={`${label} block mb-2`}>Accent color</label>
                        <div className="flex items-center gap-2 flex-wrap">
                            {ACCENT_PRESETS.map((hex) => (
                                <button
                                    key={hex}
                                    onClick={() => update({ accent_hex: hex })}
                                    className={`w-7 h-7 rounded-full border-2 transition-transform ${draft.accent_hex?.toLowerCase() === hex.toLowerCase() ? 'border-foreground scale-110' : 'border-border'}`}
                                    style={{ backgroundColor: hex }}
                                    title={hex}
                                />
                            ))}
                            <input
                                value={draft.accent_hex || ''}
                                onChange={(e) => update({ accent_hex: e.target.value })}
                                placeholder="#00C080"
                                className="input-field w-28 text-sm py-1.5 font-mono"
                            />
                        </div>
                    </div>
                </div>

                {/* Niche, tone, slide count */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-5">
                    <div>
                        <label className={`${label} block mb-2`}>Niche</label>
                        <input
                            value={draft.niche || ''}
                            onChange={(e) => update({ niche: e.target.value })}
                            placeholder="e.g. gym tips for beginners"
                            className="input-field w-full"
                        />
                    </div>
                    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                        <div>
                            <label className={`${label} block mb-1.5`}>Tone</label>
                            <select value={draft.tone} onChange={(e) => update({ tone: e.target.value })} className="input-field w-56">
                                {TONE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={`${label} block mb-1.5`}>Slide count</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number" min={2} max={12}
                                    value={draft.slide_min ?? 4}
                                    onChange={(e) => update({ slide_min: Number(e.target.value) })}
                                    className="input-field w-16 text-sm py-1.5"
                                />
                                <span className="text-xs text-muted-foreground">to</span>
                                <input
                                    type="number" min={2} max={12}
                                    value={draft.slide_max ?? 6}
                                    onChange={(e) => update({ slide_max: Number(e.target.value) })}
                                    className="input-field w-16 text-sm py-1.5"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Topic bank */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                        <label className={label}>Topic bank</label>
                        <button onClick={addSection} className="flex items-center gap-1.5 text-xs font-medium text-primary-strong hover:bg-primary/10 rounded-lg px-2 py-1 transition-colors">
                            <Plus size={13} /> Add category
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground">One topic per line. Each generated deck pulls a fresh topic from these categories.</p>
                    <p className="text-xs text-muted-foreground">End a topic line with @men or @women to target it — targeted topics pick the matching mascot and flavor the copy.</p>
                    <div className="space-y-3">
                        {sections.map((s, i) => (
                            <div key={i} className="bg-muted border border-border rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        value={s.category}
                                        onChange={(e) => setSection(i, { category: e.target.value })}
                                        placeholder="Category (e.g. Belly fat)"
                                        className="input-field flex-1 text-sm py-1.5"
                                    />
                                    <button onClick={() => removeSection(i)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card rounded-lg transition-colors shrink-0" title="Remove category">
                                        <X size={14} />
                                    </button>
                                </div>
                                <textarea
                                    value={s.text}
                                    onChange={(e) => setSection(i, { text: e.target.value })}
                                    rows={3}
                                    placeholder={'lower belly fat myths\nwhy your abs aren’t showing'}
                                    className="input-field w-full resize-y text-sm font-mono"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Plug config */}
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                    <label className={label}>Plug</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground block mb-1.5">App name</label>
                            <input
                                value={draft.plug?.app_name || ''}
                                onChange={(e) => updatePlug({ app_name: e.target.value })}
                                placeholder="EVEX"
                                className="input-field w-full"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground block mb-1.5">One-line pitch</label>
                            <input
                                value={draft.plug?.pitch || ''}
                                onChange={(e) => updatePlug({ pitch: e.target.value })}
                                placeholder="the app that programs this for you"
                                className="input-field w-full"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground block mb-1.5">CTA text (optional)</label>
                        <input
                            value={draft.plug?.cta_text || ''}
                            onChange={(e) => updatePlug({ cta_text: e.target.value })}
                            placeholder="Try EVEX free for 7 days"
                            className="input-field w-full"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Shown as an accent pill on the plug slide; leave empty for no pill.</p>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground block mb-1.5">Screenshot pool</label>
                        {screenshots.length > 0 ? (
                            <div className="grid grid-cols-6 gap-1.5">
                                {screenshots.map((src, i) => (
                                    <div key={i} className="aspect-[9/16] bg-muted border border-border rounded-lg overflow-hidden">
                                        <img src={getApiUrl(src)} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted border border-border rounded-lg p-3">
                                <ImageIcon size={13} className="shrink-0" /> No screenshots yet — seeded server-side per app.
                            </p>
                        )}
                    </div>
                </div>

                {/* Caption toggle */}
                <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-foreground">Generate caption &amp; first comment</p>
                        <p className="text-xs text-muted-foreground mt-0.5">One LLM call per deck writes a TikTok caption plus your own first-comment CTA.</p>
                    </div>
                    <Toggle
                        on={draft.caption_cfg?.enabled !== false}
                        onChange={() => update({ caption_cfg: { ...draft.caption_cfg, enabled: !(draft.caption_cfg?.enabled !== false) } })}
                        title="Generate caption + first comment"
                    />
                </div>

                {saving && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 size={14} className="animate-spin" /> Saving…
                    </div>
                )}
            </div>
        </div>
    );
}
