import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useMatch } from 'react-router-dom';
import {
    Plus, Loader2, Sparkles, Layers,
    Copy, Check, X, Download,
} from 'lucide-react';
import { getApiUrl } from '../config';
import CharShowSeriesEditor from './CharShowSeriesEditor';
import CharShowDeckModal from './CharShowDeckModal';
import CharShowGenerateModal from './CharShowGenerateModal';
import CharShowJobLogBar from './CharShowJobLogBar';

const POSE_PACK_TARGET = 20;

const STATUS_LABELS = { draft: 'Unpublished', scheduled: 'Scheduled', published: 'Published' };

// Parses either a full ISO timestamp (created_at) or a plain "YYYY-MM-DD" date
// (scheduled_for) into a local "M/D" string, avoiding UTC-midnight shift for
// date-only values.
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

// Formats a "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" value into "M/D" or "M/D h:MM AM/PM".
function formatDateTime(value) {
    if (!value) return '';
    const [datePart, timePart] = value.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    if (!timePart) {
        const dt = new Date(y, m - 1, d);
        if (Number.isNaN(dt.getTime())) return '';
        return dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    }
    const [hh, mm] = timePart.split(':').map(Number);
    const dt = new Date(y, m - 1, d, hh, mm);
    if (Number.isNaN(dt.getTime())) return '';
    const dateStr = dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
}

function statusMeta(status, scheduledFor, publishedAt) {
    if (status === 'published') {
        const dt = formatDateTime(publishedAt);
        return { label: dt ? `Published ${dt}` : STATUS_LABELS.published, classes: 'bg-green-500/10 text-green-700 border-green-500/20', dot: 'bg-green-500' };
    }
    if (status === 'scheduled') {
        const dt = formatDateTime(scheduledFor);
        return { label: dt ? `Scheduled ${dt}` : STATUS_LABELS.scheduled, classes: 'bg-amber-500/10 text-amber-700 border-amber-500/20', dot: 'bg-amber-500' };
    }
    return { label: STATUS_LABELS.draft, classes: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground/40' };
}

const AUDIENCE_LABELS = { men: '♂ men', women: '♀ women' };

function AudiencePill({ audience }) {
    if (!audience || !AUDIENCE_LABELS[audience]) return null;
    return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            {AUDIENCE_LABELS[audience]}
        </span>
    );
}

function SeriesCard({ series, character, poses, jobBusyForSeries, onOpenGenerate, onGeneratePoses, onEdit }) {
    // `poses` is the full fixed pose bank (~20 slots), each flagged `generated` —
    // count only the ones actually rendered, not the bank size.
    const poseTotal = poses?.length || POSE_PACK_TARGET;
    const poseCount = (poses || []).filter((p) => p.generated).length;
    const posesReady = poseCount > 0;
    return (
        <div
            onClick={() => onEdit(series)}
            className="bg-card border border-border rounded-xl p-5 space-y-4 cursor-pointer transition-colors hover:border-primary/60"
        >
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
                    onClick={(e) => { e.stopPropagation(); onGeneratePoses(series); }}
                    disabled={jobBusyForSeries || !series.character_id}
                    className="w-full flex items-center justify-center gap-2 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                >
                    {jobBusyForSeries ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Generate poses
                </button>
            ) : (
                <button
                    onClick={(e) => { e.stopPropagation(); onOpenGenerate(series); }}
                    disabled={jobBusyForSeries}
                    className="w-full btn-primary text-sm py-2.5 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {jobBusyForSeries ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
                    Generate
                </button>
            )}
        </div>
    );
}

export default function CharShowTab({ geminiApiKey, debug, uploadPostKey }) {
    const navigate = useNavigate();
    // The series editor and deck modal are URL-driven (/slideshows/series/:id,
    // /slideshows/decks/:id) so they're deep-linkable and back/forward-navigable.
    // "New series" has no id yet, so it stays local, ephemeral client state instead.
    const seriesRouteMatch = useMatch('/slideshows/series/:id');
    const deckRouteMatch = useMatch('/slideshows/decks/:id');
    const [newSeriesDraft, setNewSeriesDraft] = useState(null); // {} sentinel while creating, else null

    const [series, setSeries] = useState([]);
    const [characters, setCharacters] = useState([]);
    const [creations, setCreations] = useState([]);
    const [posesByCharacter, setPosesByCharacter] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [generatingSeries, setGeneratingSeries] = useState(null); // series object the GenerateModal is open for
    const [selectedDeckIds, setSelectedDeckIds] = useState(() => new Set());
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState(null);
    const [exportCopied, setExportCopied] = useState(false);

    // Multiple concurrent jobs (one per series, generate or pose-pack) — each entry:
    // { clientId, jobId, kind, seriesId, seriesName, characterId, status, logs, result,
    //   startedAt, lastPolledAt, dismissed }. clientId is assigned at creation (before
    // the POST resolves with a real jobId) and is the stable key used to update/find
    // an entry for the rest of its life.
    const [jobs, setJobs] = useState([]);
    const jobsRef = useRef(jobs);
    useEffect(() => { jobsRef.current = jobs; }, [jobs]);

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

    // Job polling — one persistent interval (not one-per-job) that reads the latest
    // jobs off jobsRef each tick and polls every still-processing one concurrently.
    // Reading from the ref instead of closing over `jobs` means the interval never
    // needs to be torn down and recreated just because a new job started or one
    // finished — it always sees the current set.
    useEffect(() => {
        const interval = setInterval(async () => {
            const active = jobsRef.current.filter((j) => j.status === 'processing' && j.jobId);
            if (active.length === 0) return;
            await Promise.all(active.map(async (j) => {
                try {
                    const res = await fetch(getApiUrl(`/api/charshow/status/${j.jobId}`));
                    if (!res.ok) return;
                    const data = await res.json();
                    const now = Date.now();
                    if (data.status === 'completed') {
                        setJobs((prev) => prev.map((x) => (x.clientId === j.clientId
                            ? { ...x, status: 'completed', logs: data.logs || x.logs, result: data.result, lastPolledAt: now }
                            : x)));
                        if (j.kind === 'poses') {
                            fetchPoses(j.characterId);
                        } else {
                            // Merge the just-generated decks in immediately so the log bar's
                            // "Open: <title>" links work the instant they render, without
                            // waiting on fetchCreations' round trip.
                            if (data.result?.creations?.length) {
                                setCreations((prev) => {
                                    const existingIds = new Set(prev.map((c) => c.id));
                                    const fresh = data.result.creations.filter((c) => !existingIds.has(c.id));
                                    return [...fresh, ...prev];
                                });
                            }
                            fetchCreations();
                            fetchSeries();
                        }
                    } else if (data.status === 'failed') {
                        setJobs((prev) => prev.map((x) => (x.clientId === j.clientId
                            ? { ...x, status: 'failed', logs: [...(data.logs || x.logs), data.error || 'Job failed'], lastPolledAt: now }
                            : x)));
                    } else {
                        setJobs((prev) => prev.map((x) => (x.clientId === j.clientId
                            ? { ...x, logs: data.logs || x.logs, lastPolledAt: now }
                            : x)));
                    }
                } catch { /* keep polling */ }
            }));
        }, 2000);
        return () => clearInterval(interval);
    }, [fetchPoses, fetchCreations, fetchSeries]);

    const makeClientId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const startPoseGeneration = async (s) => {
        setError('');
        const clientId = makeClientId();
        const startedAt = Date.now();
        setJobs((prev) => [...prev, {
            clientId, jobId: null, kind: 'poses', seriesId: s.id, seriesName: s.name, characterId: s.character_id,
            status: 'processing', logs: ['Starting pose pack generation…'], result: null, startedAt, lastPolledAt: startedAt, dismissed: false,
        }]);
        try {
            const res = await fetch(getApiUrl('/api/charshow/poses'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}) },
                body: JSON.stringify({ character_id: s.character_id, mock }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            setJobs((prev) => prev.map((j) => (j.clientId === clientId ? { ...j, jobId: data.job_id } : j)));
        } catch (e) {
            setJobs((prev) => prev.map((j) => (j.clientId === clientId ? { ...j, status: 'failed', logs: [...j.logs, `Error: ${e.message}`] } : j)));
        }
    };

    const startGenerate = async (s, { count, audience, topic, schedule }) => {
        setError('');
        const clientId = makeClientId();
        const startedAt = Date.now();
        setJobs((prev) => [...prev, {
            clientId, jobId: null, kind: 'generate', seriesId: s.id, seriesName: s.name, characterId: s.character_id,
            status: 'processing', logs: [`Generating ${count} deck${count === 1 ? '' : 's'}…`], result: null, startedAt, lastPolledAt: startedAt, dismissed: false,
        }]);
        try {
            const res = await fetch(getApiUrl('/api/charshow/generate'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}) },
                body: JSON.stringify({ series_id: s.id, count, audience: audience || null, topic: topic || null, schedule: schedule || null, mock }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            setJobs((prev) => prev.map((j) => (j.clientId === clientId ? { ...j, jobId: data.job_id } : j)));
        } catch (e) {
            setJobs((prev) => prev.map((j) => (j.clientId === clientId ? { ...j, status: 'failed', logs: [...j.logs, `Error: ${e.message}`] } : j)));
        }
    };

    const dismissJob = (clientId) => setJobs((prev) => prev.map((j) => (j.clientId === clientId ? { ...j, dismissed: true } : j)));
    const seriesJobBusy = (seriesId) => jobs.some((j) => j.seriesId === seriesId && j.status === 'processing');

    const saveSeries = async (draft) => {
        const res = await fetch(getApiUrl('/api/charshow/series'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error((await res.text()).slice(0, 200));
        await fetchSeries();
        setNewSeriesDraft(null);
        navigate('/slideshows');
    };

    const deleteSeries = async (s) => {
        if (!window.confirm(`Delete "${s.name}"? Generated decks stay in your Library.`)) return false;
        await fetch(getApiUrl(`/api/charshow/series/${s.id}`), { method: 'DELETE' });
        fetchSeries();
        return true;
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
                body: JSON.stringify({ creation_ids: [...selectedDeckIds], reveal: true }),
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

    const editingSeriesId = seriesRouteMatch?.params?.id || null;
    const editingSeries = newSeriesDraft || (editingSeriesId ? (series.find((s) => s.id === editingSeriesId) || null) : null);
    const viewingDeckId = deckRouteMatch?.params?.id || null;
    const viewingDeck = creations.find((c) => c.id === viewingDeckId) || null;
    const visibleJobs = jobs.filter((j) => !j.dismissed);

    const goToSeries = (s) => navigate(`/slideshows/series/${s.id}`);
    const goToDeck = (id) => navigate(`/slideshows/decks/${id}`);

    const generateModal = generatingSeries && (
        <CharShowGenerateModal
            series={generatingSeries}
            onClose={() => setGeneratingSeries(null)}
            onGenerate={(opts) => {
                startGenerate(generatingSeries, opts);
                setGeneratingSeries(null);
            }}
        />
    );

    const deckModal = viewingDeck && (
        <CharShowDeckModal
            creation={viewingDeck}
            seriesList={series}
            onOpenSeries={goToSeries}
            onClose={() => navigate(-1)}
            onSaved={(updated) => {
                setCreations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
            }}
            onDeleted={(id) => setCreations((prev) => prev.filter((c) => c.id !== id))}
            geminiApiKey={geminiApiKey}
            mock={mock}
            uploadPostKey={uploadPostKey}
        />
    );

    if (editingSeries) {
        return (
            <>
                <CharShowSeriesEditor
                    initialSeries={editingSeries.id ? editingSeries : null}
                    characters={characters}
                    onSave={saveSeries}
                    onCancel={() => { setNewSeriesDraft(null); navigate('/slideshows'); }}
                    onOpenGenerate={setGeneratingSeries}
                    onOpenDeck={goToDeck}
                    onDeleteSeries={async (s) => {
                        const ok = await deleteSeries(s);
                        if (ok) { setNewSeriesDraft(null); navigate('/slideshows'); }
                    }}
                    jobBusyForSeries={seriesJobBusy(editingSeries.id)}
                    jobs={visibleJobs.filter((j) => j.seriesId === editingSeries.id)}
                    onDismissJob={dismissJob}
                />
                {generateModal}
                {deckModal}
            </>
        );
    }

    return (
        <>
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="space-y-8">
                {/* Zone 1: Series */}
                <div className="space-y-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Character Slideshows</h1>
                        <p className="text-xs text-muted-foreground mt-1">
                            A recurring cartoon character, typeset headlines, your app as the payoff. Generate here, post from your phone.
                        </p>
                    </div>

                    {error && <p className="text-sm text-red-700">{error}</p>}

                    <div className="flex items-center justify-between gap-4">
                        <h2 className="text-lg font-semibold text-foreground">Series</h2>
                        <button onClick={() => setNewSeriesDraft({})} className="btn-primary flex items-center gap-2 text-sm">
                            <Plus size={16} /> New series
                        </button>
                    </div>

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
                                    jobBusyForSeries={seriesJobBusy(s.id)}
                                    onOpenGenerate={setGeneratingSeries}
                                    onGeneratePoses={startPoseGeneration}
                                    onEdit={goToSeries}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Zone 2: Batch bar / live logs — one per active job, any series */}
                {visibleJobs.length > 0 && (
                    <div className="space-y-3">
                        {visibleJobs.map((j) => (
                            <CharShowJobLogBar key={j.clientId} job={j} onDismiss={() => dismissJob(j.clientId)} onOpenDeck={goToDeck} />
                        ))}
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
                                const meta = statusMeta(c.status, c.scheduled_for, c.published_at);
                                return (
                                    <div
                                        key={c.id}
                                        className={`bg-card border rounded-xl p-3 space-y-2.5 cursor-pointer transition-colors ${
                                            selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/60'
                                        }`}
                                        onClick={() => goToDeck(c.id)}
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
                                            <span className={`inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${meta.classes}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                                                {meta.label}
                                            </span>
                                        </div>
                                        <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                                            {(c.image_paths || []).map((img, i) => (
                                                <div key={i} className="w-16 aspect-[9/16] bg-black rounded-lg overflow-hidden shrink-0">
                                                    <img src={getApiUrl(img)} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="text-sm font-medium text-foreground truncate">{c.title || 'Untitled deck'}</p>
                                                <AudiencePill audience={c.slots?.audience} />
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5">Created {formatShortDate(c.created_at)}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
        {generateModal}
        {deckModal}
        </>
    );
}
