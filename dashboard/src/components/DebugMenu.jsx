import React, { useState } from 'react';
import { Bug, X, EyeOff } from 'lucide-react';

// Local-only debug menu. Rendered by App when ?debug=true (or the persisted
// `enabled` flag) and not hidden. All state lives in localStorage via setDebug so
// it survives reloads. mockAuth is consumed by App (hides the missing-keys UI);
// mockAI / mockProcessing are persisted flags ready to be read by feature code.
function Toggle({ checked, onChange, label, hint }) {
    return (
        <button onClick={() => onChange(!checked)} className="w-full flex items-start justify-between gap-3 py-2.5 text-left">
            <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                {hint && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
            </div>
            <span className={`mt-0.5 relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary' : 'bg-border'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
            </span>
        </button>
    );
}

export default function DebugMenu({ debug, setDebug }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="fixed bottom-5 right-5 z-[200]">
            {open && (
                <div className="mb-2 w-72 bg-card border border-amber-500/40 rounded-xl shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/30">
                        <span className="text-sm font-bold text-amber-800 flex items-center gap-2"><Bug size={14} /> Debug</span>
                        <button onClick={() => setOpen(false)} className="text-amber-700 hover:text-amber-900 transition-colors"><X size={16} /></button>
                    </div>
                    <div className="px-4 py-1 divide-y divide-border">
                        <Toggle checked={debug.mockAuth} onChange={(v) => setDebug({ mockAuth: v })}
                            label="Mock auth" hint="Treat API keys as set — hides the missing-keys warnings." />
                        <Toggle checked={debug.mockAI} onChange={(v) => setDebug({ mockAI: v })}
                            label="Mock AI responses" hint="Use canned AI output instead of calling Gemini." />
                        <Toggle checked={debug.mockProcessing} onChange={(v) => setDebug({ mockProcessing: v })}
                            label="Mock processing" hint="Skip the backend; return a fake completed job." />
                    </div>
                    <div className="px-4 py-3 border-t border-border">
                        <button
                            onClick={() => setDebug({ hidden: true })}
                            className="w-full flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg py-2 transition-colors"
                        >
                            <EyeOff size={14} /> Hide debug menu (for demos)
                        </button>
                        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                            Re-show by visiting <code className="text-foreground">?debug=true</code>
                        </p>
                    </div>
                </div>
            )}
            <button
                onClick={() => setOpen((o) => !o)}
                title="Debug menu"
                className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg flex items-center justify-center transition-colors active:scale-95"
            >
                <Bug size={18} />
            </button>
        </div>
    );
}
