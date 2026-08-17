import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, getDocsFromCache } from 'firebase/firestore';
import { format, isValid, parseISO } from 'date-fns';
import { Image as ImageIcon, Calendar, Star, LayoutGrid, Square, Columns2 } from 'lucide-react';
import ImageWithSkeleton from './ImageWithSkeleton';

const GALLERY_LOAD_TIMEOUT_MS = 12000;
const GALLERY_LOAD_TIMEOUT_CODE = 'journal/gallery-load-timeout';

function getGallerySnapshotWithTimeout(entriesRef) {
    let timeoutId;

    return Promise.race([
        getDocs(entriesRef),
        new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
                const error = new Error('Gallery load timed out');
                error.code = GALLERY_LOAD_TIMEOUT_CODE;
                reject(error);
            }, GALLERY_LOAD_TIMEOUT_MS);
        })
    ]).finally(() => window.clearTimeout(timeoutId));
}

function normalizeEntryImages(data) {
    if (Array.isArray(data.images)) {
        return data.images
            .map((image) => typeof image === 'string' ? { url: image } : image)
            .filter((image) => image && typeof image.url === 'string' && image.url);
    }

    if (typeof data.imageUrl === 'string' && data.imageUrl) {
        return [{ url: data.imageUrl }];
    }

    if (data.imageMetadata && typeof data.imageMetadata.url === 'string' && data.imageMetadata.url) {
        return [{ url: data.imageMetadata.url }];
    }

    return [];
}

function createGalleryEntries(snapshot) {
    const imageEntries = [];

    snapshot.forEach((entryDoc) => {
        const entryDate = parseISO(entryDoc.id);
        if (!isValid(entryDate)) return;

        const data = entryDoc.data();
        const images = normalizeEntryImages(data);
        if (images.length === 0) return;

        imageEntries.push({
            id: entryDoc.id,
            date: entryDate,
            title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Untitled',
            images,
            isSpecial: Boolean(data.isSpecial)
        });
    });

    return imageEntries.sort((a, b) => b.id.localeCompare(a.id));
}

function flattenGalleryImages(entryList) {
    const photos = [];

    entryList.forEach((entry) => {
        entry.images.forEach((image, index) => {
            if (!image?.url) return;
            photos.push({
                key: `${entry.id}-${index}`,
                url: image.url,
                caption: typeof image.caption === 'string' ? image.caption : '',
                entryId: entry.id,
                date: entry.date,
                title: entry.title,
                isSpecial: entry.isSpecial,
                isFirstForEntry: index === 0
            });
        });
    });

    return photos;
}

const GALLERY_MODES = [
    { id: 'grid', icon: LayoutGrid, label: 'Day grid' },
    { id: 'large', icon: Square, label: 'Large days' },
    { id: 'masonry', icon: Columns2, label: 'Masonry photos' }
];

function GallerySkeleton({ galleryMode }) {
    const isMasonry = galleryMode === 'masonry';

    return (
        <div role="status" aria-label="Loading photo gallery" className="space-y-5">
            <span className="sr-only">Loading gallery…</span>
            {!isMasonry && <div className="h-6 w-40 rounded-lg bg-white/10 animate-pulse" />}
            <div className={isMasonry
                ? 'columns-2 md:columns-3 lg:columns-4 gap-4'
                : `grid ${galleryMode === 'large' ? 'grid-cols-1' : 'grid-cols-2'} md:grid-cols-3 lg:grid-cols-4 gap-4`
            }>
                {Array.from({ length: isMasonry ? 12 : 8 }).map((_, index) => (
                    <div
                        key={index}
                        className={`relative overflow-hidden rounded-xl border border-white/10 bg-white/5 ${
                            isMasonry
                                ? `mb-4 break-inside-avoid ${index % 3 === 0 ? 'h-52' : index % 3 === 1 ? 'h-40' : 'h-64'}`
                                : 'aspect-square'
                        }`}
                    >
                        <div
                            className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
                            style={{ backgroundSize: '200% 100%' }}
                        />
                        <div className="absolute inset-x-3 bottom-3 space-y-2">
                            <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
                            <div className="h-4 w-2/3 rounded bg-white/10 animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ImageView() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showInfo, setShowInfo] = useState(true);
    const [galleryMode, setGalleryMode] = useState('grid');
    const [loadError, setLoadError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function fetchImages() {
            if (!currentUser) {
                setEntries([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            setLoadError('');
            const entriesRef = collection(db, 'users', currentUser.uid, 'entries');
            let hasCachedEntries = false;

            try {
                try {
                    const cachedSnapshot = await getDocsFromCache(entriesRef);
                    if (!cancelled && !cachedSnapshot.empty) {
                        hasCachedEntries = true;
                        setEntries(createGalleryEntries(cachedSnapshot));
                        setLoading(false);
                    }
                } catch (cacheError) {
                    console.info('No cached gallery entries were available:', cacheError);
                }

                const serverSnapshot = await getGallerySnapshotWithTimeout(entriesRef);
                if (cancelled) return;

                setEntries(createGalleryEntries(serverSnapshot));
                setLoadError('');
            } catch (error) {
                if (cancelled) return;
                console.error("Error fetching images:", error);
                if (!hasCachedEntries) {
                    setLoadError(
                        error?.code === GALLERY_LOAD_TIMEOUT_CODE
                            ? 'The gallery took too long to load. iOS may have paused the connection. Try again.'
                            : 'The gallery could not be loaded. Check your connection and try again.'
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchImages();

        return () => {
            cancelled = true;
        };
    }, [currentUser, reloadKey]);

    const ITEMS_PER_PAGE = 50;

    const [currentPage, setCurrentPage] = useState(1);

    // Calculate pagination
    const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);

    useEffect(() => {
        if (!loading && entries.length > 0 && location.state?.scrollToId) {
            const targetId = location.state.scrollToId;
            const entryIndex = entries.findIndex(e => e.id === targetId);

            if (entryIndex !== -1) {
                const targetPage = Math.floor(entryIndex / ITEMS_PER_PAGE) + 1;

                if (currentPage !== targetPage) {
                    setCurrentPage(targetPage);
                } else {
                    // Try immediately first
                    const element = document.getElementById(`gallery-item-${targetId}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }

                    // Fallback using timeout to wait for render if page just changed or images loading
                    setTimeout(() => {
                        const el = document.getElementById(`gallery-item-${targetId}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 500);
                }
            }
        }
    }, [loading, entries, location.state, currentPage]);

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedEntries = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    const masonryPhotos = useMemo(() => flattenGalleryImages(paginatedEntries), [paginatedEntries]);

    // Group by month
    const groupedEntries = paginatedEntries.reduce((groups, entry) => {
        const monthYear = format(entry.date, 'MMMM yyyy');
        if (!groups[monthYear]) {
            groups[monthYear] = [];
        }
        groups[monthYear].push(entry);
        return groups;
    }, {});

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    return (
        <div className="space-y-6">
            <div className="glass-card p-6 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white mb-1 flex items-center">
                        <ImageIcon className="w-5 h-5 mr-2 text-primary" />
                        Photo Gallery
                    </h2>
                    <p className="text-text-muted text-sm">A visual journey through your memories</p>
                </div>
                <div className="text-right flex flex-col items-end">
                    <div className="flex items-center space-x-4 mb-2">
                        <div className="flex items-center rounded-lg bg-white/5 p-0.5">
                            {GALLERY_MODES.map((mode) => {
                                const Icon = mode.icon;
                                const isActive = galleryMode === mode.id;
                                return (
                                    <button
                                        key={mode.id}
                                        type="button"
                                        onClick={() => setGalleryMode(mode.id)}
                                        className={`p-2 rounded-md transition-colors ${
                                            isActive
                                                ? 'bg-primary text-white'
                                                : 'text-text-muted hover:bg-white/10 hover:text-white'
                                        }`}
                                        title={mode.label}
                                        aria-label={mode.label}
                                        aria-pressed={isActive}
                                    >
                                        <Icon className="w-5 h-5" />
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => setShowInfo(!showInfo)}
                            className={`p-2 rounded-lg transition-colors ${showInfo ? 'bg-primary text-white' : 'bg-white/5 text-text-muted hover:bg-white/10 hover:text-white'}`}
                            title={showInfo ? "Hide Details" : "Show Details"}
                            aria-label={showInfo ? "Hide photo details" : "Show photo details"}
                            aria-pressed={showInfo}
                        >
                            <ImageIcon className="w-5 h-5" />
                        </button>
                        <div>
                            <p className="text-3xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary leading-none">
                                {entries.length}
                            </p>
                            <p className="text-xs text-text-muted uppercase tracking-wider text-right">Photos</p>
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <GallerySkeleton galleryMode={galleryMode} />
            ) : loadError ? (
                <div role="alert" className="glass-card p-8 text-center">
                    <p className="text-text-secondary mb-4">{loadError}</p>
                    <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="glass-button px-4 py-2 text-text">
                        Try again
                    </button>
                </div>
            ) : entries.length > 0 ? (
                <>
                    {galleryMode === 'masonry' ? (
                        <div className="columns-2 md:columns-3 lg:columns-4 gap-2 sm:gap-4">
                            {masonryPhotos.map((photo) => (
                                <button
                                    type="button"
                                    key={photo.key}
                                    id={photo.isFirstForEntry ? `gallery-item-${photo.entryId}` : undefined}
                                    onClick={() => navigate(`/entry/${format(photo.date, 'yyyy-MM-dd')}`, { state: { fromGallery: true, scrollToId: photo.entryId, from: '/images' } })}
                                    aria-label={`Open ${photo.title} from ${format(photo.date, 'MMMM d, yyyy')}`}
                                    className={`group mb-2 sm:mb-4 w-full break-inside-avoid overflow-hidden rounded-xl border bg-white/5 text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary ${
                                        photo.isSpecial ? 'border-yellow-400 ring-2 ring-yellow-400/30' : 'border-white/10 hover:border-primary/50'
                                    }`}
                                >
                                    <div className="relative">
                                        <ImageWithSkeleton
                                            src={photo.url}
                                            alt={photo.title}
                                            className="w-full"
                                            imgClassName="block h-auto w-full transition-transform duration-500 group-hover:scale-[1.03]"
                                        />

                                        {photo.isSpecial && (
                                            <div className="absolute top-2 left-2 z-10 rounded-full bg-yellow-400 p-1 text-[#1a1b1e] shadow-lg">
                                                <Star className="h-3.5 w-3.5 fill-[#1a1b1e]" />
                                            </div>
                                        )}

                                        <div className={`absolute inset-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 transition-opacity duration-300 ${showInfo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                            <div className={`transform transition-transform duration-300 ${showInfo ? 'translate-y-0' : 'translate-y-4 group-hover:translate-y-0'}`}>
                                                <p className="mb-1 flex items-center text-xs font-extrabold text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)]">
                                                    <Calendar className="mr-1 h-3.5 w-3.5 drop-shadow-md" />
                                                    {format(photo.date, 'MMM d, yyyy')}
                                                </p>
                                                <p className="line-clamp-2 font-serif text-sm font-bold text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)]">
                                                    {photo.title}
                                                </p>
                                                {photo.caption && (
                                                    <p className="mt-1 line-clamp-2 text-[11px] italic text-white/80">
                                                        {photo.caption}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <>
                    {Object.entries(groupedEntries).map(([monthYear, monthEntries]) => (
                        <div key={monthYear} className="space-y-4">
                            <h3 className="text-lg font-bold text-white/80 border-b border-white/10 pb-2 flex items-center">
                                <Calendar className="w-4 h-4 mr-2 text-primary" />
                                {monthYear}
                            </h3>
                            <div className={`grid ${galleryMode === 'large' ? 'grid-cols-1' : 'grid-cols-2'} md:grid-cols-3 lg:grid-cols-4 gap-4`}>
                                {monthEntries.map((entry) => (
                                    <button
                                        type="button"
                                        key={entry.id}
                                        id={`gallery-item-${entry.id}`}
                                        onClick={() => navigate(`/entry/${format(entry.date, 'yyyy-MM-dd')}`, { state: { fromGallery: true, scrollToId: entry.id, from: '/images' } })}
                                        aria-label={`Open ${entry.title} from ${format(entry.date, 'MMMM d, yyyy')}`}
                                        className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-white/5 border text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary ${entry.isSpecial ? 'border-yellow-400 ring-2 ring-yellow-400/30' : 'border-white/10 hover:border-primary/50'}`}
                                    >
                                        <div className={`w-full h-full relative ${entry.images.length > 1 ? 'grid grid-cols-2 grid-rows-2 gap-[1px]' : ''}`}>
                                            {entry.images.length === 1 ? (
                                                <ImageWithSkeleton
                                                    src={entry.images[0].url}
                                                    alt={entry.title}
                                                    className="w-full h-full"
                                                    imgClassName="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                />
                                            ) : (
                                                entry.images.slice(0, 4).map((img, i) => (
                                                    <ImageWithSkeleton
                                                        key={`${entry.id}-${img.url}-${i}`}
                                                        src={img.url}
                                                        alt={`${entry.title} ${i}`}
                                                        className={`w-full h-full ${entry.images.length === 2 ? 'col-span-2 last:col-span-2 row-span-1' : ''} ${entry.images.length === 3 && i === 0 ? 'col-span-2' : ''}`}
                                                        imgClassName="w-full h-full object-cover"
                                                    />
                                                ))
                                            )}

                                            {entry.images.length > 1 && (
                                                <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm z-10 flex items-center">
                                                    <ImageIcon className="w-3 h-3 mr-1" />
                                                    {entry.images.length}
                                                </div>
                                            )}

                                            {entry.isSpecial && (
                                                <div className="absolute top-2 left-2 bg-yellow-400 text-[#1a1b1e] p-1 rounded-full shadow-lg z-10">
                                                    <Star className="w-3.5 h-3.5 fill-[#1a1b1e]" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Overlay on hover or when showInfo is true */}
                                        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300 flex flex-col justify-end p-4 z-20 ${showInfo ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                            <div className={`transform transition-transform duration-300 ${showInfo ? 'translate-y-0' : 'translate-y-4 group-hover:translate-y-0'}`}>
                                                <p className="text-sm text-white font-extrabold mb-1 flex items-center drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)]">
                                                    <Calendar className="w-4 h-4 mr-1 drop-shadow-md" />
                                                    {format(entry.date, 'MMM d, yyyy')}
                                                </p>
                                                <p className="text-white font-serif font-bold line-clamp-2 text-sm drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)]">
                                                    {entry.title}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                        </>
                    )}

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center space-x-4 pt-6 pb-8">
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="glass-button px-4 py-2 text-text hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <span className="text-text-muted">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="glass-button px-4 py-2 text-text hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div className="flex flex-col items-center justify-center h-64 text-text-muted border-2 border-dashed border-white/10 rounded-xl">
                    <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                    <p>No photos found in your journal.</p>
                </div>
            )}
        </div>
    );
}
