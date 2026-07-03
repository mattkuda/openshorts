import React, { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { getApiUrl } from '../config';

// Settings card for the founder's brand/app (e.g. Evex) — pre-fills every template.
export default function BrandProfileSettings({ brand, onSaved }) {
    const [form, setForm] = useState({
        name: brand?.name || '',
        tagline: brand?.tagline || '',
        app_store_url: brand?.app_store_url || '',
        website_url: brand?.website_url || '',
        cta_text: brand?.cta_text || '',
        niche: brand?.niche || '',
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

    const save = async () => {
        if (!form.name.trim()) { setError('Give your app a name.'); return; }
        setSaving(true);
        setError('');
        try {
            const res = await fetch(getApiUrl('/api/brand'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            onSaved?.(data.brand);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            setError(`Save failed: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const fields = [
        { key: 'name', label: 'App name', placeholder: 'Evex' },
        { key: 'tagline', label: 'Tagline', placeholder: 'The AI fitness app that plans it FOR you' },
        { key: 'niche', label: 'Niche', placeholder: 'fitness apps' },
        { key: 'cta_text', label: 'Default CTA', placeholder: 'Get Evex free — link in bio' },
        { key: 'app_store_url', label: 'App Store URL', placeholder: 'https://apps.apple.com/…' },
        { key: 'website_url', label: 'Website URL', placeholder: 'https://…' },
    ];

    return (
        <div className="glass-panel p-6 mt-8">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Brand Profile</h2>
                <span className="text-[10px] bg-primary/15 border border-primary/30 px-2 py-0.5 rounded text-primary-strong uppercase tracking-wider">Pre-fills templates</span>
            </div>
            <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                Your app is the product every format markets — the payoff slide in listicles, the CTA on end-cards,
                the subject of AI hook suggestions. Set it once.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fields.map((f) => (
                    <div key={f.key}>
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">{f.label}</label>
                        <input value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder} className="input-field" />
                    </div>
                ))}
            </div>
            {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
            <button onClick={save} disabled={saving} className="btn-primary py-2 px-5 text-sm mt-5 flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
                {saved ? 'Saved' : 'Save brand'}
            </button>
        </div>
    );
}
