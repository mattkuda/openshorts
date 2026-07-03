import { useState, useEffect, useCallback } from 'react';
import { Plus, Repeat, Play, Pause, Pencil, Trash2, Sparkles, Loader2, Clock } from 'lucide-react';
import { getApiUrl } from '../config';
import AutomationEditor from './AutomationEditor';

function formatTime(hhmm) {
    const [h, m] = (hhmm || '00:00').split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function scheduleSummary(schedule) {
    const times = schedule?.times || [];
    if (times.length === 0) return 'No posting times';
    const perWeek = times.reduce((n, t) => n + (t.days?.length || 0), 0);
    const label = times.map((t) => formatTime(t.time)).join(', ');
    return `${times.length}×/day · ${perWeek}/week · ${label}`;
}

export default function AutomationsTab({ geminiApiKey, uploadPostKey, uploadUserId, userProfiles, debug }) {
    const [automations, setAutomations] = useState([]);
    const [creations, setCreations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [generatingId, setGeneratingId] = useState(null);
    const [notice, setNotice] = useState('');

    const fetchAll = useCallback(async () => {
        setError('');
        try {
            const [aRes, lRes] = await Promise.all([
                fetch(getApiUrl('/api/automations')),
                fetch(getApiUrl('/api/library')),
            ]);
            if (!aRes.ok) throw new Error(`Request failed (${aRes.status})`);
            const aData = await aRes.json();
            setAutomations(aData.automations || []);
            if (lRes.ok) {
                const lData = await lRes.json();
                setCreations((lData.creations || []).filter((c) => c.kind === 'auto_slideshow'));
            }
        } catch (err) {
            setError(err.message || 'Failed to load automations.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const createAutomation = async () => {
        try {
            const res = await fetch(getApiUrl('/api/automations'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'New automation',
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }),
            });
            if (!res.ok) throw new Error(`Create failed (${res.status})`);
            const data = await res.json();
            setEditingId(data.automation.id);
        } catch (err) {
            setError(err.message || 'Failed to create automation.');
        }
    };

    const toggleStatus = async (auto) => {
        const status = auto.status === 'active' ? 'paused' : 'active';
        await fetch(getApiUrl(`/api/automations/${auto.id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        fetchAll();
    };

    const deleteAutomation = async (auto) => {
        if (!window.confirm(`Delete "${auto.name}"? Generated slideshows stay in your Library.`)) return;
        await fetch(getApiUrl(`/api/automations/${auto.id}`), { method: 'DELETE' });
        fetchAll();
    };

    const generateNow = async (auto) => {
        setGeneratingId(auto.id);
        setError('');
        try {
            const res = await fetch(getApiUrl(`/api/automations/${auto.id}/generate`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(geminiApiKey ? { 'X-Gemini-Key': geminiApiKey } : {}),
                },
                body: JSON.stringify({ mock: !!debug?.mockAI || !geminiApiKey }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            setNotice('Slideshow generated — saved to Library.');
            setTimeout(() => setNotice(''), 4000);
            fetchAll();
        } catch (err) {
            setError(`Generation failed: ${err.message}`);
        } finally {
            setGeneratingId(null);
        }
    };

    if (editingId) {
        return (
            <AutomationEditor
                automationId={editingId}
                geminiApiKey={geminiApiKey}
                uploadPostKey={uploadPostKey}
                uploadUserId={uploadUserId}
                userProfiles={userProfiles}
                debug={debug}
                onBack={() => {
                    setEditingId(null);
                    fetchAll();
                }}
            />
        );
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Slideshow Automations</h1>
                        <p className="text-xs text-muted-foreground mt-1">
                            Recurring TikTok photo carousels — set the recipe once, post on a schedule.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {notice && <span className="text-xs font-medium text-green-700">{notice}</span>}
                        <button onClick={createAutomation} className="btn-primary flex items-center gap-2 text-sm">
                            <Plus size={16} /> New automation
                        </button>
                    </div>
                </div>

                {error && <p className="text-sm text-red-700">{error}</p>}

                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
                    </div>
                ) : automations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Repeat className="w-10 h-10 text-muted-foreground mb-3" />
                        <p className="text-sm font-semibold text-foreground">No automations yet</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                            An automation picks a hook, writes each slide from your directions, generates the
                            images, and posts on your schedule.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {automations.map((auto) => {
                            const recent = creations
                                .filter((c) => c.slots?.automation_id === auto.id)
                                .slice(0, 3);
                            const active = auto.status === 'active';
                            return (
                                <div key={auto.id} className="bg-card border border-border rounded-xl p-5 space-y-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <span
                                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                                active
                                                    ? 'bg-green-500/10 text-green-700'
                                                    : 'bg-muted text-muted-foreground border border-border'
                                            }`}
                                        >
                                            {active ? 'Active' : 'Paused'}
                                        </span>
                                        <button
                                            onClick={() => deleteAutomation(auto)}
                                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                            title="Delete automation"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>

                                    <button onClick={() => setEditingId(auto.id)} className="block w-full text-left">
                                        <p className="text-sm font-semibold text-foreground truncate">{auto.name}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 min-h-[2rem]">
                                            {auto.topic || 'No topic set — click to edit'}
                                        </p>
                                    </button>

                                    <div className="grid grid-cols-3 gap-1.5">
                                        {[0, 1, 2].map((i) => (
                                            <div key={i} className="aspect-[9/16] bg-muted border border-border rounded-lg overflow-hidden">
                                                {recent[i]?.image_paths?.[0] ? (
                                                    <img
                                                        src={getApiUrl(recent[i].image_paths[0])}
                                                        alt={recent[i].title || 'Generated slideshow'}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                            <Clock size={12} /> {scheduleSummary(auto.schedule)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {auto.tiktok?.user_id
                                                ? `Posts as ${auto.tiktok.user_id}`
                                                : 'No TikTok account linked'}
                                        </p>
                                        {auto.last_run_note && auto.last_run_note.startsWith('error') && (
                                            <p className="text-xs text-red-700 line-clamp-2">{auto.last_run_note}</p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            onClick={() => generateNow(auto)}
                                            disabled={generatingId === auto.id}
                                            className="flex-1 flex items-center justify-center gap-1.5 bg-card border border-border text-foreground hover:bg-muted rounded-lg text-sm px-3 py-1.5 transition-colors disabled:opacity-50"
                                        >
                                            {generatingId === auto.id ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Sparkles size={14} />
                                            )}
                                            Generate
                                        </button>
                                        <button
                                            onClick={() => toggleStatus(auto)}
                                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                            title={active ? 'Pause' : 'Resume'}
                                        >
                                            {active ? <Pause size={15} /> : <Play size={15} />}
                                        </button>
                                        <button
                                            onClick={() => setEditingId(auto.id)}
                                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <Pencil size={15} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
