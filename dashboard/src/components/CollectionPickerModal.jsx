import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Upload, Loader2, Images, Check } from 'lucide-react';
import { getApiUrl } from '../config';

/**
 * Pick a preset photo collection for a slide (or create one and upload photos).
 * onPick({ id, name }) is called when the user selects a collection.
 */
export default function CollectionPickerModal({ open, selectedId, onPick, onClose }) {
    const [collections, setCollections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [uploadingId, setUploadingId] = useState(null);
    const fileInputRef = useRef(null);
    const uploadTargetRef = useRef(null);

    const fetchCollections = useCallback(async () => {
        setError('');
        try {
            const res = await fetch(getApiUrl('/api/collections'));
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const data = await res.json();
            setCollections(data.collections || []);
        } catch (err) {
            setError(err.message || 'Failed to load collections.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) fetchCollections();
    }, [open, fetchCollections]);

    if (!open) return null;

    const createCollection = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            const res = await fetch(getApiUrl('/api/collections'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
            });
            if (!res.ok) throw new Error(`Create failed (${res.status})`);
            setNewName('');
            fetchCollections();
        } catch (err) {
            setError(err.message || 'Failed to create collection.');
        } finally {
            setCreating(false);
        }
    };

    const startUpload = (collectionId) => {
        uploadTargetRef.current = collectionId;
        fileInputRef.current?.click();
    };

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files || []);
        const cid = uploadTargetRef.current;
        e.target.value = '';
        if (!files.length || !cid) return;
        setUploadingId(cid);
        setError('');
        try {
            const form = new FormData();
            files.forEach((f) => form.append('files', f));
            const res = await fetch(getApiUrl(`/api/collections/${cid}/images`), {
                method: 'POST',
                body: form,
            });
            if (!res.ok) throw new Error(`Upload failed (${res.status})`);
            fetchCollections();
        } catch (err) {
            setError(err.message || 'Failed to upload images.');
        } finally {
            setUploadingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl shadow-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto custom-scrollbar space-y-4">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleFiles}
                />
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Photo collections</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Each post pulls a random photo from the collection you pick.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex gap-2">
                    <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && createCollection()}
                        placeholder="New collection name (e.g. Gym B-roll)"
                        className="input-field flex-1"
                    />
                    <button
                        onClick={createCollection}
                        disabled={creating || !newName.trim()}
                        className="flex items-center gap-1.5 bg-card border border-border text-foreground hover:bg-muted rounded-xl px-4 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                    >
                        {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Create
                    </button>
                </div>

                {error && <p className="text-sm text-red-700">{error}</p>}

                {loading ? (
                    <div className="flex justify-center py-10">
                        <div className="w-8 h-8 rounded-full border-2 border-border border-t-primary animate-spin" />
                    </div>
                ) : collections.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Images className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-sm font-semibold text-foreground">No collections yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Create one above, then upload a batch of photos to it.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {collections.map((coll) => {
                            const selected = coll.id === selectedId;
                            return (
                                <div
                                    key={coll.id}
                                    className={`border rounded-xl p-3 space-y-2 transition-colors ${
                                        selected
                                            ? 'border-primary ring-2 ring-primary/30'
                                            : 'border-border hover:border-primary/60'
                                    }`}
                                >
                                    <button onClick={() => onPick(coll)} className="block w-full text-left">
                                        <div className="grid grid-cols-4 gap-1 mb-2">
                                            {[0, 1, 2, 3].map((i) => (
                                                <div key={i} className="aspect-square bg-muted rounded overflow-hidden">
                                                    {coll.images[i] ? (
                                                        <img
                                                            src={getApiUrl(coll.images[i].image_path)}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : null}
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                            {selected && <Check size={14} className="text-primary-strong" />}
                                            {coll.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{coll.images.length} photos</p>
                                    </button>
                                    <button
                                        onClick={() => startUpload(coll.id)}
                                        disabled={uploadingId === coll.id}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg py-1.5 transition-colors disabled:opacity-50"
                                    >
                                        {uploadingId === coll.id ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Upload size={12} />
                                        )}
                                        Add photos
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
