import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { Image as ImageIcon, Calendar } from 'lucide-react';

export default function ImageView() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchImages() {
            if (!currentUser) return;
            setLoading(true);
            try {
                // Fetch all entries ordered by date desc
                // We filter partially on client side to handle legacy schema differences effortlessly
                const q = query(
                    collection(db, 'users', currentUser.uid, 'entries'),
                    orderBy('date', 'desc')
                );

                const querySnapshot = await getDocs(q);
                const imageEntries = [];

                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    const entryImages = [];
                    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                        entryImages.push(...data.images);
                    } else if (data.imageUrl) {
                        entryImages.push({ url: data.imageUrl });
                    } else if (data.imageMetadata) {
                        entryImages.push({ url: data.imageMetadata.url });
                    }

                    if (entryImages.length > 0) {
                        imageEntries.push({
                            id: doc.id,
                            date: data.date.toDate ? data.date.toDate() : parseISO(data.date), // Handle generic timestamp or string
                            title: data.title || 'Untitled',
                            images: entryImages // Array of { url }
                        });
                    }
                });

                setEntries(imageEntries);
            } catch (error) {
                console.error("Error fetching images:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchImages();
    }, [currentUser]);

    const ITEMS_PER_PAGE = 50;

    const [currentPage, setCurrentPage] = useState(1);

    // Calculate pagination
    const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedEntries = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE);

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
                <div className="text-right">
                    <p className="text-3xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                        {entries.length}
                    </p>
                    <p className="text-xs text-text-muted uppercase tracking-wider">Photos</p>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-text-muted animate-pulse">
                    <div className="w-12 h-12 bg-white/10 rounded-full mb-4"></div>
                    <p>Loading gallery...</p>
                </div>
            ) : entries.length > 0 ? (
                <>
                    {Object.entries(groupedEntries).map(([monthYear, monthEntries]) => (
                        <div key={monthYear} className="space-y-4">
                            <h3 className="text-lg font-bold text-white/80 border-b border-white/10 pb-2 flex items-center">
                                <Calendar className="w-4 h-4 mr-2 text-primary" />
                                {monthYear}
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {monthEntries.map((entry) => (
                                    <div
                                        key={entry.id}
                                        onClick={() => navigate(`/entry/${format(entry.date, 'yyyy-MM-dd')}`)}
                                        className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-white/5 border border-white/10 hover:border-primary/50 transition-all duration-300"
                                    >
                                        <div className={`w-full h-full relative ${entry.images.length > 1 ? 'grid grid-cols-2 grid-rows-2 gap-[1px]' : ''}`}>
                                            {entry.images.length === 1 ? (
                                                <img
                                                    src={entry.images[0].url}
                                                    alt={entry.title}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                entry.images.slice(0, 4).map((img, i) => (
                                                    <img
                                                        key={i}
                                                        src={img.url}
                                                        alt={`${entry.title} ${i}`}
                                                        className={`w-full h-full object-cover ${entry.images.length === 2 ? 'col-span-2 last:col-span-2 row-span-1' : ''} ${entry.images.length === 3 && i === 0 ? 'col-span-2' : ''}`}
                                                        loading="lazy"
                                                    />
                                                ))
                                            )}

                                            {entry.images.length > 1 && (
                                                <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm z-10 flex items-center">
                                                    <ImageIcon className="w-3 h-3 mr-1" />
                                                    {entry.images.length}
                                                </div>
                                            )}
                                        </div>

                                        {/* Overlay on hover */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 z-20">
                                            <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                                <p className="text-xs text-primary font-bold mb-1 flex items-center">
                                                    <Calendar className="w-3 h-3 mr-1" />
                                                    {format(entry.date, 'MMM d, yyyy')}
                                                </p>
                                                <p className="text-white font-serif font-medium line-clamp-2 text-sm">
                                                    {entry.title}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

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
