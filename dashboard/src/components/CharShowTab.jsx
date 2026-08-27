import React, { useState, useEffect, useCallback } from 'react';
import {
    Plus, Trash2, Pencil, Loader2, Sparkles, Layers, Terminal,
    Copy, Check, X, Download,
} from 'lucide-react';
import { getApiUrl } from '../config';
import CharShowSeriesEditor from './CharShowSeriesEditor';
import CharShowDeckModal from './CharShowDeckModal';

const POSE_PACK_TARGET = 20;

function StatusChip({ status }) {
    const exported = status === 'published';
    return (
        <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                exported ? 'bg-green-500/10 text-green-700' : 'bg-muted text-muted-foreground border border-border'
            }`}
        >
            {exported ? 'Exported' : 'Draft'}
        </span>
    );
}

function SeriesCard({ series, character, poses, jobBusyForSeries, generateBatchCount, onChangeBatchCount, onGenerate, onGeneratePoses, onEdit, onDelete }) {
    // `poses` is the full fixed pose bank (~20 slots), each flagged `generated` —
    // count only the ones actually rendered, not the bank size.
    const poseTotal = poses?.length || POSE_PACK_TARGET;
    const poseCount = (poses || []).filter((p) => p.generated).length;
    const posesReady = poseCount > 0;
    return (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                        {character?.portrait_path && (
                            <img src={getApiUrl(character.portrait_path)} alt={character.name} className="w-full h-full object-cover" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{series.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{character?.name || 'No character'} · {series.niche || 'No niche set'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => onEdit(series)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" title="Edit series">
                        <Pencil size={14} />
                    </button>
                    <button onClick={() => onDelete(series)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" title="Delete series">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border capitalize">
                    {series.style_key || 'impact'}
                </span>
                <span className="w-3.5 h-3.5 rounded-full border border-border shrink-0" style={{ backgroundColor: series.accent_hex || '#00C080' }} title={series.accent_hex} />
                <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        posesReady ? 'bg-green-500/10 text-green-700' : 'bg-amber-500/10 text-amber-700'
                    }`}
                >
                    Pose pack: {poseCount}/{poseTotal}
                </span>
            </div>

            {!posesReady ? (
                <button
                    onClick={() => onGeneratePoses(series)}
                    disabled={jobBusyForSeries || !series.character_id}
                    className="w-full flex items-center justify-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                >
                    {jobBusyForSeries ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Generate poses
                </button>
            ) : (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onGenerate(series, 1)}
                        disabled={jobBusyForSeries}
                        className="flex-1 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                        Generate 1
                    </button>
                    <input
                        type="number" min={1} max={30}
                        value={generateBatchCount}
                        onChange={(e) => onChangeBatchCount(series.id, Number(e.target.value))}
                        className="input-field w-14 text-xs py-2 text-center"
                    />
                    <button
                        onClick={() => onGenerate(series, generateBatchCount)}
                        disabled={jobBusyForSeries}
                        className="flex-1 btn-primary text-xs py-2 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                        {jobBusyForSeries ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}
                        Generate batch
                    </button>
                </div>
            )}
        </div>
    );
}

export default function CharShowTab({ geminiApiKey, debug }) {
    const [series, setSeries] = useState([]);
    const [characters, setCharacters] = useState([]);
    const [creations, setCreations] = useState([]);
    const [posesByCharacter, setPosesByCharacter] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingSeries, setEditingSeries] = useState(null); // null | series object | {} (new)
    const [batchCounts, setBatchCounts] = useState({});
    const [selectedDeckIds, setSelectedDeckIds] = useState(() => new Set());
    const [viewingDeckId, setViewingDeckId] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState(null);
    const [exportCopied, setExportCopied] = useState(false);

    const [job, setJob] = useState(null); // { kind: 'poses'|'generate', seriesId, jobId, status, logs }

    const mock = !!debug?.mockAI || !geminiApiKey;

    const fetchSeries = useCallback(async () => {
        try {
            const res = await fetch(getApiUrl('/api/charshow/series'));
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const data = await res.json();
            setSeries(data.series || []);
        } catch (err) {
            setError(err.message || 'Failed to load series.');
        }
    }, []);

    const fetchCharacters = useCallback(async () => {
        try {
            const res = await fetch(getApiUrl('/api/characters'));
            const data = await res.json();
            setCharacters(data.characters || []);
        } catch { /* characters optional */ }
    }, []);

    const fetchCreations = useCallback(async () => {
        try {
            const res = await fetch(getApiUrl('/api/library'));
            const data = await res.json();
            setCreations((data.creations || []).filter((c) => c.kind === 'char_slideshow'));
        } catch { /* library optional */ }
    }, []);

    const fetchPoses = useCallback(async (characterId) => {
        if (!characterId) return;
        try {
            const res = await fetch(getApiUrl(`/api/charshow/poses/${characterId}`));
            if (!res.ok) return;
            const data = await res.json();
            setPosesByCharacter((prev) => ({ ...prev, [characterId]: data.poses || [] }));
        } catch { /* poses optional */ }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await Promise.all([fetchSeries(), fetchCharacters(), fetchCreations()]);
            setLoading(false);
        })();
    }, [fetchSeries, fetchCharacters, fetchCreations]);

    // Fetch pose counts for every distinct character used by a series.
    useEffect(() => {
        const ids = [...new Set(series.map((s) => s.character_id).filter(Boolean))];
        ids.forEach((id) => { if (!(id in posesByCharacter)) fetchPoses(id); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [series]);

    // Job polling — mirrors the SaaShortsTab generation-status pattern.
    useEffect(() => {
        let interval;
        if (job && job.status === 'processing') {
            interval = setInterval(async () => {
                try {
                    const res = await fetch(getApiUrl(`/api/charshow/status/${job.jobId}`));
                    if (!res.ok) return;
                    const data = await res.json();
                    setJob((prev) => (prev ? { ...prev, logs: data.logs || prev.logs } : prev));
                    if (data.status === 'completed') {
                        setJob((prev) => (prev ? { ...prev, status: 'completed' } : prev));
                        clearInterval(interval);
                        if (job.kind === 'poses') {
                            fetchPoses(job.characterId);
                        } else {
                            fetchCreations();
                            fetchSeries();
                        }
                    } else if (data.status === 'failed') {
                        setJob((prev) => (prev ? { ...prev, status: 'failed', logs: [...(data.logs || prev.logs), data.error || 'Job failed'] } : prev));
                        clearInterval(interval);
                    }
                } catch { /* keep polling */ }
            }, 2000);
        }
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job?.jobId, job?.status]);

    const startPoseGeneration = async (s) => {
        setError('');
        setJob({ kind: 'poses', seriesId: s.id, characterId: s.character_id, jobId: null, status: 'processing', logs: ['Starting pose pack generation…'] });
        try {
            const res = await fetch(getApiUrl('/api/charshow/poses'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}) },
                body: JSON.stringify({ character_id: s.character_id, mock }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            setJob((prev) => (prev ? { ...prev, jobId: data.job_id } : prev));
        } catch (e) {
            setJob((prev) => (prev ? { ...prev, status: 'failed', logs: [...prev.logs, `Error: ${e.message}`] } : prev));
        }
    };

    const startGenerate = async (s, count) => {
        setError('');
        setJob({ kind: 'generate', seriesId: s.id, jobId: null, status: 'processing', logs: [`Generating ${count} deck${count === 1 ? '' : 's'}…`] });
        try {
            const res = await fetch(getApiUrl('/api/charshow/generate'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}) },
                body: JSON.stringify({ series_id: s.id, count, mock }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            setJob((prev) => (prev ? { ...prev, jobId: data.job_id } : prev));
        } catch (e) {
            setJob((prev) => (prev ? { ...prev, status: 'failed', logs: [...prev.logs, `Error: ${e.message}`] } : prev));
        }
    };

    const saveSeries = async (draft) => {
        const res = await fetch(getApiUrl('/api/charshow/series'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error((await res.text()).slice(0, 200));
        await fetchSeries();
        setEditingSeries(null);
    };

    const deleteSeries = async (s) => {
        if (!window.confirm(`Delete "${s.name}"? Generated decks stay in your Library.`)) return;
        await fetch(getApiUrl(`/api/charshow/series/${s.id}`), { method: 'DELETE' });
        fetchSeries();
    };

    const toggleDeckSelected = (id) => {
        setSelectedDeckIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const exportSelected = async () => {
        if (selectedDeckIds.size === 0) return;
        setExporting(true);
        setExportResult(null);
        try {
            const res = await fetch(getApiUrl('/api/charshow/export'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creation_ids: [...selectedDeckIds] }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            setExportResult(data.path || '');
            setSelectedDeckIds(new Set());
            fetchCreations();
        } catch (e) {
            setError(`Export failed: ${e.message}`);
        } finally {
            setExporting(false);
        }
    };

    const viewingDeck = creations.find((c) => c.id === viewingDeckId) || null;
    const jobBusy = job && job.status === 'processing';

    if (editingSeries) {
        return (
            <CharShowSeriesEditor
                initialSeries={editingSeries.id ? editingSeries : null}
                characters={characters}
                onSave={saveSeries}
                onCancel={() => setEditingSeries(null)}
            />
        );
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="space-y-8">
                {/* Zone 1: Series */}
                <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">Character Slideshows</h1>
                            <p className="text-xs text-muted-foreground mt-1">
                                A recurring cartoon character, typeset headlines, your app as the payoff. Generate here, post from your phone.
                            </p>
                        </div>
                        <button onClick={() => setEditingSeries({})} className="btn-primary flex items-center gap-2 text-sm">
                            <Plus size={16} /> New series
                        </button>
                    </div>

                    {error && <p className="text-sm text-red-700">{error}</p>}

                    {loading ? (
                        <div className="flex justify-center py-16">
                            <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
                        </div>
                    ) : series.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Layers className="w-10 h-10 text-muted-foreground mb-3" />
                            <p className="text-sm font-semibold text-foreground">No series yet</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                A series pairs a character with a niche and style. Create one, generate its pose pack, then batch-generate decks.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {series.map((s) => (
                                <SeriesCard
                                    key={s.id}
                                    series={s}
                                    character={characters.find((c) => c.id === s.character_id)}
                                    poses={posesByCharacter[s.character_id]}
                                    jobBusyForSeries={jobBusy && job.seriesId === s.id}
                                    generateBatchCount={batchCounts[s.id] ?? 7}
                                    onChangeBatchCount={(id, v) => setBatchCounts((prev) => ({ ...prev, [id]: v }))}
                                    onGenerate={startGenerate}
                                    onGeneratePoses={startPoseGeneration}
                                    onEdit={setEditingSeries}
                                    onDelete={deleteSeries}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Zone 2: Batch bar / live logs */}
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
                                <button onClick={() => setJob(null)} className="text-muted-foreground hover:text-foreground transition-colors" title="Dismiss">
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

                {/* Zone 3: Deck grid */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <h2 className="text-lg font-semibold text-foreground">Decks</h2>
                        <button
                            onClick={exportSelected}
                            disabled={selectedDeckIds.size === 0 || exporting}
                            className="flex items-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            Export selected {selectedDeckIds.size > 0 ? `(${selectedDeckIds.size})` : ''}
                        </button>
                    </div>

                    {exportResult && (
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

                    {creations.length === 0 ? (
                        <p className="text-sm text-muted-foreground bg-muted border border-border rounded-xl p-6 text-center">
                            No decks yet — generate one from a series above.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {creations.map((c) => {
                                const selected = selectedDeckIds.has(c.id);
                                return (
                                    <div
                                        key={c.id}
                                        className={`bg-card border rounded-xl p-3 space-y-2.5 cursor-pointer transition-colors ${
                                            selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/60'
                                        }`}
                                        onClick={() => setViewingDeckId(c.id)}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <label
                                                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleDeckSelected(c.id)}
                                                    className="accent-[hsl(var(--primary))]"
                                                />
                                                Select
                                            </label>
                                            <StatusChip status={c.status} />
                                        </div>
                                        <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                                            {(c.image_paths || []).map((img, i) => (
                                                <div key={i} className="w-16 aspect-[9/16] bg-black rounded-lg overflow-hidden shrink-0">
                                                    <img src={getApiUrl(img)} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-sm font-medium text-foreground truncate">{c.title || 'Untitled deck'}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {viewingDeck && (
                <CharShowDeckModal
                    creation={viewingDeck}
                    onClose={() => setViewingDeckId(null)}
                    onSaved={(updated) => {
                        setCreations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
                    }}
                />
            )}
        </div>
    );
}
