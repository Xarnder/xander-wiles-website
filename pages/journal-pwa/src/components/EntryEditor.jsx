import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import SimpleMdeReact from 'react-simplemde-editor';
import "easymde/dist/easymde.min.css";
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Edit2, Save, X } from 'lucide-react';

export default function EntryEditor() {
    const { currentUser } = useAuth();
    const { date } = useParams();
    const navigate = useNavigate();
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Parse date for display
    const displayDate = useMemo(() => {
        try {
            return format(parseISO(date), 'EEEE, d MMMM yyyy');
        } catch {
            return date;
        }
    }, [date]);

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
                } else {
                    // New entry
                    setIsEditing(true); // Auto-enter edit mode for new entries
                    setContent('');
                }
            } catch (error) {
                console.error("Error fetching entry:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchEntry();
        fetchEntry();
    }, [date, currentUser]);

    async function handleSave() {
        if (!currentUser) return;
        setSaving(true);
        try {
            const docRef = doc(db, 'users', currentUser.uid, 'entries', date);
            // We don't really need a separate title field if we just infer it, 
            // but to match the schema request:
            const inferredTitle = content.split('\n')[0].replace('#', '').trim(); // Simple inference

            await setDoc(docRef, {
                date: parseISO(date), // As timestamp/date object
                title: title || inferredTitle,
                content: content,
                updatedAt: serverTimestamp(),
                // Only set createdAt if it doesn't exist? setDoc with merge:true handles updates.
                // But if it's new, we want createdAt.
                // We can use a separate update for createdAt if needed, or just set it. 
                // For simplicity, we'll set it on creation logic if we split it, but merge: true merges.
                // If the doc doesn't exist, it creates.
            }, { merge: true });

            setIsEditing(false);
        } catch (error) {
            console.error("Error saving entry:", error);
            alert("Failed to save entry");
        } finally {
            setSaving(false);
        }
    }

    // Custom options for SimpleMDE to match dark theme
    const mdeOptions = useMemo(() => {
        return {
            autofocus: true,
            spellChecker: false,
            status: false,
            placeholder: "Write your thoughts...",
            toolbar: ["bold", "italic", "heading", "|", "quote", "unordered-list", "ordered-list", "|", "link", "image", "|", "preview", "side-by-side", "fullscreen"],
        };
    }, []);

    if (loading) return <div className="text-center py-20 text-text-muted">Loading entry...</div>;

    return (
        <div className="max-w-4xl mx-auto animation-fade-in">
            {/* Header / Actions */}
            <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 rounded-full hover:bg-surface text-text-muted hover:text-white transition"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-serif font-bold text-primary">{displayDate}</h2>
                        {title && !isEditing && <p className="text-text-muted text-sm">{title}</p>}
                    </div>
                </div>

                <div className="flex space-x-3">
                    {isEditing ? (
                        <>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="flex items-center px-4 py-2 rounded bg-surface hover:bg-white/5 text-text border border-border transition"
                                disabled={saving}
                            >
                                <X className="w-4 h-4 mr-2" />
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex items-center px-4 py-2 rounded bg-secondary hover:bg-opacity-80 text-black font-bold transition shadow-lg shadow-secondary/20"
                                disabled={saving}
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {saving ? 'Saving...' : 'Save Entry'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center px-4 py-2 rounded bg-primary hover:bg-primary-variant text-white font-bold transition shadow-lg shadow-primary/20"
                        >
                            <Edit2 className="w-4 h-4 mr-2" />
                            Edit
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="bg-surface rounded-xl border border-border p-6 md:p-10 shadow-lg min-h-[60vh]">
                {isEditing ? (
                    <div className="prose prose-invert max-w-none">
                        <SimpleMdeReact
                            value={content}
                            onChange={setContent}
                            options={mdeOptions}
                        />
                    </div>
                ) : (
                    <div className="markdown-content prose prose-invert max-w-none">
                        {content ? (
                            <ReactMarkdown>{content}</ReactMarkdown>
                        ) : (
                            <div className="text-center py-20 text-text-muted italic">
                                No entry for this day. Click Edit to write one.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
