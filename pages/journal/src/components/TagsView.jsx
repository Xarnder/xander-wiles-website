import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { format, subDays, subMonths, subYears, startOfDay, parseISO } from 'date-fns';
import { Tag, Plus, Trash2, TrendingUp, Calendar, ArrowRight } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

export default function TagsView() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [tags, setTags] = useState([]);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#8b5cf6'); // Default primary purple
    const [isAdding, setIsAdding] = useState(false);
    const [selectedTagId, setSelectedTagId] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [tagToDelete, setTagToDelete] = useState(null);

    // Fetch tags
    useEffect(() => {
        if (!currentUser) return;
        setLoading(true);

        const tagsQuery = query(collection(db, 'users', currentUser.uid, 'tags'));
        const unsubscribeTags = onSnapshot(tagsQuery, (snapshot) => {
            const fetchedTags = [];
            snapshot.forEach(doc => {
                fetchedTags.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            // Sort by name
            fetchedTags.sort((a, b) => a.name.localeCompare(b.name));
            setTags(fetchedTags);
        });

        // We need all entries from the past year to compute stats
        const oneYearAgoStr = format(subYears(new Date(), 1), 'yyyy-MM-dd');
        const entriesQuery = query(
            collection(db, 'users', currentUser.uid, 'entries'),
            where('__name__', '>=', oneYearAgoStr) // We query by document ID which is YYYY-MM-DD
        );

        const unsubscribeEntries = onSnapshot(entriesQuery, (snapshot) => {
            const fetchedEntries = [];
            snapshot.forEach(doc => {
                fetchedEntries.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            setEntries(fetchedEntries);
            setLoading(false);
        });

        return () => {
            unsubscribeTags();
            unsubscribeEntries();
        };
    }, [currentUser]);

    const handleAddTag = async (e) => {
        e.preventDefault();
        if (!newTagName.trim() || !currentUser) return;

        setIsAdding(true);
        try {
            await addDoc(collection(db, 'users', currentUser.uid, 'tags'), {
                name: newTagName.trim(),
                color: newTagColor,
                createdAt: serverTimestamp()
            });
            setNewTagName('');
            // Optional: generate a random color or keep same
        } catch (error) {
            console.error("Error adding tag:", error);
        } finally {
            setIsAdding(false);
        }
    };

    const handleDeleteTagClick = (e, tagId) => {
        e.stopPropagation();
        setTagToDelete(tagId);
        setIsDeleteModalOpen(true);
    };

    const confirmDeleteTag = async () => {
        if (!currentUser || !tagToDelete) return;

        try {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'tags', tagToDelete));
            if (selectedTagId === tagToDelete) {
                setSelectedTagId(null);
            }
        } catch (error) {
            console.error("Error deleting tag:", error);
        } finally {
            setTagToDelete(null);
            setIsDeleteModalOpen(false);
        }
    };

    // Calculate tag statistics
    const tagStats = useMemo(() => {
        const stats = {};
        const now = new Date();
        const oneWeekAgo = startOfDay(subDays(now, 7));
        const oneMonthAgo = startOfDay(subMonths(now, 1));
        const sixMonthsAgo = startOfDay(subMonths(now, 6));
        const oneYearAgo = startOfDay(subYears(now, 1));

        // Initialize stats object for all existing tags
        tags.forEach(tag => {
            stats[tag.id] = { weed: 0, month: 0, sixMonths: 0, year: 0 };
        });

        entries.forEach(entry => {
            if (!entry.tags || !Array.isArray(entry.tags)) return;

            const entryDate = parseISO(entry.id);
            if (isNaN(entryDate.getTime())) return;

            entry.tags.forEach(tagId => {
                if (!stats[tagId]) {
                    // It's possible an entry has a tag that was deleted. Still track if we want, but UI will skip if not in `tags` list
                    stats[tagId] = { week: 0, month: 0, sixMonths: 0, year: 0 };
                }

                if (entryDate >= oneWeekAgo) stats[tagId].week++;
                if (entryDate >= oneMonthAgo) stats[tagId].month++;
                if (entryDate >= sixMonthsAgo) stats[tagId].sixMonths++;
                if (entryDate >= oneYearAgo) stats[tagId].year++;
            });
        });

        return stats;
    }, [tags, entries]);
    // Helper to extract title
    const extractTitle = (content, storedTitle) => {
        if (!content) return storedTitle || '';
        const match = content.match(/(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/);
        if (match && match[1]) {
            const parts = match[1].split(' - ');
            if (parts.length >= 2) return parts.slice(1).join(' - ').trim();
            return match[1].trim();
        }
        return storedTitle || '';
    };

    const selectedTagEntries = useMemo(() => {
        if (!selectedTagId) return [];
        return entries
            .filter(e => e.tags && e.tags.includes(selectedTagId))
            .sort((a, b) => b.id.localeCompare(a.id)); // Newest first
    }, [entries, selectedTagId]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animation-fade-in pb-10">
            {/* Header */}
            <div className="glass-card p-4 flex justify-between items-center">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Tag className="text-primary w-5 h-5" />
                    Tags Definition & Stats
                </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Add new tag card */}
                <div className="glass-card p-6 lg:col-span-1 h-fit">
                    <h3 className="text-lg font-serif font-bold text-white mb-4">Create New Tag</h3>
                    <form onSubmit={handleAddTag} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-1">Tag Name</label>
                            <input
                                type="text"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                placeholder="e.g. Exercised, Read, Coding..."
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-1">Tag Color</label>
                            <div className="flex gap-3 items-center">
                                <input
                                    type="color"
                                    value={newTagColor}
                                    onChange={(e) => setNewTagColor(e.target.value)}
                                    className="h-10 w-16 p-1 bg-white/5 border border-white/10 rounded-lg cursor-pointer"
                                />
                                <div className="text-sm font-mono text-text-muted">{newTagColor}</div>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isAdding || !newTagName.trim()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary text-white rounded-lg transition-colors border border-primary/50"
                        >
                            <Plus className="w-4 h-4" />
                            {isAdding ? 'Adding...' : 'Add Tag'}
                        </button>
                    </form>
                </div>

                {/* Tag List & Stats */}
                <div className="glass-card p-6 lg:col-span-2">
                    <h3 className="text-lg font-serif font-bold text-white mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-secondary" /> Usage Statistics
                    </h3>

                    {tags.length === 0 ? (
                        <div className="text-text-muted text-center py-8">
                            No tags created yet. Create one to start categorizing your entries!
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/10 text-text-muted text-sm">
                                        <th className="pb-3 px-2 font-medium">Tag</th>
                                        <th className="pb-3 px-2 font-medium text-center">Past Week</th>
                                        <th className="pb-3 px-2 font-medium text-center">Past Month</th>
                                        <th className="pb-3 px-2 font-medium text-center">Past 6 Months</th>
                                        <th className="pb-3 px-2 font-medium text-center">Past Year</th>
                                        <th className="pb-3 px-2 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tags.map(tag => {
                                        const stat = tagStats[tag.id] || { week: 0, month: 0, sixMonths: 0, year: 0 };
                                        return (
                                            <tr
                                                key={tag.id}
                                                onClick={() => setSelectedTagId(selectedTagId === tag.id ? null : tag.id)}
                                                className={`border-b border-white/5 transition-colors cursor-pointer ${selectedTagId === tag.id ? 'bg-primary/20' : 'hover:bg-white/5'}`}
                                            >
                                                <td className="py-3 px-2">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className="w-3 h-3 rounded-full shadow-sm"
                                                            style={{ backgroundColor: tag.color }}
                                                        />
                                                        <span className="font-medium text-white">{tag.name}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-2 text-center text-text-muted">
                                                    {stat.week > 0 ? <span className="text-blue-400 font-bold">{stat.week}</span> : '0'}
                                                </td>
                                                <td className="py-3 px-2 text-center text-text-muted">
                                                    {stat.month > 0 ? <span className="text-green-400 font-bold">{stat.month}</span> : '0'}
                                                </td>
                                                <td className="py-3 px-2 text-center text-text-muted">
                                                    {stat.sixMonths > 0 ? <span className="text-yellow-400 font-bold">{stat.sixMonths}</span> : '0'}
                                                </td>
                                                <td className="py-3 px-2 text-center text-text-muted">
                                                    {stat.year > 0 ? <span className="text-purple-400 font-bold">{stat.year}</span> : '0'}
                                                </td>
                                                <td className="py-3 px-2 text-right">
                                                    <button
                                                        onClick={(e) => handleDeleteTagClick(e, tag.id)}
                                                        className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                        title="Delete Tag"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Selected Tag Entries List */}
            {selectedTagId && (
                <div className="glass-card p-6 animation-fade-in mt-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-serif font-bold text-white flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-primary" />
                            Entries for "{tags.find(t => t.id === selectedTagId)?.name}"
                        </h3>
                        <span className="text-sm font-medium text-text-muted bg-white/5 px-3 py-1 rounded-full">
                            {selectedTagEntries.length} {selectedTagEntries.length === 1 ? 'Entry' : 'Entries'}
                        </span>
                    </div>

                    {selectedTagEntries.length === 0 ? (
                        <div className="text-center py-8 text-text-muted">
                            No entries found with this tag in the past year.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {selectedTagEntries.map(entry => {
                                const title = extractTitle(entry.content, entry.title) || 'Untitled Entry';
                                const entryDate = parseISO(entry.id);
                                const validDate = !isNaN(entryDate.getTime());

                                return (
                                    <div
                                        key={entry.id}
                                        onClick={() => navigate(`/entry/${entry.id}`)}
                                        className="bg-white/5 border border-white/10 p-4 rounded-xl hover:bg-white/10 hover:border-primary/50 transition-all cursor-pointer group flex flex-col justify-between min-h-[100px]"
                                    >
                                        <div>
                                            <div className="text-xs text-primary font-bold mb-1 uppercase tracking-wider">
                                                {validDate ? format(entryDate, 'MMM d, yyyy') : entry.id}
                                            </div>
                                            <div className="text-white font-medium line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                                                {title}
                                            </div>
                                        </div>
                                        <div className="flex items-center text-xs text-text-muted group-hover:text-white transition-colors mt-auto">
                                            Read Entry <ArrowRight className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDeleteTag}
                title="Delete Tag"
                message="Are you sure you want to delete this tag? This will not remove the tag from previous entries, but it will no longer be available as an option."
                confirmText="Delete Tag"
                isDangerous={true}
            />
        </div>
    );
}
