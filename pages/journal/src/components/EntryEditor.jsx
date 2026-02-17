import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import SimpleMdeReact from 'react-simplemde-editor';
import "easymde/dist/easymde.min.css";
import { format, parseISO, getDay, addDays } from 'date-fns';
import { useBackup } from '../context/BackupContext';
import { ArrowLeft, Edit2, Save, X, Calendar, PenTool, ChevronLeft, ChevronRight, Copy, Image as ImageIcon, Loader, Trash2 } from 'lucide-react';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { compressImage } from '../utils/imageUtils';
import StorageStats from './StorageStats';
import ConfirmModal from './ConfirmModal';

export default function EntryEditor() {
    const { currentUser } = useAuth();
    const { success, error: toastError } = useToast();
    const { openBackup } = useBackup();
    const { date } = useParams();
    const navigate = useNavigate();
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showRawHeader, setShowRawHeader] = useState(false);

    // Image State
    const [imageFile, setImageFile] = useState(null);
    const [imageUrl, setImageUrl] = useState('');
    const [imageMetadata, setImageMetadata] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

    const wordCount = useMemo(() => {
        if (!displayContent) return 0;
        return displayContent.trim().split(/\s+/).filter(word => word.length > 0).length;
    }, [displayContent]);

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

                    // Handle new schema vs legacy schema
                    if (data.imageUrl) {
                        setImageUrl(data.imageUrl);
                        setImageMetadata({
                            size: data.imageSize || 0,
                            path: data.imagePath // Optional: keep path for deletion if needed, though user didn't explicitly ask for it, it's good practice
                        });
                    } else if (data.imageMetadata) {
                        // Legacy fallback
                        setImageUrl(data.imageMetadata.url);
                        setImageMetadata({
                            size: data.imageMetadata.sizeInBytes,
                            path: data.imageMetadata.path
                        });
                    } else {
                        setImageUrl('');
                        setImageMetadata(null);
                    }
                    setIsEditing(false); // Ensure we start in view mode for existing entries
                } else {
                    // New entry
                    setIsEditing(true);
                    setContent('');
                    setTitle('');
                    setImageUrl('');
                    setImageMetadata(null);
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

    // Image Upload Handler
    // Image Upload Handler
    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        // Set initial status based on file type
        if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
            setStatusMessage('Converting Apple Photo format...');
        } else {
            setStatusMessage('Compressing & Uploading...');
        }

        try {
            const compressedFile = await compressImage(file);

            setStatusMessage('Uploading...');
            const storage = getStorage();
            const storagePath = `users/${currentUser.uid}/images/${date}.webp`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, compressedFile);
            const downloadUrl = await getDownloadURL(storageRef);

            setImageUrl(downloadUrl);
            setImageMetadata({
                size: compressedFile.size,
                path: storagePath
            });

            success('Image uploaded successfully');
        } catch (error) {
            console.error("Error uploading image:", error);
            if (error.message === "Could not read this iPhone photo format.") {
                toastError("Could not convert HEIC image. Please try a different photo.");
            } else {
                toastError("Failed to upload image");
            }
        } finally {
            setUploading(false);
            setStatusMessage('');
        }
    };

    const handleRemoveImage = () => {
        setShowDeleteConfirm(true);
    };

    const confirmRemoveImage = async () => {
        setUploading(true);
        try {
            if (imageMetadata && imageMetadata.path) {
                const storage = getStorage();
                const storageRef = ref(storage, imageMetadata.path);
                await deleteObject(storageRef);
            } else if (imageUrl) {
                // Try to construct path from URL if metadata missing (fallback)
                try {
                    const storage = getStorage();
                    const path = decodeURIComponent(imageUrl.split('/o/')[1].split('?')[0]);
                    const storageRef = ref(storage, path);
                    await deleteObject(storageRef);
                } catch (e) {
                    console.warn("Could not derive storage path from URL", e);
                }
            }

            setImageUrl('');
            setImageMetadata(null);
            success("Image removed");
        } catch (error) {
            console.error("Error removing image:", error);
            toastError("Failed to remove image");
        } finally {
            setUploading(false);
        }
    };

    async function handleSave() {
        if (!currentUser) return;
        setSaving(true);
        try {
            const docRef = doc(db, 'users', currentUser.uid, 'entries', date);
            const trimmedContent = content.trim();
            const trimmedTitle = title.trim();
            const inferredTitle = content.split('\n')[0].replace('#', '').trim();

            if (!trimmedContent && !trimmedTitle && !imageUrl) {
                await deleteDoc(docRef);
            } else {
                const textSize = new Blob([content]).size;

                await setDoc(docRef, {
                    date: parseISO(date),
                    title: trimmedTitle || inferredTitle,
                    content: content,
                    updatedAt: serverTimestamp(),
                    imageUrl: imageUrl || null,
                    imageSize: imageMetadata?.size || 0,
                    imagePath: imageMetadata?.path || null, // Keep path for management
                    textSize: textSize
                }, { merge: true });
            }

            setIsEditing(false);
            success('Entry saved successfully');

            // Check if it's Sunday (0)
            const dateObj = parseISO(date);
            if (getDay(dateObj) === 0) {
                setTimeout(() => {
                    openBackup("It's Sunday! Great time to reflect and download a backup of your entries.");
                }, 1500);
            }
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

    const handleCopy = async () => {
        try {
            const textToCopy = `${displayDate} - ${title} - ${displayContent}`;
            await navigator.clipboard.writeText(textToCopy);
            success('Entry copied to clipboard');
        } catch (err) {
            console.error('Failed to copy:', err);
            toastError('Failed to copy to clipboard');
        }
    };

    const mdeOptions = useMemo(() => {
        return {
            autofocus: true,
            spellChecker: false,
            status: false,
            placeholder: "Capture the moment...",
            toolbar: ["bold", "italic", "heading", "|", "quote", "unordered-list", "ordered-list", "|", "link", "image", "|", "fullscreen", "side-by-side"],
        };
    }, []);

    // Navigation handlers
    const handlePrevDay = () => {
        const currentDate = parseISO(date);
        const prevDate = addDays(currentDate, -1);
        const prevDateString = format(prevDate, 'yyyy-MM-dd');
        navigate(`/entry/${prevDateString}`);
    };

    const handleNextDay = () => {
        const currentDate = parseISO(date);
        const nextDate = addDays(currentDate, 1);
        const nextDateString = format(nextDate, 'yyyy-MM-dd');
        navigate(`/entry/${nextDateString}`);
    };

    // Check if title is inferred from content
    const isInferredTitle = useMemo(() => {
        return /(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/.test(content || '');
    }, [content]);

    if (loading) return (
        <div className="glass-card p-8 flex flex-col items-center justify-center min-h-[400px] text-text-muted animate-pulse">
            <PenTool className="w-12 h-12 mb-4 opacity-50" />
            <p>Summoning your memories...</p>
        </div>
    );

    return (
        <div className="h-full flex flex-col">
            {/* Header / Actions */}
            <div className="mb-6 sticky top-24 z-40 relative transition-all duration-300 isolate">
                {/* Background Layer */}
                <div
                    className="absolute inset-0 bg-[#0a0a0b] -z-10 rounded-xl shadow-lg border border-white/10"
                />

                {/* Background Image Overlay */}
                {imageUrl && (
                    <>
                        <div
                            className="absolute inset-0 z-[-5] rounded-xl opacity-20 bg-cover bg-center pointer-events-none transition-opacity duration-500"
                            style={{ backgroundImage: `url(${imageUrl})` }}
                        />
                        <div className="absolute inset-0 z-[-4] bg-gradient-to-b from-[#0a0a0b]/80 via-[#0a0a0b]/90 to-[#0a0a0b] rounded-xl" />
                    </>
                )}

                <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center w-full sm:w-auto overflow-hidden">
                        <button
                            onClick={() => navigate('/')}
                            className="glass-button p-2 text-text-muted hover:text-white md:hidden mr-2 shrink-0"
                            title="Back to Calendar"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>

                        {/* Navigation Arrows (View Mode Only) */}
                        {!isEditing && (
                            <button
                                onClick={handlePrevDay}
                                className="glass-button p-2 text-text-muted hover:text-white mr-2 shrink-0 hidden sm:flex"
                                title="Previous Day"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        )}

                        <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center text-primary text-sm font-bold mb-1 uppercase tracking-wider">
                                <Calendar className="w-3 h-3 mr-1 shrink-0" />
                                {date}
                            </div>
                            <h2 className="text-xl sm:text-2xl font-serif font-bold text-white break-words">{displayDate}</h2>
                            {title && !isEditing && <p className="text-secondary font-medium opacity-90 break-words">{title}</p>}
                            {!isEditing && <p className="text-xs text-text-muted mt-1">{wordCount} words</p>}
                        </div>

                        {/* Navigation Arrows (Right / Next) */}
                        {!isEditing && (
                            <button
                                onClick={handleNextDay}
                                className="glass-button p-2 text-text-muted hover:text-white ml-2 shrink-0 hidden sm:flex"
                                title="Next Day"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    <div className="flex space-x-2 w-full sm:w-auto justify-end shrink-0">
                        {/* Mobile Navigation Arrows */}
                        {!isEditing && (
                            <div className="flex sm:hidden mr-auto">
                                <button
                                    onClick={handlePrevDay}
                                    className="glass-button p-2 text-text-muted hover:text-white mr-2"
                                    title="Previous Day"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={handleNextDay}
                                    className="glass-button p-2 text-text-muted hover:text-white"
                                    title="Next Day"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}
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
                                <div className="flex items-center mr-2">
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
                                        <span className="hidden sm:inline group-hover:text-white transition-colors">Raw Header</span>
                                    </label>
                                </div>
                                <button
                                    onClick={handleCopy}
                                    className="glass-button px-5 py-2 text-primary hover:text-white hover:bg-primary/20 hover:border-primary/30 flex items-center justify-center mr-2"
                                    title="Copy to Clipboard"
                                >
                                    <Copy className="w-4 h-4 mr-2" />
                                    <span className="hidden sm:inline">Copy</span>
                                </button>
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
            </div>


            {/* Content Container */}
            <div className={`glass-card flex-1 p-6 md:p-8 overflow-hidden flex flex-col relative ${isEditing ? 'ring-2 ring-primary/30' : ''}`}>
                {imageUrl && !isEditing && (
                    <div className="mb-6 rounded-lg overflow-hidden border border-white/10 shadow-lg relative group">
                        <img src={imageUrl} alt="Entry attachment" className="w-full object-cover max-h-[400px]" />
                    </div>
                )}

                {isEditing ? (
                    <div className="h-full flex flex-col">
                        <div onClick={() => {
                            if (isInferredTitle) {
                                toastError("Title is inferred from content. Please edit it in the journal entry.");
                            }
                        }}>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Give this day a title..."
                                readOnly={isInferredTitle}
                                className={`w-full bg-transparent text-2xl font-serif font-bold text-white border-none focus:ring-0 placeholder-white/20 mb-6 p-0 ${isInferredTitle ? 'cursor-not-allowed opacity-80' : ''}`}
                            />
                        </div>

                        {/* Image Upload Area */}
                        <div className="mb-4">
                            {imageUrl ? (
                                <div className="relative rounded-lg overflow-hidden border border-white/10 group h-48 bg-black/40 flex items-center justify-center">
                                    <img src={imageUrl} alt="Uploaded" className="h-full object-contain" />
                                    <button
                                        onClick={handleRemoveImage}
                                        className="absolute top-2 right-2 p-2 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors"
                                        title="Remove Image"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative group">
                                    <input
                                        type="file"
                                        accept="image/*,.heic,.heif"
                                        onChange={handleImageUpload}
                                        className="hidden"
                                        id="image-upload"
                                        disabled={uploading}
                                    />
                                    <label
                                        htmlFor="image-upload"
                                        className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-white/5 transition-all ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {uploading ? (
                                            <div className="flex flex-col items-center text-primary">
                                                <Loader className="w-8 h-8 animate-spin mb-2" />
                                                <span className="text-sm">{statusMessage || 'Processing...'}</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center text-text-muted group-hover:text-white">
                                                <ImageIcon className="w-8 h-8 mb-2" />
                                                <span className="text-sm font-medium">Click to upload image</span>
                                                <span className="text-xs mt-1 text-text-muted/60">Max 200KB (Auto-compressed)</span>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            )}
                        </div>

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
                    <>
                        <div className="flex-1 overflow-y-auto custom-scrollbar -mr-4 pr-4">
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
                        <StorageStats
                            entryTextSize={new Blob([content]).size}
                            entryImageSize={imageMetadata?.size || 0}
                        />
                    </>
                )}
            </div>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmRemoveImage}
                title="Remove Image"
                message="Are you sure you want to remove this image? This action cannot be undone."
                confirmText="Remove"
                isDangerous={true}
            />
        </div >
    );
}
