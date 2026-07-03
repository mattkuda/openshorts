import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    ArrowLeft, ChevronLeft, ChevronRight, Upload, FlaskConical, Loader2,
    CheckCircle2, X, Plus, Music, Play, Pause, Users,
    AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
} from 'lucide-react';
import { getApiUrl } from '../config';

// ReelFarm-style "Create UGC ads" screen:
// 1. Hook (carousel, auto-generated from the brand profile) → 2. AI avatar
// (Default / My characters / Uploads) → 3. Demos — with a live 9:16 preview
// (text position toggles inside the preview), Sound picker, and My Videos below.

const POSITION_META = [
    { id: 'top', icon: AlignStartHorizontal, css: { top: '14%' } },
    { id: 'center', icon: AlignCenterHorizontal, css: { top: '50%', transform: 'translateY(-50%)' } },
    { id: 'bottom', icon: AlignEndHorizontal, css: { bottom: '14%' } },
];

const outlineTextStyle = {
    fontFamily: '"Noto Serif", serif',
    fontWeight: 700,
    color: '#fff',
    WebkitTextStroke: '1.5px black',
    textShadow: '0 0 6px rgba(0,0,0,0.55)',
    lineHeight: 1.35,
};

function SoundModal({ open, onClose, selected, onSelect }) {
    const [tab, setTab] = useState('templates');
    const [sounds, setSounds] = useState({ templates: [], uploads: [] });
    const [playing, setPlaying] = useState('');
    const [uploading, setUploading] = useState(false);
    const audioRef = useRef(null);
    const fileRef = useRef(null);

    const load = useCallback(() => {
        fetch(getApiUrl('/api/sounds'))
            .then((r) => r.json())
            .then(setSounds)
            .catch(() => { /* list stays empty */ });
    }, []);

    useEffect(() => { if (open) load(); }, [open, load]);
    useEffect(() => () => audioRef.current?.pause(), []);

    if (!open) return null;

    const togglePlay = (url) => {
        if (playing === url) {
            audioRef.current?.pause();
            setPlaying('');
            return;
        }
        audioRef.current?.pause();
        const a = new Audio(getApiUrl(url));
        a.onended = () => setPlaying('');
        a.play();
        audioRef.current = a;
        setPlaying(url);
    };

    const uploadSound = async (file) => {
        if (!file) return;
        setUploading(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch(getApiUrl('/api/sounds/upload'), { method: 'POST', body: form });
            if (res.ok) { setTab('uploads'); load(); }
        } finally {
            setUploading(false);
        }
    };

    const list = tab === 'templates' ? sounds.templates : sounds.uploads;

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 pb-3">
                    <h2 className="text-lg font-semibold text-foreground">Choose background music</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
                </div>
                <div className="px-5">
                    <div className="grid grid-cols-2 gap-1 bg-muted border border-border rounded-xl p-1">
                        {[['templates', 'Templates'], ['uploads', 'Uploaded Sounds']].map(([id, label]) => (
                            <button key={id} onClick={() => setTab(id)}
                                className={`py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
                    <button onClick={() => { onSelect(null); onClose(); }}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors ${!selected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted'}`}>
                        <span className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0"><X size={14} className="text-muted-foreground" /></span>
                        <span className="text-sm font-medium text-foreground">No Sound</span>
                    </button>
                    {list.map((snd) => (
                        <div key={snd.url}
                            className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${selected?.url === snd.url ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted'}`}
                            onClick={() => { onSelect(snd); onClose(); }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); togglePlay(snd.url); }}
                                className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0"
                                title="Preview">
                                {playing === snd.url ? <Pause size={14} /> : <Play size={14} />}
                            </button>
                            <span className="text-sm font-medium text-foreground truncate">{snd.name}</span>
                        </div>
                    ))}
                    {tab === 'uploads' && (
                        <button onClick={() => fileRef.current?.click()} disabled={uploading}
                            className="flex items-center gap-3 p-2.5 rounded-xl border border-dashed border-border bg-card hover:bg-muted text-left transition-colors">
                            <span className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} className="text-muted-foreground" />}
                            </span>
                            <span className="text-sm font-medium text-muted-foreground">Upload sound (.mp3)</span>
                        </button>
                    )}
                    {tab === 'templates' && list.length === 0 && (
                        <p className="col-span-full text-xs text-muted-foreground p-2">
                            No template tracks yet — drop licensed/royalty-free .mp3 files into the <code>sounds/</code> folder, or use Uploaded Sounds.
                        </p>
                    )}
                </div>
                <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => uploadSound(e.target.files?.[0])} />
            </div>
        </div>
    );
}

export default function HookDemoComposer({ geminiApiKey, debug, brand, onBack }) {
    const mock = !!debug?.mockAI || !geminiApiKey;

    // 1. Hook carousel
    const [hooks, setHooks] = useState([]);
    const [hookIdx, setHookIdx] = useState(0);
    const [loadingHooks, setLoadingHooks] = useState(true);

    // 2. AI avatar
    const [avatarTab, setAvatarTab] = useState('default'); // default | characters | uploads
    const [defaultAvatars, setDefaultAvatars] = useState([]);
    const [characters, setCharacters] = useState([]);
    const [avatarImage, setAvatarImage] = useState('');
    const [avatarVideoFile, setAvatarVideoFile] = useState(null);
    const [useMockAvatarVideo, setUseMockAvatarVideo] = useState(false);

    // 3. Demos
    const [demoFile, setDemoFile] = useState(null);
    const [useMockDemo, setUseMockDemo] = useState(!!debug?.mockAI);

    // Preview / sound / job
    const [textPosition, setTextPosition] = useState('center');
    const [sound, setSound] = useState(null); // {name, url} | null
    const [soundOpen, setSoundOpen] = useState(false);
    const [jobId, setJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState('idle');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [myVideos, setMyVideos] = useState([]);
    const demoRef = useRef(null);
    const avatarVideoRef = useRef(null);

    const hookText = hooks[hookIdx] ?? '';
    const setHookText = (v) => setHooks((prev) => { const next = [...prev]; next[hookIdx] = v; return next; });

    // Auto-generate hooks from the brand profile (ReelFarm's pre-saved hooks)
    useEffect(() => {
        setLoadingHooks(true);
        fetch(getApiUrl('/api/hooks/suggest'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}) },
            body: JSON.stringify({
                product_desc: brand ? `${brand.name} — ${brand.tagline}` : 'My app',
                niche: brand?.niche || '',
                mock,
            }),
        })
            .then((r) => r.json())
            .then((d) => setHooks(d.hooks?.length ? d.hooks : ['']))
            .catch(() => setHooks(['']))
            .finally(() => setLoadingHooks(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetch(getApiUrl('/api/avatars/defaults')).then((r) => r.json())
            .then((d) => {
                setDefaultAvatars(d.avatars || []);
                if (d.avatars?.length) setAvatarImage(d.avatars[0]);
            }).catch(() => { });
        fetch(getApiUrl('/api/characters')).then((r) => r.json())
            .then((d) => setCharacters(d.characters || [])).catch(() => { });
        loadMyVideos();
    }, []);

    const loadMyVideos = () => {
        fetch(getApiUrl('/api/library')).then((r) => r.json())
            .then((d) => setMyVideos((d.creations || []).filter((c) => c.kind === 'hook_demo')))
            .catch(() => { });
    };

    // Poll compose job
    useEffect(() => {
        if (!jobId || jobStatus !== 'processing') return undefined;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(getApiUrl(`/api/status/${jobId}`));
                if (!res.ok) return;
                const data = await res.json();
                if (data.status === 'completed') {
                    setResult(data.result);
                    setJobStatus('completed');
                    loadMyVideos();
                } else if (data.status === 'failed') {
                    setJobStatus('failed');
                    setError(`Generation failed: ${(data.logs || []).slice(-1)[0] || 'unknown error'}`);
                }
            } catch { /* keep polling */ }
        }, 1500);
        return () => clearInterval(interval);
    }, [jobId, jobStatus]);

    const generate = async () => {
        if (!hookText.trim()) { setError('Write or pick a hook first.'); return; }
        if (!useMockDemo && !demoFile) { setError('Attach demo footage (step 3), or enable the mock demo.'); return; }
        setError('');
        setResult(null);
        setJobStatus('processing');
        try {
            const form = new FormData();
            form.append('hook_text', hookText);
            form.append('style', 'preroll');
            form.append('title', hookText);
            form.append('use_mock', useMockDemo ? 'true' : 'false');
            form.append('text_style', 'outline');
            form.append('text_position', textPosition);
            if (sound?.url) form.append('sound', sound.url);
            if (avatarTab !== 'uploads' && avatarImage) form.append('avatar_image', avatarImage);
            if (avatarTab === 'uploads') {
                if (avatarVideoFile) form.append('avatar_video', avatarVideoFile);
                else if (useMockAvatarVideo) form.append('use_mock_avatar_video', 'true');
            }
            if (!useMockDemo && demoFile) form.append('demo', demoFile);
            const res = await fetch(getApiUrl('/api/compose/hook-demo'), { method: 'POST', body: form });
            if (!res.ok) throw new Error(await res.text());
            setJobId((await res.json()).job_id);
        } catch (e) {
            setJobStatus('failed');
            setError(`Could not start: ${e.message}`);
        }
    };

    const avatarThumbs = avatarTab === 'default'
        ? defaultAvatars.map((url) => ({ key: url, img: url, label: 'Default avatar' }))
        : avatarTab === 'characters'
            ? characters.flatMap((c) => [
                { key: `${c.id}-p`, img: c.portrait_path, label: c.name },
                ...c.looks.map((l) => ({ key: l.id, img: l.image_path, label: c.name })),
            ])
            : [];

    const posMeta = POSITION_META.find((p) => p.id === textPosition) || POSITION_META[1];

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-6xl mx-auto space-y-6">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft size={16} /> All formats
                </button>
                <h1 className="text-2xl font-bold text-foreground">Create UGC ads</h1>

                <div className="bg-card border border-border rounded-2xl p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
                        {/* ---- Left: the 3 steps ---- */}
                        <div className="space-y-7 min-w-0">
                            {/* 1. Hook */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-bold text-foreground">1. Hook</label>
                                    <span className="text-xs text-muted-foreground">{hooks.length ? `${hookIdx + 1}/${hooks.length}` : ''}</span>
                                </div>
                                <div className="flex items-stretch gap-1 bg-background border border-border rounded-2xl shadow-sm">
                                    <button onClick={() => setHookIdx((i) => (i - 1 + hooks.length) % Math.max(hooks.length, 1))}
                                        disabled={hooks.length < 2}
                                        className="px-3 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Previous hook">
                                        <ChevronLeft size={18} />
                                    </button>
                                    <textarea
                                        value={loadingHooks ? 'Generating hooks for your app…' : hookText}
                                        onChange={(e) => setHookText(e.target.value)}
                                        disabled={loadingHooks}
                                        rows={2}
                                        className="flex-1 bg-transparent text-sm text-foreground text-center py-4 px-2 outline-none resize-none disabled:text-muted-foreground"
                                    />
                                    <button onClick={() => setHookIdx((i) => (i + 1) % Math.max(hooks.length, 1))}
                                        disabled={hooks.length < 2}
                                        className="px-3 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Next hook">
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* 2. AI avatar */}
                            <div>
                                <div className="flex items-center gap-4 mb-2">
                                    <label className="text-sm font-bold text-foreground">2. AI avatar</label>
                                    <div className="flex gap-1 text-xs">
                                        {[['default', 'Default'], ['characters', 'My characters'], ['uploads', 'Uploads']].map(([id, label]) => (
                                            <button key={id} onClick={() => setAvatarTab(id)}
                                                className={`px-2.5 py-1 rounded-lg transition-colors ${avatarTab === id ? 'bg-primary/15 text-primary-strong font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {avatarTab === 'uploads' ? (
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <button onClick={() => avatarVideoRef.current?.click()}
                                            className="flex items-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-4 py-2.5 text-sm font-medium transition-colors">
                                            <Upload size={15} /> {avatarVideoFile ? avatarVideoFile.name : 'Upload selfie clip'}
                                        </button>
                                        <input ref={avatarVideoRef} type="file" accept="video/*" className="hidden" onChange={(e) => setAvatarVideoFile(e.target.files?.[0] || null)} />
                                        {debug?.enabled && (
                                            <button onClick={() => setUseMockAvatarVideo((m) => !m)}
                                                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium border transition-colors ${useMockAvatarVideo ? 'border-amber-500/40 bg-amber-500/10 text-amber-700' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}>
                                                <FlaskConical size={14} /> Mock clip {useMockAvatarVideo ? 'ON' : 'off'}
                                            </button>
                                        )}
                                    </div>
                                ) : avatarThumbs.length === 0 ? (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                        <Users size={12} /> {avatarTab === 'characters' ? 'No characters yet — create one in the Characters tab.' : 'No default avatars found.'}
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                                        {avatarThumbs.map((opt) => (
                                            <button key={opt.key} onClick={() => setAvatarImage(avatarImage === opt.img ? '' : opt.img)}
                                                title={opt.label}
                                                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${avatarImage === opt.img ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/50'}`}>
                                                <img src={getApiUrl(opt.img)} alt={opt.label} className="w-full h-full object-cover" loading="lazy" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 3. Demos */}
                            <div>
                                <label className="text-sm font-bold text-foreground block mb-2">3. Demos</label>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button onClick={() => { setDemoFile(null); if (!debug?.mockAI) setUseMockDemo(false); }}
                                        className={`w-16 h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-xs transition-colors ${!demoFile && !useMockDemo ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-muted text-muted-foreground hover:border-primary/50'}`}>
                                        <X size={14} /> None
                                    </button>
                                    {useMockDemo && (
                                        <button onClick={() => setUseMockDemo(false)}
                                            className="w-16 h-20 rounded-xl border-2 border-primary overflow-hidden relative" title="Mock demo clip (click to remove)">
                                            <video src={getApiUrl('/mocks/mock-ai-generation.mp4')} muted className="w-full h-full object-cover" />
                                        </button>
                                    )}
                                    {demoFile && (
                                        <div className="w-16 h-20 rounded-xl border-2 border-primary bg-muted flex items-center justify-center p-1" title={demoFile.name}>
                                            <span className="text-[9px] text-foreground break-all line-clamp-4">{demoFile.name}</span>
                                        </div>
                                    )}
                                    <button onClick={() => demoRef.current?.click()}
                                        className="w-16 h-20 rounded-xl border-2 border-dashed border-border bg-muted text-muted-foreground hover:border-primary/50 hover:text-foreground flex items-center justify-center transition-colors" title="Upload demo footage">
                                        <Plus size={18} />
                                    </button>
                                    <input ref={demoRef} type="file" accept="video/*" className="hidden" onChange={(e) => { setDemoFile(e.target.files?.[0] || null); setUseMockDemo(false); }} />
                                    {debug?.enabled && !useMockDemo && (
                                        <button onClick={() => { setUseMockDemo(true); setDemoFile(null); }}
                                            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium border border-border bg-card text-muted-foreground hover:bg-muted transition-colors" title="Use mocks/mock-ai-generation.mp4">
                                            <FlaskConical size={14} /> Use mock demo
                                        </button>
                                    )}
                                </div>
                            </div>

                            {error && <p className="text-sm text-red-700">{error}</p>}
                        </div>

                        {/* ---- Right: live preview ---- */}
                        <div className="space-y-3">
                            <div className="relative bg-black rounded-2xl overflow-hidden aspect-[9/16] mx-auto w-full max-w-[300px]">
                                {result?.video_url ? (
                                    <video src={getApiUrl(result.video_url)} controls autoPlay className="w-full h-full object-contain" />
                                ) : (
                                    <>
                                        {avatarTab !== 'uploads' && avatarImage ? (
                                            <img src={getApiUrl(avatarImage)} alt="Avatar" className="absolute inset-0 w-full h-full object-cover" />
                                        ) : avatarTab === 'uploads' && useMockAvatarVideo ? (
                                            <video src={getApiUrl('/mocks/mock-reaction.mp4')} muted loop autoPlay className="absolute inset-0 w-full h-full object-cover" />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <p className="text-xs text-muted-foreground">Pick an avatar to preview</p>
                                            </div>
                                        )}
                                        {hookText && (
                                            <p className="absolute inset-x-3 text-center text-[15px] px-1" style={{ ...outlineTextStyle, ...posMeta.css }}>
                                                {hookText}
                                            </p>
                                        )}
                                        {jobStatus === 'processing' && (
                                            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                                                <Loader2 size={22} className="animate-spin text-white" />
                                                <p className="text-xs text-white/90">Rendering…</p>
                                            </div>
                                        )}
                                        {/* Position toggles (inside preview, ReelFarm-style) */}
                                        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
                                            {POSITION_META.map(({ id, icon: Icon }) => (
                                                <button key={id} onClick={() => setTextPosition(id)}
                                                    title={`Text ${id}`}
                                                    className={`w-8 h-7 rounded-md flex items-center justify-center transition-colors ${textPosition === id ? 'bg-white text-black' : 'bg-black/45 text-white/80 hover:bg-black/65'}`}>
                                                    <Icon size={13} />
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {jobStatus === 'completed' && (
                                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                                    <CheckCircle2 size={14} className="shrink-0" /> Saved to your Library.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sound + Generate row */}
                    <div className="flex items-center gap-3 mt-7">
                        <button onClick={() => setSoundOpen(true)}
                            className="flex items-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-4 py-3 text-sm font-medium transition-colors shrink-0">
                            <Music size={15} className="text-muted-foreground" />
                            {sound ? sound.name : 'Sound'}
                        </button>
                        <button onClick={generate} disabled={jobStatus === 'processing'}
                            className="btn-primary flex-1 flex items-center justify-center gap-2">
                            {jobStatus === 'processing' ? <Loader2 size={17} className="animate-spin" /> : null}
                            {jobStatus === 'processing' ? 'Generating…' : 'Generate'}
                        </button>
                    </div>
                </div>

                {/* My Videos */}
                <div>
                    <h2 className="text-lg font-semibold text-foreground mb-3">My Videos <span className="text-muted-foreground font-normal">({myVideos.length})</span></h2>
                    {myVideos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Your generated UGC ads will appear here.</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                            {myVideos.map((v) => (
                                <div key={v.id} className="bg-black rounded-xl overflow-hidden aspect-[9/16]">
                                    <video src={getApiUrl(v.video_path)} controls className="w-full h-full object-contain" preload="metadata" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <SoundModal open={soundOpen} onClose={() => setSoundOpen(false)} selected={sound} onSelect={setSound} />
        </div>
    );
}
