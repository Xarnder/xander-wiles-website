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
                    // Check for modern imageUrl or legacy imageMetadata
                    const imgUrl = data.imageUrl || (data.imageMetadata ? data.imageMetadata.url : null);

                    if (imgUrl) {
                        imageEntries.push({
                            id: doc.id,
                            date: data.date.toDate ? data.date.toDate() : parseISO(data.date), // Handle generic timestamp or string
                            title: data.title || 'Untitled',
                            imageUrl: imgUrl
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {entries.map((entry) => (
                        <div
                            key={entry.id}
                            onClick={() => navigate(`/entry/${format(entry.date, 'yyyy-MM-dd')}`)}
                            className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-white/5 border border-white/10 hover:border-primary/50 transition-all duration-300"
                        >
                            <img
                                src={entry.imageUrl}
                                alt={entry.title}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                loading="lazy"
                            />

                            {/* Overlay on hover */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
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
            ) : (
                <div className="flex flex-col items-center justify-center h-64 text-text-muted border-2 border-dashed border-white/10 rounded-xl">
                    <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                    <p>No photos found in your journal.</p>
                </div>
            )}
        </div>
    );
}
