import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Trash2, Wand2, Shuffle, Pencil, ArrowLeft, Sparkles, Users } from 'lucide-react';
import { getApiUrl } from '../config';

// Reusable AI characters (ReelFarm-style): identity attributes → portrait →
// consistent "looks" generated with the portrait as a reference image.

const DEFAULT_ATTRS = { gender: 'Female', age_range: '25-30', ethnicity: 'Ambiguous', hair: 'Medium', style: 'Casual', extra: '' };

function ChipRow({ label, options, value, onChange }) {
    return (
        <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">{label}</label>
            <div className="flex flex-wrap gap-2">
                {options.map((opt) => (
                    <button
                        key={opt}
                        onClick={() => onChange(opt)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${value === opt
                            ? 'border-primary bg-primary/10 text-primary-strong font-medium'
                            : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default function CharactersTab({ geminiApiKey, debug }) {
    const [characters, setCharacters] = useState([]);
    const [schema, setSchema] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [mode, setMode] = useState('list'); // list | new
    const [attrs, setAttrs] = useState(DEFAULT_ATTRS);
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const [lookPrompt, setLookPrompt] = useState('');
    const [generatingLook, setGeneratingLook] = useState(false);
    const [error, setError] = useState('');
    const mock = !!debug?.mockAI || !geminiApiKey;

    const load = useCallback(() => {
        fetch(getApiUrl('/api/characters'))
            .then((r) => r.json())
            .then((d) => setCharacters(d.characters || []))
            .catch(() => setError('Could not load characters.'));
    }, []);

    useEffect(() => {
        load();
        fetch(getApiUrl('/api/characters/schema'))
            .then((r) => r.json())
            .then((d) => setSchema(d.schema))
            .catch(() => { /* chips fall back to defaults */ });
    }, [load]);

    const selected = characters.find((c) => c.id === selectedId) || null;

    const randomize = () => {
        if (!schema) return;
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        setAttrs((p) => ({
            ...p,
            gender: pick(schema.gender),
            age_range: pick(schema.age_range),
            ethnicity: pick(schema.ethnicity),
            hair: pick(schema.hair),
            style: pick(schema.style),
        }));
    };

    const createCharacter = async () => {
        setCreating(true);
        setError('');
        try {
            const res = await fetch(getApiUrl('/api/characters'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}) },
                body: JSON.stringify({ name: name || 'New character', attributes: attrs, mock }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setMode('list');
            setName('');
            setAttrs(DEFAULT_ATTRS);
            load();
            setSelectedId(data.character.id);
        } catch (e) {
            setError(`Create failed: ${e.message}`);
        } finally {
            setCreating(false);
        }
    };

    const generateLook = async () => {
        if (!selected || !lookPrompt.trim()) return;
        setGeneratingLook(true);
        setError('');
        try {
            const res = await fetch(getApiUrl(`/api/characters/${selected.id}/looks`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}) },
                body: JSON.stringify({ prompt: lookPrompt, mock }),
            });
            if (!res.ok) throw new Error(await res.text());
            setLookPrompt('');
            load();
        } catch (e) {
            setError(`Look generation failed: ${e.message}`);
        } finally {
            setGeneratingLook(false);
        }
    };

    const randomScene = async () => {
        try {
            const res = await fetch(getApiUrl('/api/characters/schema'));
            const d = await res.json();
            if (d.random_scene) setLookPrompt(d.random_scene);
        } catch { /* ignore */ }
    };

    const deleteCharacter = async (id) => {
        if (!window.confirm('Delete this character and all their looks?')) return;
        await fetch(getApiUrl(`/api/characters/${id}`), { method: 'DELETE' });
        if (selectedId === id) setSelectedId(null);
        load();
    };

    const deleteLook = async (lookId) => {
        if (!selected) return;
        await fetch(getApiUrl(`/api/characters/${selected.id}/looks/${lookId}`), { method: 'DELETE' });
        load();
    };

    // ---- New character editor ----
    if (mode === 'new') {
        return (
            <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
                <div className="max-w-3xl mx-auto space-y-6">
                    <button onClick={() => setMode('list')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft size={16} /> Characters
                    </button>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">New character</h1>
                            <p className="text-sm text-muted-foreground mt-1">Pick an identity — the portrait becomes the reference every look is generated from.</p>
                        </div>
                        <button onClick={randomize} className="flex items-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-4 py-2.5 text-sm font-medium transition-colors">
                            <Shuffle size={15} /> Randomize
                        </button>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
                        {schema && (
                            <>
                                <ChipRow label="Gender" options={schema.gender} value={attrs.gender} onChange={(v) => setAttrs((p) => ({ ...p, gender: v }))} />
                                <ChipRow label="Age" options={schema.age_range} value={attrs.age_range} onChange={(v) => setAttrs((p) => ({ ...p, age_range: v }))} />
                                <ChipRow label="Ethnicity" options={schema.ethnicity} value={attrs.ethnicity} onChange={(v) => setAttrs((p) => ({ ...p, ethnicity: v }))} />
                                <ChipRow label="Hair" options={schema.hair} value={attrs.hair} onChange={(v) => setAttrs((p) => ({ ...p, hair: v }))} />
                                <ChipRow label="Style" options={schema.style} value={attrs.style} onChange={(v) => setAttrs((p) => ({ ...p, style: v }))} />
                            </>
                        )}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Extra details <span className="normal-case font-normal">(optional)</span></label>
                            <input value={attrs.extra} onChange={(e) => setAttrs((p) => ({ ...p, extra: e.target.value }))}
                                placeholder="bald guy wearing a suit, freckles, glasses…" className="input-field" />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Name</label>
                            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gym girl Mia" className="input-field" />
                        </div>
                        {error && <p className="text-sm text-red-700">{error}</p>}
                        <button onClick={createCharacter} disabled={creating} className="btn-primary w-full flex items-center justify-center gap-2">
                            {creating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                            {creating ? 'Generating portrait…' : mock ? 'Generate portrait (mock)' : 'Generate portrait & save'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ---- List + detail ----
    return (
        <div className="h-full flex animate-[fadeIn_0.3s_ease-out]">
            {/* Character list */}
            <div className="w-72 shrink-0 border-r border-border bg-surface/50 p-4 space-y-3 overflow-y-auto custom-scrollbar">
                <h2 className="text-sm font-bold text-foreground">AI Characters</h2>
                <button onClick={() => { setMode('new'); setError(''); }} className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2">
                    <Plus size={16} /> New Character
                </button>
                {characters.map((c) => (
                    <button
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors ${selectedId === c.id
                            ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted'}`}
                    >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                            {c.portrait_path && <img src={getApiUrl(c.portrait_path)} alt={c.name} className="w-full h-full object-cover" />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.attributes?.gender} · {c.attributes?.age_range}</p>
                        </div>
                    </button>
                ))}
                {characters.length === 0 && (
                    <p className="text-xs text-muted-foreground leading-relaxed pt-2">
                        No characters yet. Create one — then reuse it across hook demos, videos, and slideshows.
                    </p>
                )}
            </div>

            {/* Detail */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative">
                {!selected ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-3">
                        <Users size={40} className="text-muted-foreground" />
                        <h1 className="text-xl font-bold text-foreground">Reusable AI characters</h1>
                        <p className="text-sm text-muted-foreground max-w-sm">
                            One identity, many looks — pick a character on the left, or create a new one to keep your UGC consistent across every post.
                        </p>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto space-y-6 pb-32">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-12 h-12 rounded-full overflow-hidden bg-muted shrink-0">
                                    {selected.portrait_path && <img src={getApiUrl(selected.portrait_path)} alt={selected.name} className="w-full h-full object-cover" />}
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-xl font-bold text-foreground truncate flex items-center gap-2">
                                        {selected.name} <Pencil size={13} className="text-muted-foreground shrink-0" />
                                    </h1>
                                    <p className="text-xs text-muted-foreground">{selected.attributes?.gender} · {selected.attributes?.age_range} · {selected.looks.length} looks</p>
                                </div>
                            </div>
                            <button onClick={() => deleteCharacter(selected.id)} className="text-muted-foreground hover:text-red-700 transition-colors p-2 rounded-lg hover:bg-muted" title="Delete character">
                                <Trash2 size={17} />
                            </button>
                        </div>

                        {/* Looks gallery (portrait always first) */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            <div className="relative bg-black rounded-xl overflow-hidden aspect-[9/16]">
                                {selected.portrait_path && <img src={getApiUrl(selected.portrait_path)} alt="Portrait" className="w-full h-full object-cover" />}
                                <span className="absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong backdrop-blur-sm">Portrait</span>
                            </div>
                            {selected.looks.map((look) => (
                                <div key={look.id} className="group relative bg-black rounded-xl overflow-hidden aspect-[9/16]">
                                    <img src={getApiUrl(look.image_path)} alt={look.prompt} className="w-full h-full object-cover" />
                                    <button onClick={() => deleteLook(look.id)}
                                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white/80 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Delete look">
                                        <Trash2 size={13} />
                                    </button>
                                    <p className="absolute bottom-0 inset-x-0 text-[10px] text-white/90 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 line-clamp-2">{look.prompt}</p>
                                </div>
                            ))}
                        </div>
                        {selected.looks.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">No looks yet — use the prompt below to generate images of {selected.name} in new scenes, poses, and outfits.</p>
                        )}
                        {error && <p className="text-sm text-red-700">{error}</p>}

                        {/* Prompt bar (ReelFarm-style, floating) */}
                        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-20" style={{ marginLeft: '2rem' }}>
                            <div className="bg-card border border-border rounded-2xl shadow-lg p-3 space-y-2.5">
                                <input
                                    value={lookPrompt}
                                    onChange={(e) => setLookPrompt(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') generateLook(); }}
                                    placeholder="Describe a scene, pose, outfit… or click Random"
                                    className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none px-1"
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <button onClick={randomScene} className="flex items-center gap-1.5 text-xs font-medium bg-card border border-border text-foreground hover:bg-muted rounded-lg px-3 py-2 transition-colors">
                                        <Shuffle size={13} /> Random
                                    </button>
                                    <button onClick={generateLook} disabled={generatingLook || !lookPrompt.trim()}
                                        className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
                                        {generatingLook ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                        {mock ? 'Generate (mock)' : 'Generate'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
