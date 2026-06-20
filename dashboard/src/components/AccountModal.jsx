import React, { useState } from 'react';
import { User, CreditCard, Coins, Link2, Users, Package, Video, Upload, KeyRound, LogOut, ChevronRight, X } from 'lucide-react';

const NAV = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'billing', label: 'Billing & Plans', icon: CreditCard },
    { id: 'credits', label: 'Add Credits', icon: Coins },
    { id: 'connected', label: 'Connected Accounts', icon: Link2 },
    { id: 'team', label: 'Team Members', icon: Users },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'demos', label: 'Demos', icon: Video },
    { id: 'uploads', label: 'Uploaded Videos', icon: Upload },
];

// Account / profile modal. Mirrors the ReelFarm account drawer (left nav + right
// detail panel) in our light + mint style. Most sections are placeholders for now;
// "API Keys" jumps to the real Settings tab.
export default function AccountModal({ isOpen, onClose, user, onOpenSettings }) {
    const [section, setSection] = useState('overview');
    if (!isOpen) return null;

    const Avatar = ({ size }) => (
        <div
            className={`rounded-full bg-gradient-to-br from-primary to-primary-strong flex items-center justify-center text-primary-foreground font-bold shrink-0 ${size === 'lg' ? 'w-12 h-12 text-sm' : 'w-9 h-9 text-xs'}`}
        >
            {user.initials}
        </div>
    );

    const NavButton = ({ item }) => {
        const active = section === item.id;
        const Icon = item.icon;
        return (
            <button
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3 h-10 rounded-lg text-sm transition-colors ${active ? 'bg-muted text-foreground font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
                <span className="flex items-center gap-3"><Icon size={16} className="shrink-0" />{item.label}</span>
                {active && <ChevronRight size={16} className="shrink-0" />}
            </button>
        );
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
            onClick={onClose}
        >
            <div
                className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-3xl h-[600px] max-h-[85vh] flex overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Left nav */}
                <div className="w-64 bg-surface border-r border-border flex flex-col p-3 shrink-0">
                    <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
                        <Avatar />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                    </div>
                    <div className="space-y-0.5 flex-1 overflow-y-auto custom-scrollbar">
                        {NAV.map((item) => <NavButton key={item.id} item={item} />)}
                        <div className="my-2 border-t border-border" />
                        <button
                            onClick={onOpenSettings}
                            className="w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                            <KeyRound size={16} className="shrink-0" /> API Keys
                        </button>
                    </div>
                    <button className="w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mt-1">
                        <LogOut size={16} className="shrink-0" /> Sign Out
                    </button>
                </div>

                {/* Right content */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex items-start justify-between p-6 pb-4">
                        <div className="flex items-center gap-3">
                            <Avatar size="lg" />
                            <div>
                                <h2 className="text-xl font-bold text-foreground">{user.name}</h2>
                                <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6">
                        {section === 'overview' ? (
                            <div>
                                <h3 className="text-lg font-bold text-foreground">Free</h3>
                                <p className="text-sm text-muted-foreground mt-1 mb-5">No active subscription</p>
                                <button className="w-full border border-border rounded-xl py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                                    View Plans
                                </button>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground py-10 text-center">
                                <p className="font-semibold text-foreground mb-1">{NAV.find((n) => n.id === section)?.label}</p>
                                <p>This section is a placeholder for now.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
