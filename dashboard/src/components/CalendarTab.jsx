import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Instagram, Youtube } from 'lucide-react';
import { getApiUrl } from '../config';

// Monday of the week containing `date`, at local midnight.
function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 = Sunday
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function isSameDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function formatRange(weekStart) {
    const weekEnd = addDays(weekStart, 6);
    const startLabel = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endLabel =
        weekStart.getMonth() === weekEnd.getMonth()
            ? weekEnd.getDate()
            : weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${startLabel} – ${endLabel}`;
}

function PlatformChip({ platform }) {
    if (platform === 'instagram') return <Instagram className="w-3 h-3 text-muted-foreground" />;
    if (platform === 'youtube') return <Youtube className="w-3 h-3 text-muted-foreground" />;
    return <span className="text-[10px] font-bold text-muted-foreground">TT</span>;
}

export default function CalendarTab() {
    const [scheduled, setScheduled] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

    const fetchSchedule = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(getApiUrl('/api/schedule'));
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const data = await res.json();
            setScheduled(data.scheduled || []);
        } catch (err) {
            setError(err.message || 'Failed to load schedule.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSchedule();
    }, [fetchSchedule]);

    const handleCancel = async (id) => {
        if (!window.confirm('Cancel this scheduled post?')) return;
        try {
            const res = await fetch(getApiUrl(`/api/schedule/${id}`), { method: 'DELETE' });
            if (!res.ok) throw new Error(`Cancel failed (${res.status})`);
            fetchSchedule();
        } catch (err) {
            setError(err.message || 'Failed to cancel scheduled post.');
        }
    };

    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekEnd = addDays(weekStart, 7);

    const postsForDay = (day) =>
        scheduled
            .filter((post) => {
                const when = new Date(post.scheduled_at);
                return when >= weekStart && when < weekEnd && isSameDay(when, day);
            })
            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    const weekIsEmpty = scheduled.every((post) => {
        const when = new Date(post.scheduled_at);
        return when < weekStart || when >= weekEnd;
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
                    <p className="text-xs text-muted-foreground mt-1">
                        Your scheduled posts across platforms.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setWeekStart((prev) => addDays(prev, -7))}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                        title="Previous week"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setWeekStart((prev) => addDays(prev, 7))}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                        title="Next week"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setWeekStart(startOfWeek(new Date()))}
                        className="bg-card border border-border text-foreground hover:bg-muted rounded-lg text-sm px-3 py-1.5 transition-colors"
                    >
                        Today
                    </button>
                    <span className="text-sm font-semibold text-foreground ml-1">
                        {formatRange(weekStart)}
                    </span>
                </div>
            </div>

            {error && <p className="text-sm text-red-700">{error}</p>}

            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin" />
                </div>
            ) : (
                <div className="relative">
                    <div className="grid grid-cols-7 gap-2">
                        {days.map((day) => {
                            const isToday = isSameDay(day, today);
                            const posts = postsForDay(day);
                            return (
                                <div key={day.toISOString()} className="space-y-2">
                                    <div className="text-center">
                                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                                            {day.toLocaleDateString(undefined, { weekday: 'short' })}
                                        </p>
                                        <span
                                            className={`text-sm ${
                                                isToday
                                                    ? 'bg-primary/20 text-primary-strong rounded-full w-6 h-6 inline-flex items-center justify-center font-semibold'
                                                    : 'text-foreground'
                                            }`}
                                        >
                                            {day.getDate()}
                                        </span>
                                    </div>
                                    <div className="min-h-[320px] bg-surface/50 border border-border rounded-xl p-2 space-y-2">
                                        {posts.map((post) => (
                                            <div
                                                key={post.id}
                                                className={`bg-card border border-border rounded-lg p-2.5 text-left ${
                                                    post.status === 'canceled' ? 'opacity-50 line-through' : ''
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-1">
                                                    <p className="text-xs font-semibold text-foreground">
                                                        {new Date(post.scheduled_at).toLocaleTimeString(undefined, {
                                                            hour: 'numeric',
                                                            minute: '2-digit',
                                                        })}
                                                    </p>
                                                    <button
                                                        onClick={() => handleCancel(post.id)}
                                                        className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
                                                        title="Cancel"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                                    {post.title || 'Untitled'}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-1.5">
                                                    {(post.platforms || []).map((platform) => (
                                                        <PlatformChip key={platform} platform={platform} />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {weekIsEmpty && (
                        <div className="absolute inset-0 top-10 flex items-center justify-center pointer-events-none">
                            <p className="text-sm text-muted-foreground">No posts scheduled this week</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
