import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Archive, Bell, BookOpen, Check, FolderInput, Hash, Lock, Loader2, Moon, Plus, Settings, Sun, Trash2, Type, Wrench, X } from 'lucide-react';
import { collection, deleteField, doc, getDocs, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useBackup } from '../context/BackupContext';
import { db } from '../firebase';
import ConfirmModal from './ConfirmModal';
import DataRepair from './DataRepair';
import DirectoryImporter from './DirectoryImporter';
import {
    createEntrySectionId,
    createNumericEntryFieldId,
    ENTRY_SECTION_NAME_MAX_LENGTH,
    ENTRY_SECTIONS_SETTINGS_DOC,
    MAX_CUSTOM_ENTRY_SECTIONS,
    MAX_NUMERIC_ENTRY_FIELDS,
    normalizeNumericEntryFields,
    normalizeEntrySections,
    numericEntriesToPlainText,
    sanitizeEntrySectionName,
    subEntriesToPlainText
} from '../utils/entrySections';
import { BACKUP_REMINDER_OPTIONS } from '../utils/backupReminder';

const THEME_OPTIONS = [
    {
        value: 'dark',
        label: 'Dark',
        description: 'A calmer journal surface for evenings and low light.',
        icon: Moon
    },
    {
        value: 'light',
        label: 'Light',
        description: 'A brighter journal surface for daytime writing.',
        icon: Sun
    }
];

function getInitialTheme() {
    const savedTheme = localStorage.getItem('journal-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function formatMergedSubEntryBlock(section, subEntry) {
    const title = typeof subEntry?.title === 'string' ? subEntry.title.trim() : '';
    const content = typeof subEntry?.content === 'string' ? subEntry.content.trim() : '';
    const heading = title ? `${section.name}: ${title}` : section.name;

    return [`## ${heading}`, content].filter(Boolean).join('\n\n');
}

function appendSubEntryToMainContent(content, section, subEntry) {
    const block = formatMergedSubEntryBlock(section, subEntry);
    if (!block) return content || '';

    const existingContent = content || '';
    const separator = existingContent.trim() ? '\n\n---\n\n' : '';
    return `${existingContent.trimEnd()}${separator}${block}`;
}

function appendNumericEntryToMainContent(content, field, value) {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) return content || '';

    const existingContent = content || '';
    const separator = existingContent.trim() ? '\n\n---\n\n' : '';
    return `${existingContent.trimEnd()}${separator}## ${field.name}\n\n${numericValue}`;
}

export default function SettingsView() {
    const { currentUser } = useAuth();
    const { backupReminderSettings, openBackup, updateBackupReminderSettings } = useBackup();
    const [theme, setTheme] = useState(getInitialTheme);
    const [entrySections, setEntrySections] = useState([]);
    const [numericFields, setNumericFields] = useState([]);
    const [newSectionName, setNewSectionName] = useState('');
    const [newSectionHasCustomTitle, setNewSectionHasCustomTitle] = useState(false);
    const [newNumericFieldName, setNewNumericFieldName] = useState('');
    const [sectionsSaving, setSectionsSaving] = useState(false);
    const [sectionsError, setSectionsError] = useState('');
    const [sectionsNotice, setSectionsNotice] = useState('');
    const [deleteCandidate, setDeleteCandidate] = useState(null);
    const [deleteMode, setDeleteMode] = useState('merge');
    const [deleteSwipeValue, setDeleteSwipeValue] = useState(0);
    const [deleteProcessing, setDeleteProcessing] = useState(false);
    const [deleteProgressMessage, setDeleteProgressMessage] = useState('');
    const [trueDeleteConfirmOpen, setTrueDeleteConfirmOpen] = useState(false);
    const [numericDeleteCandidate, setNumericDeleteCandidate] = useState(null);
    const [numericDeleteProcessing, setNumericDeleteProcessing] = useState(false);
    const [customTitleCandidate, setCustomTitleCandidate] = useState(null);
    const [customTitleMergeEnabled, setCustomTitleMergeEnabled] = useState(true);
    const [customTitleProcessing, setCustomTitleProcessing] = useState(false);
    const [backupReminderSaving, setBackupReminderSaving] = useState(false);
    const [backupReminderError, setBackupReminderError] = useState('');
    const lastSavedSectionsRef = useRef([]);
    const lastSavedNumericFieldsRef = useRef([]);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem('journal-theme', theme);
    }, [theme]);

    useEffect(() => {
        if (!currentUser) return undefined;

        const settingsRef = doc(db, 'users', currentUser.uid, 'settings', ENTRY_SECTIONS_SETTINGS_DOC);
        const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
            const data = snapshot.data() || {};
            const normalizedSections = normalizeEntrySections(data.sections);
            const normalizedNumericFields = normalizeNumericEntryFields(data.numericFields);
            lastSavedSectionsRef.current = normalizedSections;
            lastSavedNumericFieldsRef.current = normalizedNumericFields;
            setEntrySections(normalizedSections);
            setNumericFields(normalizedNumericFields);
            setSectionsError('');
        }, (error) => {
            console.error('Failed to load entry management settings:', error);
            setSectionsError('Entry management settings could not be loaded.');
        });

        return () => unsubscribe();
    }, [currentUser]);

    async function persistEntrySections(nextSections) {
        if (!currentUser) return;

        const normalizedSections = normalizeEntrySections(nextSections);
        setEntrySections(normalizedSections);
        setSectionsSaving(true);
        setSectionsError('');
        setSectionsNotice('');

        try {
            const settingsRef = doc(db, 'users', currentUser.uid, 'settings', ENTRY_SECTIONS_SETTINGS_DOC);
            await setDoc(settingsRef, {
                sections: normalizedSections,
                updatedAt: serverTimestamp()
            }, { merge: true });
            lastSavedSectionsRef.current = normalizedSections;
        } catch (error) {
            console.error('Failed to save entry management settings:', error);
            setEntrySections(lastSavedSectionsRef.current);
            setSectionsError('Entry management settings could not be saved.');
        } finally {
            setSectionsSaving(false);
        }
    }

    async function persistNumericFields(nextFields) {
        if (!currentUser) return;

        const normalizedFields = normalizeNumericEntryFields(nextFields);
        setNumericFields(normalizedFields);
        setSectionsSaving(true);
        setSectionsError('');
        setSectionsNotice('');

        try {
            const settingsRef = doc(db, 'users', currentUser.uid, 'settings', ENTRY_SECTIONS_SETTINGS_DOC);
            await setDoc(settingsRef, {
                numericFields: normalizedFields,
                updatedAt: serverTimestamp()
            }, { merge: true });
            lastSavedNumericFieldsRef.current = normalizedFields;
        } catch (error) {
            console.error('Failed to save numeric entry settings:', error);
            setNumericFields(lastSavedNumericFieldsRef.current);
            setSectionsError('Numeric input settings could not be saved.');
        } finally {
            setSectionsSaving(false);
        }
    }

    async function handleAddEntrySection() {
        const name = sanitizeEntrySectionName(newSectionName);
        if (!name || entrySections.length >= MAX_CUSTOM_ENTRY_SECTIONS) return;

        const nextSections = [
            ...entrySections,
            {
                id: createEntrySectionId(),
                name,
                hasCustomTitle: newSectionHasCustomTitle,
                createdAt: new Date().toISOString()
            }
        ];

        setNewSectionName('');
        setNewSectionHasCustomTitle(false);
        await persistEntrySections(nextSections);
    }

    async function handleAddNumericField() {
        const name = sanitizeEntrySectionName(newNumericFieldName);
        if (!name || numericFields.length >= MAX_NUMERIC_ENTRY_FIELDS) return;

        const nextFields = [
            ...numericFields,
            {
                id: createNumericEntryFieldId(),
                name,
                createdAt: new Date().toISOString()
            }
        ];

        setNewNumericFieldName('');
        await persistNumericFields(nextFields);
    }

    function handleSectionNameChange(sectionId, name) {
        setEntrySections((currentSections) => currentSections.map((section) => (
            section.id === sectionId ? { ...section, name } : section
        )));
    }

    async function handleSectionNameCommit(sectionId) {
        const section = entrySections.find((item) => item.id === sectionId);
        if (!section) return;

        const name = sanitizeEntrySectionName(section.name);
        if (!name) {
            setEntrySections(lastSavedSectionsRef.current);
            return;
        }

        await persistEntrySections(entrySections.map((item) => (
            item.id === sectionId ? { ...item, name } : item
        )));
    }

    function handleNumericFieldNameChange(fieldId, name) {
        setNumericFields((currentFields) => currentFields.map((field) => (
            field.id === fieldId ? { ...field, name } : field
        )));
    }

    async function handleNumericFieldNameCommit(fieldId) {
        const field = numericFields.find((item) => item.id === fieldId);
        if (!field) return;

        const name = sanitizeEntrySectionName(field.name);
        if (!name) {
            setNumericFields(lastSavedNumericFieldsRef.current);
            return;
        }

        await persistNumericFields(numericFields.map((item) => (
            item.id === fieldId ? { ...item, name } : item
        )));
    }

    async function handleCustomTitleToggle(section) {
        if (!section.hasCustomTitle) {
            await persistEntrySections(entrySections.map((item) => (
                item.id === section.id ? { ...item, hasCustomTitle: true } : item
            )));
            return;
        }

        setCustomTitleCandidate(section);
        setCustomTitleMergeEnabled(true);
        setSectionsError('');
        setSectionsNotice('');
    }

    function closeCustomTitleModal() {
        if (customTitleProcessing) return;
        setCustomTitleCandidate(null);
        setCustomTitleMergeEnabled(true);
    }

    function mergeSubEntryTitleIntoContent(subEntry) {
        const title = typeof subEntry?.title === 'string' ? subEntry.title.trim() : '';
        const content = typeof subEntry?.content === 'string' ? subEntry.content : '';

        if (!title) return content;
        if (content.trim().startsWith(`# ${title}`)) return content;

        return [`# ${title}`, content.trimStart()].filter(Boolean).join('\n\n');
    }

    async function migrateCustomTitlesForSection(section, shouldMergeTitles) {
        if (!currentUser) return 0;

        const entriesRef = collection(db, 'users', currentUser.uid, 'entries');
        const entriesSnapshot = await getDocs(entriesRef);
        const updates = [];

        entriesSnapshot.forEach((entryDoc) => {
            const data = entryDoc.data();
            const subEntry = data.subEntries?.[section.id];
            if (!subEntry || typeof subEntry !== 'object' || typeof subEntry.title !== 'string' || !subEntry.title.trim()) return;

            const nextSubEntry = {
                content: shouldMergeTitles
                    ? mergeSubEntryTitleIntoContent(subEntry)
                    : (subEntry.content || '')
            };

            const nextSubEntries = {
                ...(data.subEntries || {}),
                [section.id]: nextSubEntry
            };

            updates.push({
                ref: entryDoc.ref,
                payload: {
                    [`subEntries.${section.id}`]: nextSubEntry,
                    textSize: new Blob([
                        data.content || '',
                        subEntriesToPlainText(nextSubEntries),
                        numericEntriesToPlainText(data.numericEntries, numericFields)
                    ]).size,
                    updatedAt: serverTimestamp()
                }
            });
        });

        await commitEntryUpdates(updates);
        return updates.length;
    }

    async function confirmDisableCustomTitle() {
        if (!customTitleCandidate) return;

        const section = customTitleCandidate;
        setCustomTitleProcessing(true);
        setSectionsError('');
        setSectionsNotice('');

        try {
            const changedEntries = await migrateCustomTitlesForSection(section, customTitleMergeEnabled);
            await persistEntrySections(entrySections.map((item) => (
                item.id === section.id ? { ...item, hasCustomTitle: false } : item
            )));
            setSectionsNotice(customTitleMergeEnabled
                ? `Custom titles disabled for ${section.name}. Merged ${changedEntries} saved title${changedEntries === 1 ? '' : 's'} into section content.`
                : `Custom titles disabled for ${section.name}. Removed ${changedEntries} saved title field${changedEntries === 1 ? '' : 's'}.`);
            setCustomTitleCandidate(null);
        } catch (error) {
            console.error('Failed to disable custom titles:', error);
            setSectionsError('Custom titles could not be disabled. No setting was changed.');
        } finally {
            setCustomTitleProcessing(false);
        }
    }

    function openDeleteSectionModal(section) {
        setDeleteCandidate(section);
        setDeleteMode('merge');
        setDeleteSwipeValue(0);
        setDeleteProgressMessage('');
        setSectionsError('');
        setSectionsNotice('');
    }

    function closeDeleteSectionModal(force = false) {
        if (deleteProcessing && !force) return;
        setDeleteCandidate(null);
        setDeleteMode('merge');
        setDeleteSwipeValue(0);
        setDeleteProgressMessage('');
        setTrueDeleteConfirmOpen(false);
    }

    async function commitEntryUpdates(updates) {
        const batchLimit = 450;

        for (let i = 0; i < updates.length; i += batchLimit) {
            const chunk = updates.slice(i, i + batchLimit);
            const batch = writeBatch(db);

            chunk.forEach(({ ref, payload }) => {
                batch.update(ref, payload);
            });

            await batch.commit();
        }
    }

    async function removeSectionFromEntries(section, mode) {
        if (!currentUser) return { changedEntries: 0, mergedEntries: 0 };

        const entriesRef = collection(db, 'users', currentUser.uid, 'entries');
        const entriesSnapshot = await getDocs(entriesRef);
        const updates = [];
        let mergedEntries = 0;

        entriesSnapshot.forEach((entryDoc) => {
            const data = entryDoc.data();
            const subEntries = data.subEntries;
            const hasSection = subEntries && Object.prototype.hasOwnProperty.call(subEntries, section.id);

            if (!hasSection) return;

            const targetSubEntry = subEntries[section.id] || {};
            const remainingSubEntries = { ...subEntries };
            delete remainingSubEntries[section.id];

            const payload = {
                [`subEntries.${section.id}`]: deleteField(),
                updatedAt: serverTimestamp()
            };

            if (mode === 'merge') {
                payload.content = appendSubEntryToMainContent(data.content || '', section, targetSubEntry);
                payload.textSize = new Blob([
                    payload.content,
                    subEntriesToPlainText(remainingSubEntries),
                    numericEntriesToPlainText(data.numericEntries, numericFields)
                ]).size;
                mergedEntries += 1;
            } else {
                payload.textSize = new Blob([
                    data.content || '',
                    subEntriesToPlainText(remainingSubEntries),
                    numericEntriesToPlainText(data.numericEntries, numericFields)
                ]).size;
            }

            updates.push({ ref: entryDoc.ref, payload });
        });

        await commitEntryUpdates(updates);

        return {
            changedEntries: updates.length,
            mergedEntries
        };
    }

    async function executeDeleteEntrySection(mode) {
        if (!deleteCandidate || !currentUser) return;

        const section = deleteCandidate;
        setDeleteProcessing(true);
        setSectionsError('');
        setSectionsNotice('');
        setDeleteProgressMessage(mode === 'merge'
            ? 'Merging saved sub-entry text into main entries...'
            : 'Deleting saved sub-entry text from entries...');

        try {
            const result = await removeSectionFromEntries(section, mode);
            setDeleteProgressMessage('Removing section from settings...');
            await persistEntrySections(entrySections.filter((item) => item.id !== section.id));

            const actionText = mode === 'merge'
                ? `Merged ${result.mergedEntries} saved sub-entry value${result.mergedEntries === 1 ? '' : 's'} into main entries.`
                : `Deleted sub-entry values from ${result.changedEntries} entr${result.changedEntries === 1 ? 'y' : 'ies'}.`;
            setSectionsNotice(`${section.name} removed. ${actionText}`);
            closeDeleteSectionModal(true);
        } catch (error) {
            console.error('Failed to delete entry section:', error);
            setSectionsError('This section could not be removed. No settings were changed.');
            setDeleteSwipeValue(0);
        } finally {
            setDeleteProcessing(false);
            setDeleteProgressMessage('');
        }
    }

    function handleDeleteSwipeChange(event) {
        const nextValue = Number(event.target.value);
        setDeleteSwipeValue(nextValue);

        if (nextValue < 100 || deleteProcessing || !deleteCandidate) return;

        if (deleteMode === 'delete') {
            setTrueDeleteConfirmOpen(true);
        } else {
            executeDeleteEntrySection('merge');
        }
    }

    async function removeNumericFieldFromEntries(field) {
        if (!currentUser) return { changedEntries: 0, mergedEntries: 0 };

        const entriesRef = collection(db, 'users', currentUser.uid, 'entries');
        const entriesSnapshot = await getDocs(entriesRef);
        const remainingFields = numericFields.filter((item) => item.id !== field.id);
        const updates = [];
        let mergedEntries = 0;

        entriesSnapshot.forEach((entryDoc) => {
            const data = entryDoc.data();
            const numericEntries = data.numericEntries;
            const hasField = numericEntries && Object.prototype.hasOwnProperty.call(numericEntries, field.id);

            if (!hasField) return;

            const remainingNumericEntries = { ...numericEntries };
            delete remainingNumericEntries[field.id];

            const nextContent = appendNumericEntryToMainContent(data.content || '', field, numericEntries[field.id]);

            updates.push({
                ref: entryDoc.ref,
                payload: {
                    content: nextContent,
                    [`numericEntries.${field.id}`]: deleteField(),
                    textSize: new Blob([
                        nextContent,
                        subEntriesToPlainText(data.subEntries),
                        numericEntriesToPlainText(remainingNumericEntries, remainingFields)
                    ]).size,
                    updatedAt: serverTimestamp()
                }
            });
            mergedEntries += 1;
        });

        await commitEntryUpdates(updates);

        return {
            changedEntries: updates.length,
            mergedEntries
        };
    }

    async function confirmRemoveNumericField() {
        if (!numericDeleteCandidate) return;

        const field = numericDeleteCandidate;
        setNumericDeleteProcessing(true);
        setSectionsError('');
        setSectionsNotice('');

        try {
            const result = await removeNumericFieldFromEntries(field);
            await persistNumericFields(numericFields.filter((item) => item.id !== field.id));
            setSectionsNotice(`${field.name} removed. Merged ${result.mergedEntries} saved numeric value${result.mergedEntries === 1 ? '' : 's'} into main entries.`);
            setNumericDeleteCandidate(null);
        } catch (error) {
            console.error('Failed to remove numeric field:', error);
            setSectionsError('This numeric input could not be removed. No settings were changed.');
        } finally {
            setNumericDeleteProcessing(false);
        }
    }

    const managementOptions = [
        {
            label: 'Import entries',
            description: 'Bring markdown journal files into Firestore from a local folder.',
            icon: FolderInput,
            control: <DirectoryImporter />
        },
        {
            label: 'Repair dates',
            description: 'Scan entries and move any stored under the wrong date.',
            icon: Wrench,
            control: <DataRepair />
        },
        {
            label: 'Backup journal',
            description: 'Export entries as a downloadable ZIP backup.',
            icon: Archive,
            control: (
                <button
                    onClick={() => openBackup()}
                    className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-primary transition-all duration-200"
                    title="Backup Options"
                >
                    <Archive className="h-5 w-5" />
                </button>
            )
        }
    ];

    async function handleBackupReminderFrequencyChange(frequency) {
        setBackupReminderSaving(true);
        setBackupReminderError('');

        try {
            await updateBackupReminderSettings({ frequency });
        } catch (error) {
            console.error('Failed to save backup reminder settings:', error);
            setBackupReminderError('Backup reminder setting could not be saved.');
        } finally {
            setBackupReminderSaving(false);
        }
    }

    return (
        <>
        <div className="mx-auto w-full max-w-3xl space-y-5">
            <div className="glass-card p-4 sm:p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Settings className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-2xl font-serif font-bold text-white">Settings</h2>
                        <p className="mt-1 text-sm text-text-muted">Tune the journal to fit the way you write.</p>
                    </div>
                </div>
            </div>

            <section className="glass-card overflow-hidden">
                <div className="border-b border-white/10 px-4 py-4 sm:px-6">
                    <h3 className="text-base font-bold text-white">Appearance</h3>
                    <p className="mt-1 text-sm text-text-muted">Choose the colour mode for the whole journal.</p>
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
                    {THEME_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const isActive = theme === option.value;

                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setTheme(option.value)}
                                className={`min-w-0 rounded-lg border p-4 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                                    isActive
                                        ? 'border-primary/60 bg-primary/15 shadow-[0_0_20px_rgba(139,92,246,0.14)]'
                                        : 'border-white/10 bg-white/5 hover:border-primary/30 hover:bg-white/10'
                                }`}
                                aria-pressed={isActive}
                            >
                                <span className="flex items-start justify-between gap-3">
                                    <span className="flex min-w-0 items-center gap-3">
                                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-primary text-white' : 'bg-white/5 text-text-muted'}`}>
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block font-bold text-white">{option.label}</span>
                                            <span className="mt-1 block text-sm leading-snug text-text-muted">{option.description}</span>
                                        </span>
                                    </span>
                                    {isActive && (
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                                            <Check className="h-4 w-4" />
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="glass-card overflow-hidden">
                <div className="border-b border-white/10 px-4 py-4 sm:px-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-base font-bold text-white">Backup reminders</h3>
                            <p className="mt-1 text-sm text-text-muted">Choose how often save actions should remind you to back up.</p>
                        </div>
                        {backupReminderSaving && (
                            <span className="text-xs font-bold uppercase tracking-widest text-primary">Saving...</span>
                        )}
                    </div>
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
                    {BACKUP_REMINDER_OPTIONS.map((option) => {
                        const isActive = backupReminderSettings.frequency === option.value;

                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => handleBackupReminderFrequencyChange(option.value)}
                                disabled={backupReminderSaving}
                                className={`min-w-0 rounded-lg border p-4 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 ${
                                    isActive
                                        ? 'border-primary/60 bg-primary/15 shadow-[0_0_20px_rgba(139,92,246,0.14)]'
                                        : 'border-white/10 bg-white/5 hover:border-primary/30 hover:bg-white/10'
                                }`}
                                aria-pressed={isActive}
                            >
                                <span className="flex items-start justify-between gap-3">
                                    <span className="flex min-w-0 items-center gap-3">
                                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-primary text-white' : 'bg-white/5 text-text-muted'}`}>
                                            <Bell className="h-5 w-5" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block font-bold text-white">{option.label}</span>
                                            <span className="mt-1 block text-sm leading-snug text-text-muted">{option.description}</span>
                                        </span>
                                    </span>
                                    {isActive && (
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                                            <Check className="h-4 w-4" />
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {backupReminderError && (
                    <div className="border-t border-white/10 px-4 py-4 sm:px-6">
                        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                            {backupReminderError}
                        </p>
                    </div>
                )}
            </section>

            <section className="glass-card overflow-hidden">
                <div className="border-b border-white/10 px-4 py-4 sm:px-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-base font-bold text-white">Entry management</h3>
                            <p className="mt-1 text-sm text-text-muted">Add extra writing sections and numerical trackers.</p>
                        </div>
                        {sectionsSaving && (
                            <span className="text-xs font-bold uppercase tracking-widest text-primary">Saving...</span>
                        )}
                    </div>
                </div>

                <div className="divide-y divide-white/10">
                    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <BookOpen className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-bold text-white">Main entry</h4>
                                <p className="mt-1 text-sm leading-snug text-text-muted">The daily journal body stays fixed.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-text-muted">
                            <Lock className="h-4 w-4" />
                            Locked
                        </div>
                    </div>

                    {entrySections.map((section) => (
                        <div
                            key={section.id}
                            className="flex flex-col gap-4 px-4 py-4 sm:px-6"
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-primary">
                                        <Type className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <label className="text-xs font-bold uppercase tracking-widest text-text-muted">
                                            Section name
                                        </label>
                                        <input
                                            value={section.name}
                                            onChange={(event) => handleSectionNameChange(section.id, event.target.value)}
                                            onBlur={() => handleSectionNameCommit(section.id)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') event.currentTarget.blur();
                                            }}
                                            maxLength={ENTRY_SECTION_NAME_MAX_LENGTH}
                                            className="mt-2 w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => openDeleteSectionModal(section)}
                                    className="flex h-10 w-full items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 transition-colors hover:bg-red-500/20 sm:w-10"
                                    title="Remove entry section"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => handleCustomTitleToggle(section)}
                                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-left transition-colors hover:bg-white/10"
                                role="switch"
                                aria-checked={section.hasCustomTitle}
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm font-bold text-white">Custom title</span>
                                    <span className="block text-xs leading-snug text-text-muted">Show a title field in the entry editor.</span>
                                </span>
                                <span className="relative h-6 w-11 shrink-0 rounded-full border border-white/10 bg-white/10 transition-colors data-[checked=true]:border-primary/50 data-[checked=true]:bg-primary/40" data-checked={section.hasCustomTitle}>
                                    <span className={`absolute left-1 top-1 h-4 w-4 rounded-full transition-transform ${section.hasCustomTitle ? 'translate-x-5 bg-white' : 'bg-text-muted'}`} />
                                </span>
                            </button>
                        </div>
                    ))}
                </div>

                <div className="border-t border-white/10 px-4 py-4 sm:px-6">
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div className="min-w-0">
                            <label className="text-xs font-bold uppercase tracking-widest text-text-muted">
                                New section
                            </label>
                            <input
                                value={newSectionName}
                                onChange={(event) => setNewSectionName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') handleAddEntrySection();
                                }}
                                maxLength={ENTRY_SECTION_NAME_MAX_LENGTH}
                                placeholder="Work Journal"
                                className="mt-2 w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition-colors placeholder-white/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleAddEntrySection}
                            disabled={!sanitizeEntrySectionName(newSectionName) || entrySections.length >= MAX_CUSTOM_ENTRY_SECTIONS || sectionsSaving}
                            className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-variant disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            <Plus className="h-4 w-4" />
                            Add
                        </button>
                    </div>

                    <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                        <span className="min-w-0">
                            <span className="block text-sm font-bold text-white">Custom title</span>
                            <span className="block text-xs leading-snug text-text-muted">Include a title field for this section.</span>
                        </span>
                        <span className="relative shrink-0">
                            <input
                                type="checkbox"
                                checked={newSectionHasCustomTitle}
                                onChange={(event) => setNewSectionHasCustomTitle(event.target.checked)}
                                className="peer sr-only"
                            />
                            <span className="block h-6 w-11 rounded-full border border-white/10 bg-white/10 transition-colors peer-checked:border-primary/50 peer-checked:bg-primary/40" />
                            <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-text-muted transition-transform peer-checked:translate-x-5 peer-checked:bg-white" />
                        </span>
                    </label>

                    <div className="mt-6 border-t border-white/10 pt-5">
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div className="min-w-0">
                                <h4 className="font-bold text-white">Numerical inputs</h4>
                                <p className="mt-1 text-sm text-text-muted">
                                    Add up to {MAX_NUMERIC_ENTRY_FIELDS} number-only fields for daily counts or measurements.
                                </p>
                            </div>
                            <span className="text-xs font-bold uppercase tracking-widest text-text-muted">
                                {numericFields.length}/{MAX_NUMERIC_ENTRY_FIELDS}
                            </span>
                        </div>

                        {numericFields.length > 0 && (
                            <div className="mb-4 divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                                {numericFields.map((field) => (
                                    <div
                                        key={field.id}
                                        className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
                                    >
                                        <div className="flex min-w-0 flex-1 items-center gap-3">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                <Hash className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <label className="sr-only" htmlFor={`numeric-field-${field.id}`}>
                                                    Numeric input name
                                                </label>
                                                <input
                                                    id={`numeric-field-${field.id}`}
                                                    value={field.name}
                                                    onChange={(event) => handleNumericFieldNameChange(field.id, event.target.value)}
                                                    onBlur={() => handleNumericFieldNameCommit(field.id)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') event.currentTarget.blur();
                                                    }}
                                                    maxLength={ENTRY_SECTION_NAME_MAX_LENGTH}
                                                    className="w-full min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                                                />
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setNumericDeleteCandidate(field)}
                                            className="flex h-10 w-full items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 transition-colors hover:bg-red-500/20 sm:w-10"
                                            title="Remove numeric input"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                            <div className="min-w-0">
                                <label className="text-xs font-bold uppercase tracking-widest text-text-muted">
                                    New numerical input
                                </label>
                                <input
                                    value={newNumericFieldName}
                                    onChange={(event) => setNewNumericFieldName(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') handleAddNumericField();
                                    }}
                                    maxLength={ENTRY_SECTION_NAME_MAX_LENGTH}
                                    placeholder="Miles run"
                                    className="mt-2 w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition-colors placeholder-white/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleAddNumericField}
                                disabled={!sanitizeEntrySectionName(newNumericFieldName) || numericFields.length >= MAX_NUMERIC_ENTRY_FIELDS || sectionsSaving}
                                className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-variant disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                <Plus className="h-4 w-4" />
                                Add
                            </button>
                        </div>
                    </div>

                    {sectionsError && (
                        <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                            {sectionsError}
                        </p>
                    )}

                    {sectionsNotice && (
                        <p className="mt-3 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm text-green-200">
                            {sectionsNotice}
                        </p>
                    )}
                </div>
            </section>

            <section className="glass-card overflow-hidden">
                <div className="border-b border-white/10 px-4 py-4 sm:px-6">
                    <h3 className="text-base font-bold text-white">Data management</h3>
                    <p className="mt-1 text-sm text-text-muted">Import, repair, and back up your journal data.</p>
                </div>

                <div className="divide-y divide-white/10">
                    {managementOptions.map((option) => {
                        const Icon = option.icon;

                        return (
                            <div
                                key={option.label}
                                className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                            >
                                <div className="flex min-w-0 items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-primary">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-white">{option.label}</h4>
                                        <p className="mt-1 text-sm leading-snug text-text-muted">{option.description}</p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 justify-start sm:justify-end">
                                    {option.control}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>

        {deleteCandidate && (
            <div className="fixed inset-0 z-[55] flex items-center justify-center p-3 sm:p-4">
                <div
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm animation-fade-in"
                    onClick={() => closeDeleteSectionModal()}
                />

                <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#18181b] shadow-2xl animation-scale-in">
                    <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-4">
                        <div className="min-w-0">
                            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                                <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
                                Remove section
                            </h3>
                            <p className="mt-1 truncate text-sm text-text-muted">{deleteCandidate.name}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => closeDeleteSectionModal()}
                            disabled={deleteProcessing}
                            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="space-y-4 p-4 sm:p-5">
                        <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-text-secondary">
                            <p className="font-bold text-white">Default: keep the writing</p>
                            <p className="mt-1 leading-relaxed">
                                Removing this section will merge each saved “{deleteCandidate.name}” value into that day’s main entry, then remove the sub-entry field.
                            </p>
                        </div>

                        <div className="grid gap-3">
                            <label className={`cursor-pointer rounded-lg border p-3 transition-colors ${deleteMode === 'merge' ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                                <span className="flex items-start gap-3">
                                    <input
                                        type="radio"
                                        name="delete-section-mode"
                                        checked={deleteMode === 'merge'}
                                        onChange={() => {
                                            setDeleteMode('merge');
                                            setDeleteSwipeValue(0);
                                        }}
                                        disabled={deleteProcessing}
                                        className="mt-1 accent-primary"
                                    />
                                    <span>
                                        <span className="block font-bold text-white">Merge into main entry</span>
                                        <span className="mt-1 block text-sm leading-snug text-text-muted">Safest option. Saved sub-entry text becomes part of the main journal body.</span>
                                    </span>
                                </span>
                            </label>

                            <label className={`cursor-pointer rounded-lg border p-3 transition-colors ${deleteMode === 'delete' ? 'border-red-500/50 bg-red-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                                <span className="flex items-start gap-3">
                                    <input
                                        type="radio"
                                        name="delete-section-mode"
                                        checked={deleteMode === 'delete'}
                                        onChange={() => {
                                            setDeleteMode('delete');
                                            setDeleteSwipeValue(0);
                                        }}
                                        disabled={deleteProcessing}
                                        className="mt-1 accent-red-500"
                                    />
                                    <span>
                                        <span className="block font-bold text-red-200">True delete saved sub-entry data</span>
                                        <span className="mt-1 block text-sm leading-snug text-text-muted">Dangerous. This removes this sub-entry field from every entry document.</span>
                                    </span>
                                </span>
                            </label>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-widest text-text-muted">
                                <span>Swipe to confirm</span>
                                <span>{deleteSwipeValue}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={deleteSwipeValue}
                                onChange={handleDeleteSwipeChange}
                                disabled={deleteProcessing}
                                className="confirm-slider w-full disabled:opacity-50"
                                style={{ '--confirm-progress': `${deleteSwipeValue}%` }}
                            />
                            <p className="mt-2 text-xs leading-relaxed text-text-muted">
                                Slide all the way right to remove this section.
                            </p>
                        </div>

                        {deleteProgressMessage && (
                            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>{deleteProgressMessage}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        <ConfirmModal
            isOpen={trueDeleteConfirmOpen}
            onClose={() => {
                setTrueDeleteConfirmOpen(false);
                setDeleteSwipeValue(0);
            }}
            onConfirm={() => executeDeleteEntrySection('delete')}
            title="Permanently delete sub-entry data?"
            message={`This will remove all saved “${deleteCandidate?.name || 'sub-entry'}” values from every entry document. This cannot be undone unless you restore from backup.`}
            confirmText="Delete all saved values"
            cancelText="Keep data"
            isDangerous={true}
        />

        {numericDeleteCandidate && (
            <div className="fixed inset-0 z-[55] flex items-center justify-center p-3 sm:p-4">
                <div
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm animation-fade-in"
                    onClick={() => {
                        if (!numericDeleteProcessing) setNumericDeleteCandidate(null);
                    }}
                />

                <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#18181b] shadow-2xl animation-scale-in">
                    <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-4">
                        <div className="min-w-0">
                            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                                <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
                                Remove numerical input
                            </h3>
                            <p className="mt-1 truncate text-sm text-text-muted">{numericDeleteCandidate.name}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setNumericDeleteCandidate(null)}
                            disabled={numericDeleteProcessing}
                            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="space-y-4 p-4 sm:p-5">
                        <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-text-secondary">
                            <p className="font-bold text-white">Saved values will be kept.</p>
                            <p className="mt-1 leading-relaxed">
                                Removing this input will merge each saved “{numericDeleteCandidate.name}” value into that day’s main entry, then remove the numeric field.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col-reverse gap-3 border-t border-white/10 bg-black/20 p-4 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={() => setNumericDeleteCandidate(null)}
                            disabled={numericDeleteProcessing}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-white/10 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmRemoveNumericField}
                            disabled={numericDeleteProcessing}
                            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-variant disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {numericDeleteProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                            Remove and Merge Values
                        </button>
                    </div>
                </div>
            </div>
        )}

        {customTitleCandidate && (
            <div className="fixed inset-0 z-[55] flex items-center justify-center p-3 sm:p-4">
                <div
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm animation-fade-in"
                    onClick={closeCustomTitleModal}
                />

                <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#18181b] shadow-2xl animation-scale-in">
                    <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-4">
                        <div className="min-w-0">
                            <h3 className="text-lg font-bold text-white">Disable custom titles?</h3>
                            <p className="mt-1 truncate text-sm text-text-muted">{customTitleCandidate.name}</p>
                        </div>
                        <button
                            type="button"
                            onClick={closeCustomTitleModal}
                            disabled={customTitleProcessing}
                            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="space-y-4 p-4 sm:p-5">
                        <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-text-secondary">
                            <p className="font-bold text-white">Saved title text needs somewhere to go.</p>
                            <p className="mt-1 leading-relaxed">
                                If this field is hidden, existing title values will no longer be editable as titles.
                            </p>
                        </div>

                        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
                            <input
                                type="checkbox"
                                checked={customTitleMergeEnabled}
                                onChange={(event) => setCustomTitleMergeEnabled(event.target.checked)}
                                disabled={customTitleProcessing}
                                className="mt-1 accent-primary"
                            />
                            <span>
                                <span className="block font-bold text-white">Merge saved titles into section content</span>
                                <span className="mt-1 block text-sm leading-snug text-text-muted">
                                    Recommended. Each saved title is prepended to its sub-entry content before the title field is removed.
                                </span>
                            </span>
                        </label>
                    </div>

                    <div className="flex flex-col-reverse gap-3 border-t border-white/10 bg-black/20 p-4 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={closeCustomTitleModal}
                            disabled={customTitleProcessing}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-white/10 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmDisableCustomTitle}
                            disabled={customTitleProcessing}
                            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-variant disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {customTitleProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                            Disable Custom Title
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
