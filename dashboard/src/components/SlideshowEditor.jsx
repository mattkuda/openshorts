import React, { useState, useEffect } from 'react';
import { ArrowLeft, Sparkles, Wand2, Loader2, CheckCircle2, Plus, Trash2, Download } from 'lucide-react';
import { getApiUrl } from '../config';

const EMPTY_SLOTS = {
    listicle: { title: '', items: [{ name: '', note: '' }, { name: '', note: '' }, { name: '', note: '' }], cta_text: '' },
    before_after: { title: '', before_text: '', after_text: '', cta_text: '' },
};

export default function SlideshowEditor({ template, geminiApiKey, debug, brand, onBack }) {
    const [slots, setSlots] = useState(() => {
        const base = JSON.parse(JSON.stringify(EMPTY_SLOTS[template.key] || {}));
        if (brand?.cta_text) base.cta_text = brand.cta_text;
        return base;
    });
    const [niche, setNiche] = useState(brand?.niche || '');
    const [filling, setFilling] = useState(false);
    const [rendering, setRendering] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [characters, setCharacters] = useState([]);
    const [characterImage, setCharacterImage] = useState('');

    useEffect(() => {
        fetch(getApiUrl('/api/characters'))
            .then((r) => r.json())
            .then((d) => setCharacters(d.characters || []))
            .catch(() => { /* characters optional */ });
    }, []);

    const isListicle = template.key === 'listicle';

    const autofill = async () => {
        setFilling(true);
        setError('');
        try {
            const res = await fetch(getApiUrl('/api/slideshow/autofill'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}) },
                body: JSON.stringify({ template_key: template.key, niche: niche || 'fitness apps', mock: !!debug?.mockAI || !geminiApiKey }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setSlots((prev) => ({ ...prev, ...data.slots }));
        } catch (e) {
            setError(`Autofill failed: ${e.message}`);
        } finally {
            setFilling(false);
        }
    };

    const render = async () => {
        if (!slots.title?.trim()) { setError('Give it a title first.'); return; }
        setRendering(true);
        setError('');
        setResult(null);
        try {
            const res = await fetch(getApiUrl('/api/slideshow/render'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template_key: template.key, slots, title: slots.title, character_image: characterImage }),
            });
            if (!res.ok) throw new Error(await res.text());
            setResult(await res.json());
        } catch (e) {
            setError(`Render failed: ${e.message}`);
        } finally {
            setRendering(false);
        }
    };

    const setItem = (i, field, value) => {
        setSlots((prev) => {
            const items = prev.items.map((it, idx) => (idx === i ? { ...it, [field]: value } : it));
            return { ...prev, items };
        });
    };

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-5xl mx-auto space-y-6">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft size={16} /> All formats
                </button>

                <div>
                    <h1 className="text-2xl font-bold text-foreground">{template.name}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                    {/* Editor */}
                    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
                        {/* Autofill row */}
                        <div className="bg-muted border border-border rounded-lg p-3 flex items-end gap-2">
                            <div className="flex-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Niche</label>
                                <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="best fitness apps" className="input-field" />
                            </div>
                            <button
                                onClick={autofill}
                                disabled={filling}
                                className="flex items-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                            >
                                {filling ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                AI fill
                            </button>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Title slide</label>
                            <input value={slots.title || ''} onChange={(e) => setSlots((p) => ({ ...p, title: e.target.value }))}
                                placeholder={isListicle ? '5 fitness apps that actually work in 2026' : '30 days of my new routine'} className="input-field" />
                        </div>

                        {isListicle ? (
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Items — last one is yours ⭐</label>
                                <div className="space-y-2">
                                    {(slots.items || []).map((item, i) => {
                                        const last = i === slots.items.length - 1;
                                        return (
                                            <div key={i} className={`flex gap-2 items-center rounded-lg border p-2 ${last ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
                                                <span className={`text-sm font-bold w-6 text-center shrink-0 ${last ? 'text-primary-strong' : 'text-muted-foreground'}`}>{i + 1}</span>
                                                <input value={item.name} onChange={(e) => setItem(i, 'name', e.target.value)} placeholder={last ? (brand?.name || 'Your app') : 'Strava'}
                                                    className="flex-1 min-w-0 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
                                                <input value={item.note} onChange={(e) => setItem(i, 'note', e.target.value)} placeholder={last ? 'the one that plans it FOR you' : 'the social one'}
                                                    className="flex-1 min-w-0 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
                                                <button onClick={() => setSlots((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }))}
                                                    disabled={slots.items.length <= 3}
                                                    className="text-muted-foreground hover:text-red-700 transition-colors disabled:opacity-30 shrink-0" title="Remove">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <button
                                    onClick={() => setSlots((p) => ({ ...p, items: [...p.items.slice(0, -1), { name: '', note: '' }, p.items[p.items.length - 1]] }))}
                                    disabled={(slots.items || []).length >= 6}
                                    className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary-strong hover:bg-primary/10 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                                >
                                    <Plus size={13} /> Add item
                                </button>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Before</label>
                                    <textarea value={slots.before_text || ''} onChange={(e) => setSlots((p) => ({ ...p, before_text: e.target.value }))}
                                        rows={2} placeholder="Guessing my workouts, skipping half the week" className="input-field resize-none" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">After</label>
                                    <textarea value={slots.after_text || ''} onChange={(e) => setSlots((p) => ({ ...p, after_text: e.target.value }))}
                                        rows={2} placeholder="A plan that adapts to me — every single day" className="input-field resize-none" />
                                </div>
                            </>
                        )}

                        {characters.length > 0 && (
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Character on title/CTA slides <span className="normal-case font-normal">(optional)</span></label>
                                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                                    {characters.flatMap((c) => [
                                        { key: `${c.id}-p`, img: c.portrait_path, label: c.name },
                                        ...c.looks.map((l) => ({ key: l.id, img: l.image_path, label: c.name })),
                                    ]).map((opt) => (
                                        <button key={opt.key} onClick={() => setCharacterImage(characterImage === opt.img ? '' : opt.img)}
                                            className={`relative shrink-0 w-12 h-12 rounded-full overflow-hidden border-2 transition-colors ${characterImage === opt.img ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/60'}`}
                                            title={opt.label}>
                                            <img src={getApiUrl(opt.img)} alt={opt.label} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">CTA slide <span className="normal-case font-normal">(optional)</span></label>
                            <input value={slots.cta_text || ''} onChange={(e) => setSlots((p) => ({ ...p, cta_text: e.target.value }))}
                                placeholder={brand?.name ? `Get ${brand.name} free` : 'Get it free — link in bio'} className="input-field" />
                        </div>

                        {error && <p className="text-sm text-red-700">{error}</p>}

                        <button onClick={render} disabled={rendering} className="btn-primary w-full flex items-center justify-center gap-2">
                            {rendering ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                            {rendering ? 'Rendering…' : result ? 'Re-render' : 'Render slideshow'}
                        </button>
                    </div>

                    {/* Result */}
                    <div className="space-y-4">
                        <div className="bg-black rounded-xl overflow-hidden aspect-[9/16] flex items-center justify-center">
                            {result?.video_url ? (
                                <video src={getApiUrl(result.video_url)} controls className="w-full h-full object-contain" />
                            ) : (
                                <p className="text-xs text-muted-foreground px-6 text-center">
                                    {rendering ? 'Rendering slides…' : 'Your slideshow preview renders here'}
                                </p>
                            )}
                        </div>
                        {result && (
                            <>
                                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
                                    <CheckCircle2 size={16} className="shrink-0" />
                                    Saved to your Library — schedule it from there.
                                </div>
                                <div className="grid grid-cols-4 gap-1.5">
                                    {(result.images || []).map((img, i) => (
                                        <a key={i} href={getApiUrl(img)} target="_blank" rel="noopener noreferrer" className="block bg-black rounded-lg overflow-hidden aspect-[9/16]">
                                            <img src={getApiUrl(img)} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                                        </a>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <Download size={12} /> Click a slide to open the PNG — post the image set as a TikTok carousel.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
