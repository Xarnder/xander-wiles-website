import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import {
    BACKUP_REMINDER_SETTINGS_DOC,
    normalizeBackupReminderSettings,
    shouldShowBackupReminder
} from '../utils/backupReminder';

const defaultBackupContext = {
    isBackupOpen: false,
    backupMessage: null,
    backupReminderSettings: normalizeBackupReminderSettings(),
    openBackup: () => {},
    openBackupReminder: async () => false,
    updateBackupReminderSettings: async () => {},
    closeBackup: () => {}
};

const BackupContext = createContext(defaultBackupContext);

export function useBackup() {
    return useContext(BackupContext) || defaultBackupContext;
}

export function BackupProvider({ children }) {
    const { currentUser } = useAuth();
    const [isBackupOpen, setIsBackupOpen] = useState(false);
    const [backupMessage, setBackupMessage] = useState(null);
    const [backupReminderSettings, setBackupReminderSettings] = useState(normalizeBackupReminderSettings());

    useEffect(() => {
        if (!currentUser) return undefined;

        const settingsRef = doc(db, 'users', currentUser.uid, 'settings', BACKUP_REMINDER_SETTINGS_DOC);
        const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
            setBackupReminderSettings(normalizeBackupReminderSettings(snapshot.data()));
        }, (error) => {
            console.error('Failed to load backup reminder settings:', error);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const openBackup = (message = null) => {
        setBackupMessage(message);
        setIsBackupOpen(true);
    };

    const updateBackupReminderSettings = async (updates) => {
        if (!currentUser) return;

        const nextSettings = normalizeBackupReminderSettings({
            ...backupReminderSettings,
            ...updates
        });

        setBackupReminderSettings(nextSettings);

        const settingsRef = doc(db, 'users', currentUser.uid, 'settings', BACKUP_REMINDER_SETTINGS_DOC);
        await setDoc(settingsRef, {
            ...nextSettings,
            updatedAt: serverTimestamp()
        }, { merge: true });
    };

    const openBackupReminder = async (message = null) => {
        if (!currentUser || !shouldShowBackupReminder(backupReminderSettings)) return false;

        const nowIso = new Date().toISOString();
        openBackup(message);
        await updateBackupReminderSettings({ lastReminderAtClient: nowIso });
        return true;
    };

    const closeBackup = () => {
        setIsBackupOpen(false);
        setBackupMessage(null);
    };

    const value = {
        isBackupOpen,
        backupMessage,
        backupReminderSettings,
        openBackup,
        openBackupReminder,
        updateBackupReminderSettings,
        closeBackup
    };

    return (
        <BackupContext.Provider value={value}>
            {children}
        </BackupContext.Provider>
    );
}
