import React, { useState } from 'react';
import { X, Loader2, Copy, Check, RefreshCw } from 'lucide-react';
import { getApiUrl } from '../config';

const ROLE_LABELS = { hook: 'HOOK', content: 'CONTENT', plug: 'PLUG', cta: 'PLUG' };

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    if (!text) return null;
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
            title="Copy"
        >
            {copied ? <Check size={13} className="text-green-700" /> : <Copy size={13} />}
        </button>
    );
}

export default function CharShowDeckModal({ creation, onClose, onSaved }) {
    const slots = creation.slots || {};
    const roles = slots.roles || [];
    const [texts, setTexts] = useState(() => slots.texts || []);
    const [images, setImages] = useState(() => creation.image_paths || []);
    const [cacheBust, setCacheBust] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [savedNote, setSavedNote] = useState('');

    const setText = (i, value) => setTexts((prev) => prev.map((t, idx) => (idx === i ? value : t)));

    const saveAndRerender = async () => {
        setSaving(true);
        setError('');
        setSavedNote('');
        try {
            const res = await fetch(getApiUrl('/api/charshow/rerender'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creation_id: creation.id, texts }),
            });
            if (!res.ok) throw new Error((await res.text()).slice(0, 200));
            const data = await res.json();
            const updated = data.creation || {};
            if (updated.image_paths) setImages(updated.image_paths);
            setCacheBust(Date.now());
            setSavedNote('Re-rendered');
            onSaved?.({ ...creation, ...updated });
            setTimeout(() => setSavedNote(''), 2500);
        } catch (e) {
            setError(`Re-render failed: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-8" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-full overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{creation.title || 'Deck'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{texts.length} slides</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {savedNote && <span className="text-xs font-medium text-green-700">{savedNote}</span>}
                        {error && <span className="text-xs font-medium text-red-700 max-w-[16rem] truncate">{error}</span>}
                        <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
                    {texts.map((text, i) => {
                        const role = (roles[i] || 'content').toLowerCase();
                        const img = images[i];
                        return (
                            <div key={i} className="flex gap-3 bg-muted border border-border rounded-xl p-3">
                                <div className="w-20 aspect-[9/16] bg-black rounded-lg overflow-hidden shrink-0">
                                    {img && (
                                        <img
                                            src={`${getApiUrl(img)}${cacheBust ? `?t=${cacheBust}` : ''}`}
                                            alt={`Slide ${i + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary-strong inline-block">
                                        {ROLE_LABELS[role] || role.toUpperCase()}
                                    </span>
                                    <textarea
                                        value={text}
                                        onChange={(e) => setText(i, e.target.value)}
                                        rows={2}
                                        className="input-field w-full resize-y text-sm"
                                    />
                                </div>
                            </div>
                        );
                    })}

                    {(slots.caption || slots.first_comment) && (
                        <div className="space-y-2 pt-2 border-t border-border">
                            {slots.caption && (
                                <div className="bg-muted border border-border rounded-lg p-3 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Caption</p>
                                        <p className="text-sm text-foreground whitespace-pre-wrap">{slots.caption}</p>
                                    </div>
                                    <CopyButton text={slots.caption} />
                                </div>
                            )}
                            {slots.first_comment && (
                                <div className="bg-muted border border-border rounded-lg p-3 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">First comment</p>
                                        <p className="text-sm text-foreground whitespace-pre-wrap">{slots.first_comment}</p>
                                    </div>
                                    <CopyButton text={slots.first_comment} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-border shrink-0">
                    <button onClick={saveAndRerender} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        {saving ? 'Re-rendering…' : 'Save & re-render'}
                    </button>
                </div>
            </div>
        </div>
    );
}
