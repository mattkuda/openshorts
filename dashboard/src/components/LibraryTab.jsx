import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Calendar, Trash2, LayoutGrid, X, Pencil, Loader2, Download } from 'lucide-react';
import { getApiUrl } from '../config';

const KIND_LABELS = {
    hook_demo: 'Hook + Demo',
    listicle: 'Listicle',
    before_after: 'Before / After',
    ai_talking_head: 'AI Ad',
    auto_slideshow: 'Slideshow',
};

const STATUS_STYLES = {
    draft: 'bg-muted text-muted-foreground border border-border',
    scheduled: 'bg-amber-500/10 text-amber-700',
    published: 'bg-green-500/10 text-green-700',
};

const PLATFORMS = ['tiktok', 'instagram', 'youtube'];

export default function LibraryTab({ uploadPostKey, uploadUserId, debug }) {
    const [creations, setCreations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Edit-slides dialog state (auto_slideshow drafts — the review gate)
    const [editTarget, setEditTarget] = useState(null);
    const [editTexts, setEditTexts] = useState([]);
    const [rerendering, setRerendering] = useState(false);
    const [editError, setEditError] = useState('');

    // Schedule dialog state
    const [scheduleTarget, setScheduleTarget] = useState(null);
    const [selectedPlatforms, setSelectedPlatforms] = useState(['tiktok']);
    const [scheduledAt, setScheduledAt] = useState('');
    const [scheduling, setScheduling] = useState(false);
    const [scheduleError, setScheduleError] = useState('');
    const [scheduleSuccess, setScheduleSuccess] = useState('');

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const fetchLibrary = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(getApiUrl('/api/library'));
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const data = await res.json();
            setCreations(data.creations || []);
        } catch (err) {
            setError(err.message || 'Failed to load library.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLibrary();
    }, [fetchLibrary]);

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this creation? This cannot be undone.')) return;
        try {
            const res = await fetch(getApiUrl(`/api/library/${id}`), { method: 'DELETE' });
            if (!res.ok) throw new Error(`Delete failed (${res.status})`);
            fetchLibrary();
        } catch (err) {
            setError(err.message || 'Failed to delete creation.');
        }
    };

    const openScheduleDialog = (creation) => {
        setScheduleTarget(creation);
        setSelectedPlatforms(['tiktok']);
        setScheduledAt('');
        setScheduleError('');
    };

    const closeScheduleDialog = () => {
        setScheduleTarget(null);
        setScheduleError('');
    };

    const togglePlatform = (platform) => {
        setSelectedPlatforms((prev) =>
            prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
        );
    };

    const handleSchedule = async () => {
        if (!scheduleTarget || selectedPlatforms.length === 0 || !scheduledAt) {
            setScheduleError('Pick at least one platform and a date/time.');
            return;
        }
        setScheduling(true);
        setScheduleError('');
        try {
            const res = await fetch(getApiUrl('/api/schedule'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    creation_id: scheduleTarget.id,
                    platforms: selectedPlatforms,
                    scheduled_at: new Date(scheduledAt).toISOString(),
                    timezone,
                    title: scheduleTarget.title,
                    api_key: uploadPostKey,
                    user_id: uploadUserId,
                    mock: !!debug?.mockAI,
                }),
            });
            if (!res.ok) throw new Error(`Schedule failed (${res.status})`);
            closeScheduleDialog();
            setScheduleSuccess('Post scheduled.');
            setTimeout(() => setScheduleSuccess(''), 4000);
            fetchLibrary();
        } catch (err) {
            setScheduleError(err.message || 'Failed to schedule post.');
        } finally {
            setScheduling(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Library</h1>
                    <p className="text-xs text-muted-foreground mt-1">
                        Everything you&apos;ve generated — reopen, schedule, or delete.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {scheduleSuccess && (
                        <span className="text-xs font-medium text-green-700">{scheduleSuccess}</span>
                    )}
                    <button
                        onClick={fetchLibrary}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {error && <p className="text-sm text-red-700">{error}</p>}

            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
                </div>
            ) : creations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <LayoutGrid className="w-10 h-10 text-muted-foreground mb-3" />
                    <p className="text-sm font-semibold text-foreground">Nothing here yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Generate your first post from the Create tab.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {creations.map((creation) => (
                        <div key={creation.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
                            <div className="aspect-[9/16] max-h-64 mx-auto bg-black rounded-lg overflow-hidden">
                                {creation.video_path ? (
                                    <video
                                        src={getApiUrl(creation.video_path)}
                                        controls
                                        className="w-full h-full object-contain"
                                    />
                                ) : creation.image_paths?.length ? (
                                    <img
                                        src={getApiUrl(creation.image_paths[0])}
                                        alt={creation.title || 'Creation preview'}
                                        className="w-full h-full object-contain"
                                    />
                                ) : null}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong">
                                    {KIND_LABELS[creation.kind] || creation.kind}
                                </span>
                                <span
                                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[creation.status] || STATUS_STYLES.draft}`}
                                >
                                    {creation.status}
                                </span>
                            </div>

                            <div>
                                <p className="text-sm font-semibold text-foreground line-clamp-2">
                                    {creation.title || 'Untitled'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {creation.created_at
                                        ? new Date(creation.created_at).toLocaleDateString(undefined, {
                                              year: 'numeric',
                                              month: 'short',
                                              day: 'numeric',
                                          })
                                        : ''}
                                </p>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => openScheduleDialog(creation)}
                                        className="flex items-center gap-1.5 bg-card border border-border text-foreground hover:bg-muted rounded-lg text-sm px-3 py-1.5 transition-colors"
                                    >
                                        <Calendar className="w-4 h-4" />
                                        Schedule
                                    </button>
                                    {creation.kind === 'auto_slideshow' && creation.slots?.raws?.length > 0 && (
                                        <button
                                            onClick={() => {
                                                setEditTarget(creation);
                                                setEditTexts([...(creation.slots.texts || [])]);
                                                setEditError('');
                                            }}
                                            className="flex items-center gap-1.5 bg-card border border-border text-foreground hover:bg-muted rounded-lg text-sm px-3 py-1.5 transition-colors"
                                        >
                                            <Pencil className="w-4 h-4" />
                                            Edit slides
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center">
                                    {(creation.image_paths?.length > 0 || creation.video_path) && (
                                        <a
                                            href={getApiUrl(`/api/library/${creation.id}/download`)}
                                            download
                                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                            title="Download images + video as ZIP"
                                        >
                                            <Download className="w-4 h-4" />
                                        </a>
                                    )}
                                    <button
                                        onClick={() => handleDelete(creation.id)}
                                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit slides dialog (review gate for automation drafts) */}
            {editTarget && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-2xl shadow-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto custom-scrollbar space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">Edit slide text</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Re-renders on the same images — no new AI cost. Numbers are part of the text here.
                                </p>
                            </div>
                            <button
                                onClick={() => setEditTarget(null)}
                                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            {editTexts.map((text, i) => (
                                <div key={i} className="flex gap-3 items-start">
                                    <img
                                        src={getApiUrl(editTarget.slots.raws[i])}
                                        alt=""
                                        className="w-12 aspect-[9/16] object-cover rounded-lg border border-border shrink-0"
                                    />
                                    <div className="flex-1">
                                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                                            Slide {i + 1}
                                            {editTarget.slots.roles?.[i] && editTarget.slots.roles[i] !== 'content'
                                                ? ` · ${editTarget.slots.roles[i]}`
                                                : ''}
                                        </label>
                                        <textarea
                                            value={text}
                                            onChange={(e) =>
                                                setEditTexts((prev) => prev.map((t, idx) => (idx === i ? e.target.value : t)))
                                            }
                                            rows={2}
                                            className="input-field w-full resize-y text-sm"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {editError && <p className="text-sm text-red-700">{editError}</p>}

                        <button
                            onClick={async () => {
                                setRerendering(true);
                                setEditError('');
                                try {
                                    const res = await fetch(getApiUrl('/api/automations/rerender'), {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ creation_id: editTarget.id, texts: editTexts }),
                                    });
                                    if (!res.ok) throw new Error((await res.text()).slice(0, 200));
                                    setEditTarget(null);
                                    setScheduleSuccess('Slides re-rendered.');
                                    setTimeout(() => setScheduleSuccess(''), 4000);
                                    fetchLibrary();
                                } catch (err) {
                                    setEditError(err.message || 'Re-render failed.');
                                } finally {
                                    setRerendering(false);
                                }
                            }}
                            disabled={rerendering}
                            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {rerendering && <Loader2 size={16} className="animate-spin" />}
                            {rerendering ? 'Re-rendering…' : 'Save & re-render'}
                        </button>
                    </div>
                </div>
            )}

            {/* Schedule dialog */}
            {scheduleTarget && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-2xl shadow-xl p-6 max-w-md w-full space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">Schedule post</h2>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                    {scheduleTarget.title || 'Untitled'}
                                </p>
                            </div>
                            <button
                                onClick={closeScheduleDialog}
                                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                                Platforms
                            </p>
                            <div className="flex gap-2">
                                {PLATFORMS.map((platform) => {
                                    const selected = selectedPlatforms.includes(platform);
                                    return (
                                        <button
                                            key={platform}
                                            onClick={() => togglePlatform(platform)}
                                            className={`text-xs font-medium px-3 py-1.5 rounded-lg border capitalize transition-colors ${
                                                selected
                                                    ? 'border-primary bg-primary/10 text-primary-strong'
                                                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                                            }`}
                                        >
                                            {platform}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                                Date &amp; time
                            </label>
                            <input
                                type="datetime-local"
                                value={scheduledAt}
                                onChange={(e) => setScheduledAt(e.target.value)}
                                className="input-field w-full"
                            />
                            <p className="text-xs text-muted-foreground mt-1.5">Timezone: {timezone}</p>
                        </div>

                        {scheduleError && <p className="text-sm text-red-700">{scheduleError}</p>}

                        <button
                            onClick={handleSchedule}
                            disabled={scheduling}
                            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {scheduling ? 'Scheduling…' : 'Schedule'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
