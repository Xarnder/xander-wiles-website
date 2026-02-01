import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import SimpleMdeReact from 'react-simplemde-editor';
import "easymde/dist/easymde.min.css";
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Edit2, Save, X, Calendar, PenTool } from 'lucide-react';

export default function EntryEditor() {
    const { currentUser } = useAuth();
    const { success, error: toastError } = useToast();
    const { date } = useParams();
    const navigate = useNavigate();
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showRawHeader, setShowRawHeader] = useState(false);

    // Parse date for display
    const displayDate = useMemo(() => {
        try {
            return format(parseISO(date), 'EEEE, d MMMM yyyy');
        } catch {
            return date;
        }
    }, [date]);

    // Prepare content for display
    const displayContent = useMemo(() => {
        if (!content) return '';
        if (showRawHeader) return content;
        return content.replace(/(?:\*\*)?\+\+.*?\+\+(?:\*\*)?/g, '').trim();
    }, [content, showRawHeader]);

    useEffect(() => {
        async function fetchEntry() {
            setLoading(true);
            if (!currentUser) return;

            try {
                const docRef = doc(db, 'users', currentUser.uid, 'entries', date);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setContent(data.content || '');
                    setTitle(data.title || '');
                    setIsEditing(false); // Ensure we start in view mode for existing entries
                } else {
                    // New entry
                    setIsEditing(true);
                    setContent('');
                    setTitle('');
                }
            } catch (error) {
                console.error("Error fetching entry:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchEntry();
    }, [date, currentUser]);

    // Parse title logic
    useEffect(() => {
        if (!content) return;
        const match = content.match(/(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/);
        if (match && match[1]) {
            const parts = match[1].split(' - ');
            if (parts.length >= 2) {
                const titlePart = parts.slice(1).join(' - ').trim();
                if (titlePart !== title) setTitle(titlePart);
            } else if (parts.length === 1 && parts[0].trim() !== title) {
                setTitle(parts[0].trim());
            }
        }
    }, [content]);

    async function handleSave() {
        if (!currentUser) return;
        setSaving(true);
        try {
            const docRef = doc(db, 'users', currentUser.uid, 'entries', date);
            const trimmedContent = content.trim();
            const trimmedTitle = title.trim();
            const inferredTitle = content.split('\n')[0].replace('#', '').trim();

            if (!trimmedContent && !trimmedTitle) {
                await deleteDoc(docRef);
            } else {
                await setDoc(docRef, {
                    date: parseISO(date),
                    title: trimmedTitle || inferredTitle,
                    content: content,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }

            setIsEditing(false);
            success('Entry saved successfully');
        } catch (err) {
            console.error("Error saving entry:", err);

            // Handle specific Firestore errors
            if (err.code === 'resource-exhausted') {
                toastError('Storage quota exceeded. Please check your plan.');
            } else if (err.code === 'permission-denied') {
                toastError('You do not have permission to save this entry.');
            } else if (err.code === 'unavailable') {
                toastError('Network unavailable. Please check your connection.');
            } else {
                toastError('Failed to save entry. Please try again.');
            }
        } finally {
            setSaving(false);
        }
    }

    const mdeOptions = useMemo(() => {
        return {
            autofocus: true,
            spellChecker: false,
            status: false,
            placeholder: "Capture the moment...",
            toolbar: ["bold", "italic", "heading", "|", "quote", "unordered-list", "ordered-list", "|", "link", "image", "|", "fullscreen", "side-by-side"],
        };
    }, []);

    if (loading) return (
        <div className="glass-card p-8 flex flex-col items-center justify-center min-h-[400px] text-text-muted animate-pulse">
            <PenTool className="w-12 h-12 mb-4 opacity-50" />
            <p>Summoning your memories...</p>
        </div>
    );

    return (
        <div className="h-full flex flex-col animation-fade-in">
            {/* Header / Actions */}
            <div className="glass-card p-4 mb-6 sticky top-0 z-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                    <button
                        onClick={() => navigate('/')}
                        className="glass-button p-2 text-text-muted hover:text-white md:hidden"
                        title="Back to Calendar"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center text-primary text-sm font-bold mb-1 uppercase tracking-wider">
                            <Calendar className="w-3 h-3 mr-1" />
                            {date}
                        </div>
                        <h2 className="text-xl sm:text-2xl font-serif font-bold text-white truncate max-w-[200px] sm:max-w-md">{displayDate}</h2>
                        {title && !isEditing && <p className="text-secondary font-medium truncate opacity-90">{title}</p>}
                    </div>
                </div>

                <div className="flex space-x-2 w-full sm:w-auto justify-end">
                    {isEditing ? (
                        <>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="glass-button px-4 py-2 text-text hover:bg-white/10 flex items-center justify-center"
                                disabled={saving}
                            >
                                <X className="w-4 h-4 mr-2" />
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-6 py-2 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-bold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-105 transition-all duration-200 flex items-center justify-center"
                                disabled={saving}
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="hidden sm:flex items-center mr-2">
                                <label className="flex items-center space-x-2 text-xs text-text-muted cursor-pointer hover:text-white transition-colors group">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={showRawHeader}
                                            onChange={(e) => setShowRawHeader(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-9 h-5 bg-white/10 border border-white/10 rounded-full peer-checked:bg-primary/30 peer-checked:border-primary/50 transition-all duration-300"></div>
                                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-text-muted rounded-full transition-all duration-300 peer-checked:translate-x-4 peer-checked:bg-primary peer-checked:shadow-[0_0_8px_rgba(139,92,246,0.6)]"></div>
                                    </div>
                                    <span className="group-hover:text-white transition-colors">Raw Header</span>
                                </label>
                            </div>
                            <button
                                onClick={() => setIsEditing(true)}
                                className="glass-button px-5 py-2 text-primary hover:text-white hover:bg-primary/20 hover:border-primary/30 flex items-center justify-center"
                            >
                                <Edit2 className="w-4 h-4 mr-2" />
                                Edit Entry
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Content Container */}
            <div className={`glass-card flex-1 p-6 md:p-8 overflow-hidden flex flex-col relative ${isEditing ? 'ring-2 ring-primary/30' : ''}`}>
                {isEditing ? (
                    <div className="h-full flex flex-col">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Give this day a title..."
                            className="w-full bg-transparent text-2xl font-serif font-bold text-white border-none focus:ring-0 placeholder-white/20 mb-6 p-0"
                        />
                        <div className="flex-1 overflow-auto custom-scrollbar -mr-4 pr-4">
                            <SimpleMdeReact
                                value={content}
                                onChange={setContent}
                                options={mdeOptions}
                                className="prose-dark"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full overflow-y-auto custom-scrollbar -mr-4 pr-4">
                        <div className="markdown-content prose prose-invert max-w-none">
                            {displayContent ? (
                                <ReactMarkdown>{displayContent}</ReactMarkdown>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[40vh] text-text-muted opacity-60">
                                    <Edit2 className="w-12 h-12 mb-4 opacity-30" />
                                    <p className="text-lg">This page is empty.</p>
                                    <p className="text-sm">Click Edit to start writing.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
