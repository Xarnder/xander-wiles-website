import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, onSnapshot } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import SimpleMdeReact from 'react-simplemde-editor';
import "easymde/dist/easymde.min.css";
import { format, parseISO, addDays, differenceInMonths, differenceInWeeks, differenceInDays, addMonths, addWeeks } from 'date-fns';
import { useBackup } from '../context/BackupContext';
import { ArrowLeft, Edit2, Save, X, Calendar, PenTool, ChevronLeft, ChevronRight, Copy, Image as ImageIcon, Loader, Trash2, Tag, Star, Sparkles, Clock, Target, Smile, Meh, Frown, Heart, Zap, BookOpen, Type } from 'lucide-react';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { compressImage } from '../utils/imageUtils';
import StorageStats from './StorageStats';
import ConfirmModal from './ConfirmModal';
import ImageWithSkeleton from './ImageWithSkeleton';
import SpecialDayAnimation from './SpecialDayAnimation';
import LocalSummaryPanel from './LocalSummaryPanel';
import { LOCAL_SUMMARISER_MODEL_ID } from '../lib/localSummariser';
import {
    cleanSubEntriesForSave,
    ENTRY_SECTIONS_SETTINGS_DOC,
    hasSubEntryContent,
    normalizeEntrySections,
    subEntriesToPlainText
} from '../utils/entrySections';

function createEntrySignature({ content, title, selectedTags, mood, isSpecial, subEntries }) {
    return JSON.stringify({
        content,
        title,
        selectedTags,
        mood,
        isSpecial,
        subEntries: cleanSubEntriesForSave(subEntries)
    });
}

function countWordsInText(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export default function EntryEditor() {
    const { currentUser } = useAuth();
    const { success, error: toastError } = useToast();
    const { openBackupReminder } = useBackup();
    const { date } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isSpecial, setIsSpecial] = useState(false);
    const [animationActive, setAnimationActive] = useState(false);
    const [buttonRect, setButtonRect] = useState(null);
    const [showRawHeader, setShowRawHeader] = useState(false);
    const [localAiSummaryRecord, setLocalAiSummaryRecord] = useState(null);
    const [entrySections, setEntrySections] = useState([]);
    const [subEntries, setSubEntries] = useState({});

    // Image State
    const [images, setImages] = useState([]); // Array of { url, path, size }
    const [imageToDelete, setImageToDelete] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadQueueCount, setUploadQueueCount] = useState(0);
    const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
    const [isAutoSaving, setIsAutoSaving] = useState(false);

    // Tags State
    const [availableTags, setAvailableTags] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);

    // Caption State
    const [editingCaptionIndex, setEditingCaptionIndex] = useState(null);
    const [tempCaption, setTempCaption] = useState('');

    // Drag and Drop State
    const [draggedImageIndex, setDraggedImageIndex] = useState(null);
    const [dragOverImageIndex, setDragOverImageIndex] = useState(null);

    // New features state
    const [mood, setMood] = useState(null);
    const [showPrompts, setShowPrompts] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState('');
    const autoSaveTimerRef = useRef(null);
    const lastSavedSignature = useRef('');
    const isFirstLoad = useRef(true);

    const WRITING_PROMPTS = [
        "What made you smile today?",
        "What's a challenge you faced and how did you handle it?",
        "Describe a small detail from today that you want to remember.",
        "What are you grateful for right now?",
        "What's one thing you'd do differently today if you could?",
        "Who did you connect with today and how did it feel?",
        "What's something new you learned or realized?",
        "How did you take care of yourself today?",
        "What's your main priority for tomorrow?",
        "Describe your current environment—the sounds, smells, and light.",
        "If today was a chapter in a book, what would the title be?",
        "What's a song or piece of art that resonated with you today?",
    ];

    const MOODS = [
        { icon: Frown, label: 'Bad', value: 1, color: '#f87171' },
        { icon: Meh, label: 'Okay', value: 2, color: '#fb923c' },
        { icon: Smile, label: 'Good', value: 3, color: '#facc15' },
        { icon: Heart, label: 'Great', value: 4, color: '#4ade80' },
        { icon: Zap, label: 'Amazing', value: 5, color: '#8b5cf6' },
    ];

    const fromPath = location.state?.from;
    const isFromGallery = location.state?.fromGallery;

    const getBackLabel = () => {
        if (isFromGallery) return "To Gallery";
        if (fromPath === '/stats') return "To Stats";
        if (fromPath === '/tags') return "To Tags";
        if (fromPath === '/month') return "To Month";
        if (fromPath === '/memories') return "To Memories";
        if (fromPath === '/') return "To Calendar";
        if (fromPath?.startsWith('/entry/')) return "Prev View";
        return "Back";
    };

    const handleDragStart = (e, index) => {
        setDraggedImageIndex(index);
        // Required for Firefox
        e.dataTransfer.setData('text/plain', index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (e, index) => {
        setDragOverImageIndex(index);
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, index) => {
        e.preventDefault();
        if (draggedImageIndex === null) return;

        const newImages = [...images];
        const draggedImage = newImages[draggedImageIndex];

        newImages.splice(draggedImageIndex, 1);
        newImages.splice(index, 0, draggedImage);

        setImages(newImages);
        setDraggedImageIndex(null);
        setDragOverImageIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedImageIndex(null);
        setDragOverImageIndex(null);
    };

    const titleTextareaRef = useRef(null);

    // Auto-resize title textarea
    useEffect(() => {
        if (titleTextareaRef.current) {
            titleTextareaRef.current.style.height = 'auto';
            titleTextareaRef.current.style.height = titleTextareaRef.current.scrollHeight + 'px';
        }
    }, [title, isEditing]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Save: Cmd+S or Ctrl+S
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                if (isEditing) handleSave();
            }
            // Cancel: Esc
            if (e.key === 'Escape') {
                if (isEditing) setIsEditing(false);
            }
            // Navigate: Alt+Left / Alt+Right
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                handlePrevDay();
            }
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                handleNextDay();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditing, content, title, selectedTags, mood, subEntries, date]);

    // Auto-save logic
    useEffect(() => {
        if (!isEditing || isFirstLoad.current) {
            if (isEditing) isFirstLoad.current = false;
            return;
        }

        const currentSignature = createEntrySignature({ content, title, selectedTags, mood, isSpecial, subEntries });
        if (currentSignature === lastSavedSignature.current) return;

        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

        autoSaveTimerRef.current = setTimeout(() => {
            handleAutoSave();
        }, 3000); // 3 second debounce

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, [content, title, selectedTags, mood, isSpecial, subEntries, isEditing]);

    async function handleAutoSave() {
        if (!currentUser || !isEditing) return;
        
        try {
            setIsAutoSaving(true);
            const docRef = doc(db, 'users', currentUser.uid, 'entries', date);
            const trimmedTitle = title.trim();
            const inferredTitle = content.split('\n')[0].replace('#', '').trim();
            const cleanedSubEntries = cleanSubEntriesForSave(subEntries);
            
            await setDoc(docRef, {
                title: trimmedTitle || inferredTitle,
                content: content,
                updatedAt: serverTimestamp(),
                tags: selectedTags,
                mood: mood,
                isSpecial: isSpecial,
                subEntries: cleanedSubEntries,
                textSize: new Blob([content, subEntriesToPlainText(cleanedSubEntries)]).size
            }, { merge: true });
            
            lastSavedSignature.current = createEntrySignature({ content, title, selectedTags, mood, isSpecial, subEntries: cleanedSubEntries });
            setTimeout(() => setIsAutoSaving(false), 2000);
        } catch (err) {
            console.error("Auto-save error:", err);
            setIsAutoSaving(false);
        }
    }

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

    const visibleSubEntries = useMemo(() => {
        return entrySections
            .map((section) => {
                const value = subEntries[section.id] || {};
                const subEntryContent = typeof value.content === 'string' ? value.content.trim() : '';
                const subEntryTitle = typeof value.title === 'string' ? value.title.trim() : '';
                if (!subEntryContent && !subEntryTitle) return null;
                return {
                    section,
                    title: subEntryTitle,
                    content: subEntryContent
                };
            })
            .filter(Boolean);
    }, [entrySections, subEntries]);

    const wordCount = useMemo(() => {
        return countWordsInText(displayContent);
    }, [displayContent]);

    const subEntryWordCount = useMemo(() => {
        return visibleSubEntries.reduce((total, subEntry) => total + countWordsInText(subEntry.content), 0);
    }, [visibleSubEntries]);

    const totalWordCount = wordCount + subEntryWordCount;

    const readingTime = useMemo(() => {
        const wordsPerMinute = 200;
        const minutes = totalWordCount / wordsPerMinute;
        if (minutes < 1) return "< 1 min read";
        return `${Math.ceil(minutes)} min read`;
    }, [totalWordCount]);

    const wordGoal = 200;
    const wordProgress = Math.min(100, (totalWordCount / wordGoal) * 100);

    const timeSinceEntry = useMemo(() => {
        if (!date) return "";
        try {
            const entryDate = parseISO(date);
            const today = new Date();

            entryDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);

            if (today < entryDate) return "";
            if (today.getTime() === entryDate.getTime()) return "Time Since Entry: Today";

            const months = differenceInMonths(today, entryDate);
            const dateAfterMonths = addMonths(entryDate, months);

            const weeks = differenceInWeeks(today, dateAfterMonths);
            const dateAfterWeeks = addWeeks(dateAfterMonths, weeks);

            const days = differenceInDays(today, dateAfterWeeks);

            const parts = [];
            if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
            if (weeks > 0) parts.push(`${weeks} week${weeks !== 1 ? 's' : ''}`);
            if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);

            if (parts.length === 0) return "Time Since Entry: Today";
            return `Time Since Entry: ${parts.join(', ')}`;
        } catch {
            return "";
        }
    }, [date]);

    const isInferredTitle = useMemo(() => {
        if (!content) return false;
        return !!content.match(/(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/);
    }, [content]);

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
                    setSelectedTags(data.tags || []);
                    setIsSpecial(data.isSpecial || false);
                    setMood(data.mood || null);
                    setLocalAiSummaryRecord(data.aiSummary?.local || null);
                    setSubEntries(data.subEntries || {});
                    lastSavedSignature.current = createEntrySignature({
                        content: data.content || '',
                        title: data.title || '',
                        selectedTags: data.tags || [],
                        mood: data.mood || null,
                        isSpecial: data.isSpecial || false,
                        subEntries: data.subEntries || {}
                    });
                    isFirstLoad.current = true;

                    // Handle new schema vs legacy schema
                    if (data.images && Array.isArray(data.images)) {
                        setImages(data.images);
                    } else if (data.imageUrl) {
                        setImages([{
                            url: data.imageUrl,
                            path: data.imagePath || null,
                            size: data.imageSize || 0
                        }]);
                    } else if (data.imageMetadata) {
                        // Legacy fallback
                        setImages([{
                            url: data.imageMetadata.url,
                            path: data.imageMetadata.path,
                            size: data.imageMetadata.sizeInBytes
                        }]);
                    } else {
                        setImages([]);
                    }
                    setIsEditing(false); // Ensure we start in view mode for existing entries
                } else {
                    // New entry
                    setIsEditing(true);
                    setContent('');
                    setTitle('');
                    setImages([]);
                    setSelectedTags([]);
                    setIsSpecial(false);
                    setMood(null);
                    setLocalAiSummaryRecord(null);
                    setSubEntries({});
                    lastSavedSignature.current = createEntrySignature({
                        content: '',
                        title: '',
                        selectedTags: [],
                        mood: null,
                        isSpecial: false,
                        subEntries: {}
                    });
                    isFirstLoad.current = true;
                }
            } catch (error) {
                console.error("Error fetching entry:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchEntry();
    }, [date, currentUser]);

    // Fetch configurable sub-entry sections
    useEffect(() => {
        if (!currentUser) return;

        const settingsRef = doc(db, 'users', currentUser.uid, 'settings', ENTRY_SECTIONS_SETTINGS_DOC);
        const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
            setEntrySections(normalizeEntrySections(snapshot.data()?.sections));
        }, (error) => {
            console.error('Error fetching entry management settings:', error);
        });

        return () => unsubscribe();
    }, [currentUser]);

    // Fetch available tags
    useEffect(() => {
        if (!currentUser) return;
        const tagsQuery = query(collection(db, 'users', currentUser.uid, 'tags'));
        const unsubscribe = onSnapshot(tagsQuery, (snapshot) => {
            const fetchedTags = [];
            snapshot.forEach(doc => {
                fetchedTags.push({ id: doc.id, ...doc.data() });
            });
            fetchedTags.sort((a, b) => a.name.localeCompare(b.name));
            setAvailableTags(fetchedTags);
        });
        return () => unsubscribe();
    }, [currentUser]);

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

    const uploadImageFiles = async (files) => {
        if (files.length === 0) return;

        if (images.length + files.length > 8) {
            toastError("You can only have up to 8 images per entry.");
            return;
        }

        setUploading(true);
        setUploadQueueCount(files.length);
        setCurrentUploadIndex(0);
        setStatusMessage('Starting upload...');

        try {
            const newImages = [];
            const storage = getStorage();

            for (let i = 0; i < files.length; i++) {
                setCurrentUploadIndex(i);
                const file = files[i];
                // Update status for HEIC if needed
                if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
                    setStatusMessage(`Converting image ${i + 1}...`);
                } else {
                    setStatusMessage(`Compressing image ${i + 1}...`);
                }

                // Compress
                const compressedFile = await compressImage(file);

                // Upload
                setStatusMessage(`Uploading image ${i + 1}...`);
                const timestamp = Date.now();
                const storagePath = `users/${currentUser.uid}/images/${date}_${timestamp}_${i}.webp`;
                const storageRef = ref(storage, storagePath);

                await uploadBytes(storageRef, compressedFile);
                const downloadUrl = await getDownloadURL(storageRef);

                newImages.push({
                    url: downloadUrl,
                    path: storagePath,
                    size: compressedFile.size,
                    caption: ''
                });
            }

            setImages(prev => [...prev, ...newImages]);
            success('Images uploaded successfully');
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
            setUploadQueueCount(0);
            setCurrentUploadIndex(0);
        }
    };

    // Image Upload Handler
    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        await uploadImageFiles(files);
        // Reset input
        e.target.value = null;
    };

    // Image Paste Handler
    const handlePaste = async (e) => {
        if (!e.clipboardData) return;
        const items = e.clipboardData.items;
        const imageFiles = [];

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    imageFiles.push(file);
                }
            }
        }

        if (imageFiles.length > 0) {
            e.preventDefault(); // Prevent default pasting behavior if images are detected
            await uploadImageFiles(imageFiles);
        }
    };

    const handleRemoveImage = (index) => {
        setImageToDelete(index);
        setShowDeleteConfirm(true);
    };

    const confirmRemoveImage = async () => {
        if (imageToDelete === null) return;

        setUploading(true);
        try {
            const image = images[imageToDelete];
            if (image && image.path) {
                const storage = getStorage();
                const storageRef = ref(storage, image.path);
                await deleteObject(storageRef);
            } else if (image && image.url) {
                // Try to construct path from URL if metadata missing (fallback)
                try {
                    const storage = getStorage();
                    const path = decodeURIComponent(image.url.split('/o/')[1].split('?')[0]);
                    const storageRef = ref(storage, path);
                    await deleteObject(storageRef);
                } catch (e) {
                    console.warn("Could not derive storage path from URL", e);
                }
            }

            const newImages = [...images];
            newImages.splice(imageToDelete, 1);
            setImages(newImages);

            setImageToDelete(null);
            success("Image removed");
        } catch (error) {
            console.error("Error removing image:", error);
            toastError("Failed to remove image");
        } finally {
            setUploading(false);
            setShowDeleteConfirm(false); // Close modal
        }
    };

    async function handleSave(skipDuplicateCheck = false) {
        if (!currentUser) return;

        // Duplicate sentence check
        const duplicateCheckText = [content, subEntriesToPlainText(subEntries)].filter(Boolean).join('. ');

        if (!skipDuplicateCheck && duplicateCheckText) {
            const sentences = duplicateCheckText.split('.')
                .map(s => s.trim())
                .filter(s => s.length > 3); // Ignore very short fragments like "..." or "A."
            
            const duplicates = sentences.filter((item, index) => sentences.indexOf(item) !== index);
            
            if (duplicates.length > 0) {
                setShowDuplicateConfirm(true);
                return;
            }
        }

        await performSave();
    }

    async function performSave() {
        if (!currentUser) return;
        setSaving(true);
        try {
            const docRef = doc(db, 'users', currentUser.uid, 'entries', date);
            const trimmedContent = content.trim();
            const trimmedTitle = title.trim();
            const inferredTitle = content.split('\n')[0].replace('#', '').trim();
            const cleanedSubEntries = cleanSubEntriesForSave(subEntries);

            if (!trimmedContent && !trimmedTitle && images.length === 0 && !hasSubEntryContent(cleanedSubEntries)) {
                await deleteDoc(docRef);
            } else {
                const textSize = new Blob([content, subEntriesToPlainText(cleanedSubEntries)]).size;
                // For backward compatibility until migration is complete or ignored
                const mainImage = images.length > 0 ? images[0] : null;

                await setDoc(docRef, {
                    date: parseISO(date),
                    title: trimmedTitle || inferredTitle,
                    content: content,
                    updatedAt: serverTimestamp(),
                    images: images, // Array of {url, path, size}
                    tags: selectedTags, // Array of tag IDs
                    isSpecial: isSpecial,
                    mood: mood,
                    subEntries: cleanedSubEntries,
                    // Backward compatibility fields
                    imageUrl: mainImage ? mainImage.url : null,
                    imageSize: mainImage ? mainImage.size : 0,
                    imagePath: mainImage ? mainImage.path : null,

                    textSize: textSize
                }, { merge: true });
            }

            lastSavedSignature.current = createEntrySignature({
                content,
                title,
                selectedTags,
                mood,
                isSpecial,
                subEntries: cleanedSubEntries
            });
            setIsEditing(false);
            setShowDuplicateConfirm(false);
            success('Entry saved successfully');

            // Trigger backup popup on every save with dynamic day name
            const today = new Date();
            const dayName = format(today, 'EEEE');
            setTimeout(() => {
                openBackupReminder(`It's ${dayName}! Great time to reflect and download a backup of your entries.`)
                    .catch((error) => console.error('Failed to open scheduled backup reminder:', error));
            }, 1500);
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
            const subEntryText = visibleSubEntries
                .map((subEntry) => {
                    const heading = subEntry.title
                        ? `${subEntry.section.name}: ${subEntry.title}`
                        : subEntry.section.name;
                    return `${heading}\n${subEntry.content}`;
                })
                .join('\n\n');
            const textToCopy = [displayDate, title, displayContent, subEntryText].filter(Boolean).join('\n\n');
            await navigator.clipboard.writeText(textToCopy);
            success('Entry copied to clipboard');
        } catch (err) {
            console.error('Failed to copy:', err);
            toastError('Failed to copy to clipboard');
        }
    };

    async function handleLocalSummaryGenerated(summary) {
        if (!currentUser) return;

        const generatedAtClient = new Date().toISOString();
        const summaryRecord = {
            summary,
            modelId: LOCAL_SUMMARISER_MODEL_ID,
            provider: 'local-webllm',
            generatedAtClient,
            sourceWordCount: wordCount,
            sourceCharacterCount: displayContent.length,
            version: 1
        };

        setLocalAiSummaryRecord(summaryRecord);

        const docRef = doc(db, 'users', currentUser.uid, 'entries', date);
        await setDoc(docRef, {
            aiSummary: {
                local: {
                    ...summaryRecord,
                    generatedAt: serverTimestamp()
                }
            },
            aiSummaryUpdatedAt: serverTimestamp()
        }, { merge: true });

        success('Local AI summary saved');
    }

    const updateSubEntry = (sectionId, field, value) => {
        setSubEntries((currentSubEntries) => ({
            ...currentSubEntries,
            [sectionId]: {
                ...(currentSubEntries[sectionId] || {}),
                [field]: value
            }
        }));
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

    const getRandomPrompt = () => {
        const randomIndex = Math.floor(Math.random() * WRITING_PROMPTS.length);
        setCurrentPrompt(WRITING_PROMPTS[randomIndex]);
        setShowPrompts(true);
    };

    // Lightbox State
    const [lightboxImage, setLightboxImage] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(1);

    // Lightbox Handlers
    const handleImageClick = (img) => {
        if (!isEditing) {
            setLightboxImage(img);
            setZoomLevel(1);
        }
    };

    const closeLightbox = () => {
        setLightboxImage(null);
        setZoomLevel(1);
    };

    const handleZoomIn = (e) => {
        e.stopPropagation();
        setZoomLevel(prev => Math.min(prev + 0.5, 3));
    };

    const handleZoomOut = (e) => {
        e.stopPropagation();
        setZoomLevel(prev => Math.max(prev - 0.5, 1));
    };

    // Lock body scroll when lightbox is open
    useEffect(() => {
        if (lightboxImage) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [lightboxImage]);

    if (loading) return (
        <div className="glass-card p-8 flex flex-col items-center justify-center min-h-[400px] text-text-muted animate-pulse">
            <PenTool className="w-12 h-12 mb-4 opacity-50" />
            <p>Summoning your memories...</p>
        </div>
    );

    return (
        <div className="h-full flex flex-col relative text-white">
            <div className="mb-6 sticky top-24 z-40 relative transition-all duration-300 isolate">
                {/* Background Layer */}
                <div
                    className="absolute inset-0 bg-[#0a0a0b] -z-10 rounded-xl shadow-lg border border-white/10"
                />

                {/* Background Image Overlay */}
                {images.length > 0 && (
                    <>
                        <div
                            className="absolute inset-0 z-[-5] rounded-xl opacity-20 bg-cover bg-center pointer-events-none transition-opacity duration-500"
                            style={{ backgroundImage: `url(${images[0].url})` }}
                        />
                        <div className="absolute inset-0 z-[-4] bg-gradient-to-b from-[#0a0a0b]/80 via-[#0a0a0b]/90 to-[#0a0a0b] rounded-xl" />
                    </>
                )}

                <div className="p-4 flex flex-col gap-6">
                    {/* Toolbar Row: All buttons at the top */}
                    <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                        {/* Navigation Group (Back, Prev/Next) */}
                        <div className="flex items-center gap-2">
                            {/* Generic Dynamic Back Button */}
                            {fromPath && (
                                <button
                                    onClick={() => {
                                        if (isFromGallery) {
                                            navigate('/images', { state: { scrollToId: location.state.scrollToId } });
                                        } else {
                                            navigate(fromPath);
                                        }
                                    }}
                                    className="glass-button px-3 py-2 text-primary hover:text-white hover:bg-primary/20 flex items-center justify-center shrink-0"
                                    title={`Back to ${getBackLabel()}`}
                                >
                                    <ArrowLeft className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline font-medium">{getBackLabel()}</span>
                                </button>
                            )}

                            {/* Fallback Mobile Back to Calendar (only if no fromPath) */}
                            {!fromPath && !isFromGallery && (
                                <button
                                    onClick={() => navigate('/')}
                                    className="glass-button p-2 text-text-muted hover:text-white md:hidden shrink-0"
                                    title="Back to Calendar"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                            )}

                            {/* Navigation Arrows (View Mode Only) */}
                            {!isEditing && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handlePrevDay}
                                        className="glass-button p-2 text-text-muted hover:text-white shrink-0"
                                        title="Previous Day"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={handleNextDay}
                                        className="glass-button p-2 text-text-muted hover:text-white shrink-0"
                                        title="Next Day"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Action Group (Edit/Save, Copy, Raw Toggle, Prompt) */}
                        <div className="flex items-center gap-2 ml-auto">
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
                                        onClick={getRandomPrompt}
                                        className="glass-button p-2 text-secondary hover:text-white hover:bg-secondary/20 shrink-0"
                                        title="Get a Writing Prompt"
                                    >
                                        <Sparkles className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleSave()}
                                        className="px-6 py-2 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-bold shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:scale-105 transition-all duration-200 flex items-center justify-center relative group"
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
                                        className="glass-button px-4 py-2 text-primary hover:text-white hover:bg-primary/20 hover:border-primary/30 flex items-center justify-center"
                                        title="Copy to Clipboard"
                                    >
                                        <Copy className="w-4 h-4 sm:mr-2" />
                                        <span className="hidden sm:inline">Copy</span>
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="glass-button px-4 py-2 text-primary hover:text-white hover:bg-primary/20 hover:border-primary/30 flex items-center justify-center"
                                    >
                                        <Edit2 className="w-4 h-4 sm:mr-2" />
                                        <span className="hidden sm:inline">Edit Entry</span>
                                        <span className="sm:hidden">Edit</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Entry Details Row: Date, Title, Special Star */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center text-primary text-sm font-bold mb-1 uppercase tracking-wider">
                            <Calendar className="w-3 h-3 mr-1 shrink-0" />
                            <span className={isSpecial ? 'text-yellow-400 transition-colors' : ''}>{date}</span>
                            
                            {isEditing ? (
                                <button
                                    onClick={(e) => {
                                        const nextIsSpecial = !isSpecial;
                                        setIsSpecial(nextIsSpecial);
                                        if (nextIsSpecial) {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setButtonRect({
                                                x: rect.left + rect.width / 2,
                                                y: rect.top + rect.height / 2
                                            });
                                            setAnimationActive(true);
                                        } else {
                                            setAnimationActive(false);
                                        }
                                    }}
                                    className={`ml-4 flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${
                                        isSpecial 
                                        ? 'bg-yellow-400 text-black border-yellow-400 font-bold shadow-lg shadow-yellow-400/20 scale-105' 
                                        : 'bg-white/5 text-text-muted border-white/10 hover:border-white/30 hover:bg-white/10'
                                    }`}
                                    title={isSpecial ? "Marked as Special Day" : "Mark as Special Day"}
                                >
                                    <Star className={`w-4 h-4 ${isSpecial ? 'fill-black' : ''}`} />
                                    <span className="text-[10px] sm:text-xs uppercase tracking-widest leading-none">Special Day</span>
                                </button>
                            ) : isSpecial && (
                                <Star className="w-6 h-6 ml-4 fill-yellow-400 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)] animate-pulse-slow font-bold" />
                            )}
                        </div>
                        <h2 className="text-2xl sm:text-4xl font-serif font-bold text-white break-words mt-1">{displayDate}</h2>
                        {title && !isEditing && <p className="text-secondary text-lg font-medium opacity-90 break-words mt-1">{title}</p>}
                    </div>
                </div>
            </div>


            {/* Content Container */}
            <div className={`glass-card flex-1 p-6 md:p-8 overflow-hidden flex flex-col relative ${isEditing ? 'ring-2 ring-primary/30' : ''}`}>
                
                {/* Word Progress Bar (Editor Mode Only) */}
                {isEditing && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-white/5 overflow-hidden z-20">
                        <div 
                            className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 ease-out"
                            style={{ width: `${wordProgress}%` }}
                        />
                        {totalWordCount >= wordGoal && (
                            <div className="absolute right-2 top-2 flex items-center text-[10px] text-green-400 font-bold uppercase tracking-widest animate-pulse">
                                <Target className="w-3 h-3 mr-1" />
                                Goal Reached
                            </div>
                        )}
                    </div>
                )}

                {images.length > 0 && !isEditing && (
                    <div className={`mb-6 ${images.length === 1 ? 'flex justify-center' : 'columns-1 sm:columns-2 gap-4'}`}>
                        {images.map((img, idx) => (
                            <div
                                key={idx}
                                onClick={() => handleImageClick(img)}
                                className={`break-inside-avoid rounded-lg overflow-hidden border border-white/10 shadow-lg relative group cursor-zoom-in ${images.length > 1 ? 'mb-4' : ''}`}
                            >
                                <ImageWithSkeleton
                                    src={img.url}
                                    alt={`Attachment ${idx + 1}`}
                                    className="w-full"
                                    imgClassName={`block h-auto ${images.length === 1 ? 'max-h-[80vh] w-auto max-w-full' : 'w-full'}`}
                                />
                                {img.caption && (
                                    <div className="p-3 bg-white/5 backdrop-blur-sm border-t border-white/10">
                                        <p className="text-center text-sm text-gray-300 italic font-medium leading-relaxed">
                                            {img.caption}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {isEditing ? (
                    <div className="h-full flex flex-col" onPaste={handlePaste}>
                        <div onClick={() => {
                            if (isInferredTitle) {
                                toastError("Title is inferred from content. Please edit it in the journal entry.");
                            }
                        }} className="relative group">
                            <textarea
                                ref={titleTextareaRef}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Give this day a title..."
                                readOnly={isInferredTitle}
                                rows={1}
                                className={`w-full bg-transparent text-2xl font-serif font-bold text-white border-none focus:ring-0 placeholder-white/20 mb-2 p-0 resize-none overflow-hidden ${isInferredTitle ? 'cursor-not-allowed opacity-80' : ''}`}
                            />
                            {isInferredTitle && (
                                <div className="absolute -top-6 left-0 text-[10px] text-text-muted/60 uppercase tracking-widest flex items-center">
                                    <PenTool className="w-2.5 h-2.5 mr-1" />
                                    Inferred Title
                                </div>
                            )}
                        </div>

                        {/* Mood Picker */}
                        <div className="flex items-center gap-4 mb-6 py-2 px-3 bg-white/5 rounded-xl border border-white/10 w-fit">
                            <span className="text-[10px] text-text-muted uppercase tracking-widest font-bold">How's your mood?</span>
                            <div className="flex items-center gap-1.5">
                                {MOODS.map((m) => {
                                    const Icon = m.icon;
                                    const isSelected = mood === m.value;
                                    return (
                                        <button
                                            key={m.value}
                                            onClick={() => setMood(isSelected ? null : m.value)}
                                            className={`p-1.5 rounded-lg transition-all duration-200 group/item relative ${
                                                isSelected 
                                                ? 'bg-white/10 scale-110 shadow-lg' 
                                                : 'hover:bg-white/5 opacity-40 hover:opacity-100'
                                            }`}
                                            title={m.label}
                                        >
                                            <Icon 
                                                className="w-5 h-5 transition-colors" 
                                                style={{ color: isSelected ? m.color : 'white' }}
                                            />
                                            {isSelected && (
                                                <div 
                                                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full animate-bounce"
                                                    style={{ backgroundColor: m.color }}
                                                />
                                            )}
                                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-[10px] py-1 px-2 rounded opacity-0 group-hover/item:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                                {m.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Writing Prompt Callout */}
                        {showPrompts && (
                            <div className="mb-6 p-4 rounded-xl bg-secondary/10 border border-secondary/20 animate-in slide-in-from-top duration-300 relative group">
                                <button 
                                    onClick={() => setShowPrompts(false)}
                                    className="absolute top-2 right-2 text-text-muted hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                <div className="flex items-start gap-3">
                                    <Sparkles className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[10px] text-secondary font-bold uppercase tracking-widest mb-1">Writing Prompt</p>
                                        <p className="text-white italic text-lg leading-relaxed">{currentPrompt}</p>
                                        <button 
                                            onClick={getRandomPrompt}
                                            className="mt-3 text-xs text-secondary hover:text-white font-medium flex items-center transition-colors"
                                        >
                                            Try another one <ChevronRight className="w-3 h-3 ml-1" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tags Editor Area */}
                        {availableTags.length > 0 && (
                            <div className="mb-6">
                                <label className="flex items-center text-sm font-medium text-text-muted mb-2">
                                    <Tag className="w-4 h-4 mr-2" /> Tags
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {availableTags.map(tag => {
                                        const isSelected = selectedTags.includes(tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                type="button"
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setSelectedTags(prev => prev.filter(id => id !== tag.id));
                                                    } else {
                                                        setSelectedTags(prev => [...prev, tag.id]);
                                                    }
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-all duration-200 border ${isSelected
                                                        ? 'bg-white/10 shadow-sm'
                                                        : 'bg-transparent hover:bg-white/5 opacity-60 hover:opacity-100'
                                                    }`}
                                                style={{
                                                    borderColor: isSelected ? tag.color : 'rgba(255,255,255,0.1)',
                                                    color: isSelected ? tag.color : 'var(--text-muted)'
                                                }}
                                            >
                                                <div
                                                    className="w-2 h-2 rounded-full"
                                                    style={{ backgroundColor: tag.color }}
                                                />
                                                {tag.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="mb-6 rounded-lg border border-secondary/20 bg-secondary/10 px-4 py-3 text-sm text-text-secondary">
                            <div className="flex items-start gap-3">
                                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                                <div>
                                    <p className="font-bold text-white">AI summary available after saving</p>
                                    <p className="mt-1 text-xs leading-relaxed text-text-muted">
                                        Save this entry, then switch to view mode to generate or review the private local AI summary.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Image Upload Area */}
                        <div className="mb-4">
                            {(images.length > 0 || uploading) && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                                    {images.map((img, idx) => (
                                        <div
                                            key={idx}
                                            className={`relative rounded-lg overflow-hidden border border-white/10 group aspect-square bg-black/40 flex items-center justify-center cursor-move transition-transform duration-200 ${dragOverImageIndex === idx ? 'scale-105 ring-2 ring-primary/80 z-10' : ''} ${draggedImageIndex === idx ? 'opacity-50' : ''}`}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, idx)}
                                            onDragEnter={(e) => handleDragEnter(e, idx)}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDrop(e, idx)}
                                            onDragEnd={handleDragEnd}
                                        >
                                            <ImageWithSkeleton
                                                src={img.url}
                                                alt={`Uploaded ${idx}`}
                                                className="w-full h-full"
                                                imgClassName="w-full h-full object-cover"
                                            />
                                            <button
                                                onClick={() => {
                                                    setEditingCaptionIndex(idx);
                                                    setTempCaption(img.caption || '');
                                                }}
                                                className="absolute top-2 left-2 p-1.5 bg-blue-500/80 text-white rounded-full hover:bg-blue-600 transition-colors"
                                                title="Edit Caption"
                                            >
                                                <PenTool className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveImage(idx)}
                                                className="absolute top-2 right-2 p-1.5 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors"
                                                title="Remove Image"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            {img.caption && (
                                                <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-black/70 backdrop-blur-sm text-xs text-center text-white truncate border-t border-white/10">
                                                    {img.caption}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {uploading && Array.from({ length: uploadQueueCount }).map((_, idx) => (
                                        <div
                                            key={`uploading-${idx}`}
                                            className="relative rounded-lg overflow-hidden border border-white/10 group aspect-square bg-black/40 flex flex-col items-center justify-center p-4"
                                        >
                                            <div className="absolute inset-0 bg-white/5 animate-pulse" />
                                            <div className="relative z-10 flex flex-col items-center w-full">
                                                {idx < currentUploadIndex ? (
                                                    <div className="text-green-400 mb-2">
                                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                ) : idx === currentUploadIndex ? (
                                                    <>
                                                        <Loader className="w-8 h-8 animate-spin text-primary mb-3" />
                                                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                            <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }} />
                                                        </div>
                                                        <span className="text-[10px] text-primary/80 mt-2 text-center uppercase tracking-wider font-bold">
                                                            {statusMessage.includes('Converting') ? 'Converting' : statusMessage.includes('Compressing') ? 'Compressing' : 'Uploading'}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <ImageIcon className="w-8 h-8 text-white/20" />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {images.length + (uploading ? uploadQueueCount : 0) < 8 && (
                                <div className="relative group">
                                    <input
                                        type="file"
                                        accept="image/*,.heic,.heif"
                                        multiple
                                        onChange={handleImageUpload}
                                        className="hidden"
                                        id="image-upload"
                                        disabled={uploading}
                                    />
                                    <label
                                        htmlFor="image-upload"
                                        className={`flex flex-col items-center justify-center w-full ${(images.length > 0 || uploading) ? 'h-24' : 'h-32'} border-2 border-dashed border-white/10 rounded-lg transition-all ${uploading ? 'opacity-50 cursor-not-allowed bg-white/5' : 'cursor-pointer hover:border-primary/50 hover:bg-white/5'}`}
                                    >
                                        <div className="flex flex-col items-center text-text-muted group-hover:text-white">
                                            <ImageIcon className="w-8 h-8 mb-2" />
                                            <span className="text-sm font-medium">Click to upload images ({images.length + (uploading ? uploadQueueCount : 0)}/8)</span>
                                            <span className="text-xs mt-1 text-text-muted/60">Max 200KB each (Auto-compressed)</span>
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar -mr-4 pr-4">
                            <div className="mb-6">
                                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted">
                                    <BookOpen className="h-4 w-4 text-primary" />
                                    Main entry
                                </div>
                                <SimpleMdeReact
                                    value={content}
                                    onChange={setContent}
                                    options={mdeOptions}
                                    className="prose-dark"
                                />
                            </div>

                            {entrySections.length > 0 && (
                                <div className="space-y-4">
                                    {entrySections.map((section) => {
                                        const subEntry = subEntries[section.id] || {};

                                        return (
                                            <section
                                                key={section.id}
                                                className="rounded-xl border border-white/10 bg-white/5 p-4"
                                            >
                                                <div className="mb-3 flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted">
                                                    <Type className="h-4 w-4 shrink-0 text-primary" />
                                                    <span className="min-w-0 truncate">{section.name}</span>
                                                </div>

                                                {section.hasCustomTitle && (
                                                    <input
                                                        value={subEntry.title || ''}
                                                        onChange={(event) => updateSubEntry(section.id, 'title', event.target.value)}
                                                        placeholder={`${section.name} title`}
                                                        className="mb-3 w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white outline-none transition-colors placeholder-white/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                                                    />
                                                )}

                                                <textarea
                                                    value={subEntry.content || ''}
                                                    onChange={(event) => updateSubEntry(section.id, 'content', event.target.value)}
                                                    placeholder={`Write ${section.name.toLowerCase()}...`}
                                                    rows={7}
                                                    className="w-full min-w-0 resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-white outline-none transition-colors placeholder-white/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                                                />
                                            </section>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        
                        <div className="mt-4 flex items-center justify-between text-[10px] text-text-muted uppercase tracking-widest font-bold border-t border-white/5 pt-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <PenTool className="w-3 h-3" />
                                    {totalWordCount} words
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Clock className="w-3 h-3" />
                                    {readingTime}
                                </div>
                            </div>
                            {isEditing && (
                                <div className="flex items-center gap-2 text-primary">
                                    {isAutoSaving ? (
                                        <div className="flex items-center gap-2 text-secondary animate-pulse">
                                            <Loader className="w-3 h-3 animate-spin" />
                                            Saving Changes...
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 animate-pulse">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                            Editing Mode
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto custom-scrollbar -mr-4 pr-4">
                            <div className="max-w-none">
                                {mood && (
                                    <div className="flex items-center gap-3 mb-8 p-3 rounded-2xl bg-white/5 border border-white/10 w-fit">
                                        <div 
                                            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                                            style={{ backgroundColor: `${MOODS.find(m => m.value === mood)?.color}20` }}
                                        >
                                            {React.createElement(MOODS.find(m => m.value === mood)?.icon, { 
                                                className: "w-6 h-6",
                                                style: { color: MOODS.find(m => m.value === mood)?.color }
                                            })}
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">Today's Mood</p>
                                            <p className="text-white font-bold">{MOODS.find(m => m.value === mood)?.label}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Metadata Section (View Mode) */}
                                <div className="flex flex-col gap-4 mb-8">
                                    {selectedTags.length > 0 && availableTags.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {selectedTags.map(tagId => {
                                                const tag = availableTags.find(t => t.id === tagId);
                                                if (!tag) return null;
                                                return (
                                                    <span
                                                        key={tagId}
                                                        className="px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5"
                                                        style={{ backgroundColor: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}
                                                    >
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }}></div>
                                                        {tag.name}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-4 text-xs">
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                                            <PenTool className="w-3.5 h-3.5 text-secondary" />
                                            <span className="text-white font-medium">{totalWordCount} words</span>
                                        </div>
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                                            <Clock className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-white font-medium">{readingTime}</span>
                                        </div>
                                        {timeSinceEntry && (
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold">
                                                <span>{timeSinceEntry}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {displayContent && (
                                    <LocalSummaryPanel
                                        entryText={displayContent}
                                        wordCount={wordCount}
                                        debugTargetId={`journal-ai-debug-${date}`}
                                        savedSummaryRecord={localAiSummaryRecord}
                                        onSummaryGenerated={handleLocalSummaryGenerated}
                                    />
                                )}

                                <div className="markdown-content prose prose-invert max-w-none">
                                    {displayContent && (
                                        <ReactMarkdown>{displayContent}</ReactMarkdown>
                                    )}

                                    {visibleSubEntries.length > 0 && (
                                        <div className={`${displayContent ? 'mt-10 border-t border-white/10 pt-8' : ''} space-y-6`}>
                                            {visibleSubEntries.map((subEntry) => (
                                                <section
                                                    key={subEntry.section.id}
                                                    className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5"
                                                >
                                                    <div className="mb-4 flex min-w-0 flex-col gap-1">
                                                        <div className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
                                                            <Type className="h-4 w-4 shrink-0" />
                                                            <span className="min-w-0 truncate">{subEntry.section.name}</span>
                                                        </div>
                                                        {subEntry.title && (
                                                            <h3 className="m-0 text-xl font-serif font-bold text-white">{subEntry.title}</h3>
                                                        )}
                                                    </div>

                                                    {subEntry.content && (
                                                        <div className="markdown-content prose prose-invert max-w-none">
                                                            <ReactMarkdown>{subEntry.content}</ReactMarkdown>
                                                        </div>
                                                    )}
                                                </section>
                                            ))}
                                        </div>
                                    )}

                                    {!displayContent && visibleSubEntries.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-[40vh] text-text-muted opacity-60">
                                            <Edit2 className="w-12 h-12 mb-4 opacity-30" />
                                            <p className="text-lg">This page is empty.</p>
                                            <p className="text-sm">Click Edit to start writing.</p>
                                        </div>
                                    )}
                                </div>

                                {displayContent && (
                                    <div id={`journal-ai-debug-${date}`} className="mt-8" />
                                )}
                            </div>
                        </div>
                        <StorageStats
                            entryTextSize={new Blob([content, subEntriesToPlainText(subEntries)]).size}
                            entryImageSize={images.reduce((acc, img) => acc + (img.size || 0), 0)}
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

            <ConfirmModal
                isOpen={showDuplicateConfirm}
                onClose={() => setShowDuplicateConfirm(false)}
                onConfirm={() => performSave()}
                title="Warning: Duplicate Text"
                message="Detected duplicate text in your entry. Are you sure you want to save this?"
                confirmText="Yes, Save"
                cancelText="Go back to editing"
                isDangerous={false}
            />

            {/* Caption Edit Modal */}
            {editingCaptionIndex !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-md p-6 relative animate-in fade-in zoom-in duration-200">
                        <h3 className="text-xl font-bold text-white mb-4">Image Caption</h3>
                        <textarea
                            value={tempCaption}
                            onChange={(e) => setTempCaption(e.target.value)}
                            placeholder="Enter a caption for this image..."
                            className="w-full h-32 glass-input mb-6 resize-none"
                            autoFocus
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setEditingCaptionIndex(null)}
                                className="glass-button px-4 py-2 text-text hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    const newImages = [...images];
                                    newImages[editingCaptionIndex].caption = tempCaption.trim();
                                    setImages(newImages);
                                    setEditingCaptionIndex(null);
                                }}
                                className="px-6 py-2 rounded-lg bg-primary text-white font-bold hover:bg-primary-dark transition-colors"
                            >
                                Save Caption
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox Modal - Portaled to body to avoid z-index stacking context issues */}
            {lightboxImage && createPortal(
                <div
                    className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-300 overflow-auto p-4 sm:p-8"
                    onClick={closeLightbox}
                >
                    <div
                        className="relative flex flex-col items-center shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Caption */}
                        {lightboxImage.caption && (
                            <div className="mb-4 bg-black/60 backdrop-blur-md px-6 py-3 rounded-xl border border-white/10 max-w-prose">
                                <p className="text-white text-sm sm:text-base font-medium text-center">
                                    {lightboxImage.caption}
                                </p>
                            </div>
                        )}

                        {/* Image Wrapper */}
                        <div className="relative inline-block" style={{
                            maxWidth: zoomLevel > 1 ? 'none' : '100%',
                            width: zoomLevel > 1 ? 'auto' : '100%',
                            display: 'flex',
                            justifyContent: 'center'
                        }}>
                            <img
                                src={lightboxImage.url}
                                alt="Full screen view"
                                className={`block object-contain shadow-2xl rounded-lg transition-all duration-200 ease-out ${zoomLevel === 1 ? 'max-w-[90vw] md:max-w-[80vw]' : ''}`}
                                style={{
                                    height: `${80 * zoomLevel}vh`,
                                    maxHeight: zoomLevel === 1 ? '85vh' : 'none',
                                    width: 'auto',
                                    maxWidth: zoomLevel > 1 ? 'none' : undefined
                                }}
                            />
                        </div>
                    </div>

                    {/* Zoom Controls & Close - Fixed at bottom center (floating) */}
                    <div
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 z-[110]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={handleZoomOut}
                            disabled={zoomLevel <= 1}
                            className="p-2 hover:bg-white/10 rounded-full text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Zoom Out"
                        >
                            <ChevronLeft className="w-5 h-5 rotate-[-90deg]" />
                        </button>

                        <span className="text-white font-mono text-sm w-12 text-center select-none">
                            {Math.round(zoomLevel * 100)}%
                        </span>

                        <button
                            onClick={handleZoomIn}
                            disabled={zoomLevel >= 3}
                            className="p-2 hover:bg-white/10 rounded-full text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Zoom In"
                        >
                            <ChevronRight className="w-5 h-5 rotate-[-90deg]" />
                        </button>

                        <div className="w-px h-6 bg-white/20 mx-1"></div>

                        <button
                            onClick={closeLightbox}
                            className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                            title="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {animationActive && buttonRect && createPortal(
                <SpecialDayAnimation
                    buttonRect={buttonRect}
                    onComplete={() => setAnimationActive(false)}
                />,
                document.body
            )}
        </div >
    );
}
