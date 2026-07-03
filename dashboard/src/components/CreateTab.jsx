import React, { useState, useEffect } from 'react';
import { Clapperboard, ListOrdered, ArrowLeftRight, Bot, ArrowRight } from 'lucide-react';
import HookDemoComposer from './HookDemoComposer';
import SlideshowEditor from './SlideshowEditor';
import { getApiUrl } from '../config';

const FORMAT_META = {
    hook_demo: { icon: Clapperboard, tag: 'Video' },
    listicle: { icon: ListOrdered, tag: 'Slideshow' },
    before_after: { icon: ArrowLeftRight, tag: 'Slideshow' },
    ai_talking_head: { icon: Bot, tag: 'AI Actor' },
};

export default function CreateTab({ geminiApiKey, uploadPostKey, uploadUserId, debug, brand, onOpenTab }) {
    const [templates, setTemplates] = useState([]);
    const [active, setActive] = useState(null); // template key being edited
    const [error, setError] = useState('');

    useEffect(() => {
        fetch(getApiUrl('/api/templates'))
            .then((r) => r.json())
            .then((d) => setTemplates(d.templates || []))
            .catch(() => setError('Could not load templates — is the backend running?'));
    }, []);

    const openTemplate = (t) => {
        if (t.kind === 'external') {
            onOpenTab(t.route || 'saasshorts');
            return;
        }
        setActive(t);
    };

    if (active?.key === 'hook_demo') {
        return (
            <HookDemoComposer
                geminiApiKey={geminiApiKey}
                uploadPostKey={uploadPostKey}
                uploadUserId={uploadUserId}
                debug={debug}
                brand={brand}
                onBack={() => setActive(null)}
            />
        );
    }
    if (active && active.kind === 'slideshow') {
        return (
            <SlideshowEditor
                template={active}
                geminiApiKey={geminiApiKey}
                debug={debug}
                brand={brand}
                onBack={() => setActive(null)}
            />
        );
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 md:p-10 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-4xl mx-auto space-y-10">
                <div className="text-center space-y-4 pt-6">
                    <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
                        Generate your UGC marketing
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                        Pick a proven format, drop in your app, and get a post-ready vertical clip in minutes
                        {brand?.name ? <> — built around <span className="font-semibold text-foreground">{brand.name}</span>.</> : '.'}
                    </p>
                </div>

                {error && <p className="text-sm text-red-700 text-center">{error}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {templates.map((t) => {
                        const meta = FORMAT_META[t.key] || { icon: Clapperboard, tag: 'Format' };
                        const Icon = meta.icon;
                        return (
                            <button
                                key={t.key}
                                onClick={() => openTemplate(t)}
                                className="group bg-card border border-border rounded-xl p-5 text-left hover:border-primary/60 hover:shadow-md transition-all cursor-pointer"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="w-11 h-11 rounded-xl bg-primary/15 text-primary-strong flex items-center justify-center">
                                        <Icon size={22} />
                                    </div>
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                        {meta.tag}
                                    </span>
                                </div>
                                <h3 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                                    {t.name}
                                    <ArrowRight size={16} className="text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                </h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{t.description}</p>
                            </button>
                        );
                    })}
                </div>

                <p className="text-xs text-muted-foreground text-center pb-8">
                    Every format stays editable after it renders — tweak the text, re-render, no external editor.
                </p>
            </div>
        </div>
    );
}
