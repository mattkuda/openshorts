import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Sparkles, Upload, Wand2, FlaskConical, Loader2, CheckCircle2, Terminal, Users } from 'lucide-react';
import { getApiUrl } from '../config';

const HOOK_STYLES = [
    { id: 'preroll', label: 'Pre-roll', hint: 'Hook segment plays before your demo' },
    { id: 'overlay', label: 'Overlay', hint: 'Hook text sits on top of the demo' },
];

const TEXT_STYLES = [
    { id: 'outline', label: 'Outline', hint: 'White text, black outline (TikTok-native)' },
    { id: 'box', label: 'Card', hint: 'Black text in a white box' },
];

const POSITIONS = ['top', 'center', 'bottom'];

export default function HookDemoComposer({ geminiApiKey, debug, brand, onBack }) {
    const [hookText, setHookText] = useState('');
    const [style, setStyle] = useState('preroll');
    const [ctaText, setCtaText] = useState(brand?.cta_text || '');
    const [demoFile, setDemoFile] = useState(null);
    const [useMock, setUseMock] = useState(!!debug?.mockAI);
    const [suggestions, setSuggestions] = useState([]);
    const [suggesting, setSuggesting] = useState(false);
    const [jobId, setJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState('idle'); // idle | processing | completed | failed
    const [logs, setLogs] = useState([]);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const fileRef = useRef(null);
    const avatarVideoRef = useRef(null);

    // ReelFarm-style avatar step
    const [avatarTab, setAvatarTab] = useState('none'); // none | characters | upload
    const [characters, setCharacters] = useState([]);
    const [avatarImage, setAvatarImage] = useState(''); // web path of chosen look/portrait
    const [avatarVideoFile, setAvatarVideoFile] = useState(null);
    const [useMockAvatarVideo, setUseMockAvatarVideo] = useState(false);
    const [textStyle, setTextStyle] = useState('outline');
    const [textPosition, setTextPosition] = useState('center');

    useEffect(() => {
        fetch(getApiUrl('/api/characters'))
            .then((r) => r.json())
            .then((d) => setCharacters(d.characters || []))
            .catch(() => { /* characters optional */ });
    }, []);

    // Poll compose job
    useEffect(() => {
        if (!jobId || jobStatus !== 'processing') return undefined;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(getApiUrl(`/api/status/${jobId}`));
                if (!res.ok) return;
                const data = await res.json();
                if (data.logs) setLogs(data.logs);
                if (data.status === 'completed') {
                    setResult(data.result);
                    setJobStatus('completed');
                } else if (data.status === 'failed') {
                    setJobStatus('failed');
                    setError('Generation failed — check the logs below.');
                }
            } catch { /* keep polling */ }
        }, 1500);
        return () => clearInterval(interval);
    }, [jobId, jobStatus]);

    const suggestHooks = async () => {
        setSuggesting(true);
        setError('');
        try {
            const res = await fetch(getApiUrl('/api/hooks/suggest'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}) },
                body: JSON.stringify({
                    product_desc: brand ? `${brand.name} — ${brand.tagline}` : 'My app',
                    niche: brand?.niche || '',
                    mock: !!debug?.mockAI || !geminiApiKey,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setSuggestions(data.hooks || []);
        } catch (e) {
            setError(`Hook suggestions failed: ${e.message}`);
        } finally {
            setSuggesting(false);
        }
    };

    const generate = async () => {
        if (!hookText.trim()) { setError('Write (or pick) a hook first.'); return; }
        if (!useMock && !demoFile) { setError('Upload demo footage, or flip on the mock demo.'); return; }
        setError('');
        setLogs([]);
        setResult(null);
        setJobStatus('processing');
        try {
            const form = new FormData();
            form.append('hook_text', hookText);
            form.append('style', style);
            form.append('cta_text', ctaText);
            form.append('title', hookText);
            form.append('use_mock', useMock ? 'true' : 'false');
            form.append('text_style', textStyle);
            form.append('text_position', textPosition);
            if (avatarTab === 'characters' && avatarImage) form.append('avatar_image', avatarImage);
            if (avatarTab === 'upload') {
                if (avatarVideoFile) form.append('avatar_video', avatarVideoFile);
                else if (useMockAvatarVideo) form.append('use_mock_avatar_video', 'true');
            }
            if (!useMock && demoFile) form.append('demo', demoFile);
            const res = await fetch(getApiUrl('/api/compose/hook-demo'), { method: 'POST', body: form });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setJobId(data.job_id);
        } catch (e) {
            setJobStatus('failed');
            setError(`Could not start job: ${e.message}`);
        }
    };

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-5xl mx-auto space-y-6">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft size={16} /> All formats
                </button>

                <div>
                    <h1 className="text-2xl font-bold text-foreground">Hook + Demo</h1>
                    <p className="text-sm text-muted-foreground mt-1">A bold hook card stitched before your app demo, with an optional CTA end-card. Everything stays editable — re-render anytime.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
                    {/* Composer form */}
                    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hook text</label>
                                <button
                                    onClick={suggestHooks}
                                    disabled={suggesting}
                                    className="flex items-center gap-1.5 text-xs font-medium text-primary-strong hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {suggesting ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                    Suggest hooks
                                </button>
                            </div>
                            <textarea
                                value={hookText}
                                onChange={(e) => setHookText(e.target.value)}
                                placeholder="POV: you finally found a fitness app that plans FOR you 🤯"
                                rows={2}
                                className="input-field resize-none"
                            />
                            {suggestions.length > 0 && (
                                <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                                    {suggestions.map((h, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setHookText(h)}
                                            className="w-full text-left text-sm px-3 py-2 rounded-lg bg-muted border border-border hover:border-primary/60 text-foreground transition-colors"
                                        >
                                            {h}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Hook style</label>
                            <div className="grid grid-cols-2 gap-2">
                                {HOOK_STYLES.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => setStyle(s.id)}
                                        className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${style === s.id
                                            ? 'border-primary bg-primary/10 text-primary-strong'
                                            : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                                    >
                                        <span className="block text-sm font-medium">{s.label}</span>
                                        <span className="block text-xs mt-0.5 opacity-80">{s.hint}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* AI avatar step (ReelFarm-style) — only for pre-roll */}
                        {style === 'preroll' && (
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">AI avatar</label>
                                    <div className="flex gap-1 text-xs">
                                        {[['none', 'None'], ['characters', 'My characters'], ['upload', 'Upload video']].map(([id, label]) => (
                                            <button key={id} onClick={() => setAvatarTab(id)}
                                                className={`px-2.5 py-1 rounded-lg transition-colors ${avatarTab === id
                                                    ? 'bg-primary/15 text-primary-strong font-medium'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {avatarTab === 'none' && (
                                    <p className="text-xs text-muted-foreground">No avatar — the hook renders on a blurred frame of your demo.</p>
                                )}
                                {avatarTab === 'characters' && (
                                    characters.length === 0 ? (
                                        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Users size={12} /> No characters yet — create one in the Characters tab first.</p>
                                    ) : (
                                        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                                            {characters.flatMap((c) => [
                                                { key: `${c.id}-p`, img: c.portrait_path, label: c.name },
                                                ...c.looks.map((l) => ({ key: l.id, img: l.image_path, label: c.name })),
                                            ]).map((opt) => (
                                                <button key={opt.key} onClick={() => setAvatarImage(avatarImage === opt.img ? '' : opt.img)}
                                                    className={`relative shrink-0 w-16 aspect-[9/16] rounded-lg overflow-hidden border-2 transition-colors ${avatarImage === opt.img ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/60'}`}
                                                    title={opt.label}>
                                                    <img src={getApiUrl(opt.img)} alt={opt.label} className="w-full h-full object-cover" />
                                                </button>
                                            ))}
                                        </div>
                                    )
                                )}
                                {avatarTab === 'upload' && (
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <button onClick={() => avatarVideoRef.current?.click()}
                                            className="flex items-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-4 py-2 text-sm font-medium transition-colors">
                                            <Upload size={15} /> {avatarVideoFile ? avatarVideoFile.name : 'Upload selfie clip'}
                                        </button>
                                        <input ref={avatarVideoRef} type="file" accept="video/*" className="hidden" onChange={(e) => setAvatarVideoFile(e.target.files?.[0] || null)} />
                                        {debug?.enabled && (
                                            <button onClick={() => setUseMockAvatarVideo((m) => !m)}
                                                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium border transition-colors ${useMockAvatarVideo
                                                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                                                    : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
                                                title="Uses mocks/mock-reaction.mp4 as the avatar clip">
                                                <FlaskConical size={14} /> Mock clip {useMockAvatarVideo ? 'ON' : 'off'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Text style + position */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Text style</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {TEXT_STYLES.map((t) => (
                                        <button key={t.id} onClick={() => setTextStyle(t.id)} title={t.hint}
                                            className={`rounded-lg border px-2 py-2 text-sm transition-colors ${textStyle === t.id
                                                ? 'border-primary bg-primary/10 text-primary-strong font-medium'
                                                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Text position</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {POSITIONS.map((p) => (
                                        <button key={p} onClick={() => setTextPosition(p)}
                                            className={`rounded-lg border px-2 py-2 text-sm capitalize transition-colors ${textPosition === p
                                                ? 'border-primary bg-primary/10 text-primary-strong font-medium'
                                                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Demo footage</label>
                            <div className="flex items-center gap-3 flex-wrap">
                                <button
                                    onClick={() => fileRef.current?.click()}
                                    disabled={useMock}
                                    className="flex items-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Upload size={16} />
                                    {demoFile ? demoFile.name : 'Upload video'}
                                </button>
                                <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => setDemoFile(e.target.files?.[0] || null)} />
                                {debug?.enabled && (
                                    <button
                                        onClick={() => setUseMock((m) => !m)}
                                        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border transition-colors ${useMock
                                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                                            : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
                                        title="Uses mocks/mock-ai-generation.mp4 server-side — no upload, no credits"
                                    >
                                        <FlaskConical size={16} /> Mock demo {useMock ? 'ON' : 'off'}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">CTA end-card <span className="normal-case font-normal">(optional)</span></label>
                            <input
                                value={ctaText}
                                onChange={(e) => setCtaText(e.target.value)}
                                placeholder={brand?.name ? `Get ${brand.name} free` : 'Get it free — link in bio'}
                                className="input-field"
                            />
                        </div>

                        {error && <p className="text-sm text-red-700">{error}</p>}

                        <button onClick={generate} disabled={jobStatus === 'processing'} className="btn-primary w-full flex items-center justify-center gap-2">
                            {jobStatus === 'processing' ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                            {jobStatus === 'processing' ? 'Generating…' : 'Generate'}
                        </button>
                    </div>

                    {/* Preview / result */}
                    <div className="space-y-4">
                        <div className="bg-black rounded-xl overflow-hidden aspect-[9/16] flex items-center justify-center">
                            {result?.video_url ? (
                                <video src={getApiUrl(result.video_url)} controls className="w-full h-full object-contain" />
                            ) : (
                                <p className="text-xs text-muted-foreground px-6 text-center">
                                    {jobStatus === 'processing' ? 'Rendering your clip…' : 'Your 9:16 preview renders here'}
                                </p>
                            )}
                        </div>
                        {jobStatus === 'completed' && (
                            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
                                <CheckCircle2 size={16} className="shrink-0" />
                                Saved to your Library — schedule it from there.
                            </div>
                        )}
                        {logs.length > 0 && (
                            <div className="bg-muted border border-border rounded-xl p-3 max-h-40 overflow-y-auto custom-scrollbar">
                                <p className="text-xs font-mono text-muted-foreground flex items-center gap-1.5 mb-1.5"><Terminal size={11} /> Logs</p>
                                {logs.map((l, i) => (
                                    <p key={i} className={`text-xs font-mono ${l.toLowerCase().includes('error') ? 'text-red-700' : 'text-muted-foreground'}`}>{l}</p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
