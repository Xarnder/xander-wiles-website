import { useState } from 'react';
import { ChevronDown, Tag } from 'lucide-react';

export default function GalleryCaptionFilters({ options, selected, onChange, loading }) {
    const [open, setOpen] = useState(() => selected.length > 0);
    // Keep a selected tag removable even if it is absent from the current cache.
    const available = [...options, ...selected.filter((key) => !options.some((option) => option.key === key))
        .map((key) => ({ key, label: key, count: 0 }))];

    return (
        <div className="glass-card p-4 sm:p-5 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => setOpen((value) => !value)}
                    aria-expanded={open} aria-controls="gallery-caption-tag-filters"
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-text focus-visible:outline-2 focus-visible:outline-primary">
                    <Tag className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Caption tags{selected.length > 0 && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs">{selected.length} selected</span>}
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {selected.length > 0 && <button type="button" onClick={() => onChange([])}
                    className="min-h-11 rounded-lg px-3 text-sm text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-primary">
                    Clear tag filters
                </button>}
            </div>
            {open && <div id="gallery-caption-tag-filters" className="mt-3 border-t border-border pt-4">
                <p id="gallery-caption-tag-help" className="mb-3 text-sm text-text-muted">
                    Select tags to show matching photos. Photos with any selected tag are included.
                </p>
                {available.length ? <fieldset aria-describedby="gallery-caption-tag-help" className="flex min-w-0 max-h-64 flex-wrap gap-2 overflow-y-auto p-1">
                    <legend className="sr-only">Filter photos by caption tag</legend>
                    {available.map(({ key, label, count }) => <label key={key}
                        className={`inline-flex min-h-11 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm text-text ${selected.includes(key) ? 'border-primary/50 bg-primary/15' : 'border-border bg-white/5 hover:bg-white/10'}`}>
                        <input type="checkbox" checked={selected.includes(key)}
                            onChange={() => onChange(selected.includes(key) ? selected.filter((tag) => tag !== key) : [...selected, key])}
                            className="h-4 w-4 shrink-0 accent-primary" />
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{label}</span>
                        <span className="shrink-0 text-xs text-text-muted">{count.toLocaleString()}<span className="sr-only"> photos</span></span>
                    </label>)}
                </fieldset> : <p className="text-sm text-text-muted">
                    {loading ? 'Loading caption tags…' : 'No caption tags yet. Add a tag such as Meal to an image caption to filter it here.'}
                </p>}
            </div>}
        </div>
    );
}
