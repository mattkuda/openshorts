import React, { useState, useEffect } from 'react';
import { Youtube, Upload, FileVideo, X, Scissors, Film, Layout, User } from 'lucide-react';
import { getApiUrl } from '../config';

export default function MediaInput({ onProcess, isProcessing }) {
    const [youtubeUrlEnabled, setYoutubeUrlEnabled] = useState(true);
    const [mode, setMode] = useState('url'); // 'url' | 'file'
    const [url, setUrl] = useState('');
    const [file, setFile] = useState(null);
    const [acknowledged, setAcknowledged] = useState(false);
    const [generationMode, setGenerationMode] = useState('viral'); // 'viral' | 'summary'
    const [targetDuration, setTargetDuration] = useState(30);
    const [reframeMode, setReframeMode] = useState('auto'); // 'auto' | 'streamer'
    const [facecamCorner, setFacecamCorner] = useState('tr');

    useEffect(() => {
        fetch(getApiUrl('/api/config'))
            .then((r) => r.ok ? r.json() : null)
            .then((cfg) => {
                if (cfg && cfg.youtubeUrlEnabled === false) {
                    setYoutubeUrlEnabled(false);
                    setMode('file');
                }
            })
            .catch(() => {});
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!acknowledged) return;
        const extra = { generationMode, targetDuration, reframeMode, facecamCorner };
        if (mode === 'url' && url) {
            onProcess({ type: 'url', payload: url, acknowledged: true, ...extra });
        } else if (mode === 'file' && file) {
            onProcess({ type: 'file', payload: file, acknowledged: true, ...extra });
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
            setMode('file');
        }
    };

    return (
        <div className="bg-surface border border-border rounded-2xl p-6 animate-[fadeIn_0.6s_ease-out]">
            <div className="flex gap-4 mb-6 border-b border-border pb-4">
                {youtubeUrlEnabled && (
                    <button
                        onClick={() => setMode('url')}
                        className={`flex items-center gap-2 pb-2 px-2 transition-all ${mode === 'url'
                            ? 'text-primary-strong border-b-2 border-primary -mb-[17px]'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <Youtube size={18} />
                        YouTube URL
                    </button>
                )}
                <button
                    onClick={() => setMode('file')}
                    className={`flex items-center gap-2 pb-2 px-2 transition-all ${mode === 'file'
                        ? 'text-primary-strong border-b-2 border-primary -mb-[17px]'
                        : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    <Upload size={18} />
                    Upload File
                </button>
            </div>

            <form onSubmit={handleSubmit}>
                {mode === 'url' ? (
                    <div className="space-y-4">
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="input-field"
                            required
                        />
                    </div>
                ) : (
                    <div
                        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${file ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-border bg-muted'
                            }`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                    >
                        {file ? (
                            <div className="flex items-center justify-center gap-3 text-foreground">
                                <FileVideo className="text-primary-strong" />
                                <span className="font-medium">{file.name}</span>
                                <button
                                    type="button"
                                    onClick={() => setFile(null)}
                                    className="p-1 hover:bg-muted rounded-full"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <label className="cursor-pointer block">
                                <input
                                    type="file"
                                    accept="video/*"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                    className="hidden"
                                />
                                <Upload className="mx-auto mb-3 text-muted-foreground" size={24} />
                                <p className="text-muted-foreground">Click to upload or drag and drop</p>
                                <p className="text-xs text-muted-foreground mt-1">MP4, MOV up to 500MB</p>
                            </label>
                        )}
                    </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => setGenerationMode('viral')}
                        className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border transition-all text-sm ${generationMode === 'viral'
                            ? 'border-primary bg-primary/10 text-primary-strong'
                            : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <Scissors size={16} />
                        <span className="font-medium">Viral clips</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setGenerationMode('summary')}
                        className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border transition-all text-sm ${generationMode === 'summary'
                            ? 'border-primary bg-primary/10 text-primary-strong'
                            : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <Film size={16} />
                        <span className="font-medium">Summary reel</span>
                    </button>
                </div>

                {generationMode === 'summary' && (
                    <div className="mt-3 bg-muted border border-border rounded-xl p-4">
                        <div className="flex justify-between items-center mb-2 text-xs text-muted-foreground">
                            <span>Target length</span>
                            <span className="font-mono text-foreground">{targetDuration}s</span>
                        </div>
                        <input
                            type="range"
                            min={15}
                            max={90}
                            step={5}
                            value={targetDuration}
                            onChange={(e) => setTargetDuration(Number(e.target.value))}
                            className="w-full accent-primary"
                        />
                        <p className="text-[11px] text-muted-foreground mt-2">
                            One concatenated reel covering the major beats — hook, key points, takeaway.
                        </p>
                    </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => setReframeMode('auto')}
                        className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border transition-all text-sm ${reframeMode === 'auto'
                            ? 'border-primary bg-primary/10 text-primary-strong'
                            : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <Layout size={16} />
                        <span className="font-medium">Auto reframe</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setReframeMode('streamer')}
                        className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border transition-all text-sm ${reframeMode === 'streamer'
                            ? 'border-primary bg-primary/10 text-primary-strong'
                            : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <User size={16} />
                        <span className="font-medium">Streamer split</span>
                    </button>
                </div>

                {reframeMode === 'streamer' && (
                    <div className="mt-3 bg-muted border border-border rounded-xl p-4">
                        <div className="text-xs text-muted-foreground mb-2">Where is your face cam in the source?</div>
                        <div className="grid grid-cols-2 gap-2 max-w-[200px]">
                            {[
                                { v: 'tl', label: '↖ Top left' },
                                { v: 'tr', label: '↗ Top right' },
                                { v: 'bl', label: '↙ Bottom left' },
                                { v: 'br', label: '↘ Bottom right' },
                            ].map((c) => (
                                <button
                                    key={c.v}
                                    type="button"
                                    onClick={() => setFacecamCorner(c.v)}
                                    className={`py-2 px-2 rounded-lg border text-xs transition-all ${facecamCorner === c.v
                                        ? 'border-primary bg-primary/10 text-primary-strong'
                                        : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-3">
                            Top tile = your face cam zoomed in. Bottom tile = the full source frame letterboxed (game / screen).
                        </p>
                    </div>
                )}

                <label className="flex items-start gap-2 mt-5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="mt-0.5 accent-primary cursor-pointer"
                    />
                    <span>
                        I confirm I own this content or have the rights to process it. I am responsible for any content I submit. See our <a href="/#legal" target="_blank" rel="noopener noreferrer" className="text-primary-strong underline" onClick={(e) => e.stopPropagation()}>Terms & Privacy</a>.
                    </span>
                </label>

                <button
                    type="submit"
                    disabled={isProcessing || !acknowledged || (mode === 'url' && !url) || (mode === 'file' && !file)}
                    className="w-full btn-primary mt-4 flex items-center justify-center gap-2"
                >
                    {isProcessing ? (
                        <>
                            <div className="w-5 h-5 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                            Processing Video...
                        </>
                    ) : (
                        <>
                            {generationMode === 'summary' ? `Generate ${targetDuration}s Summary` : 'Generate Clips'}
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}
