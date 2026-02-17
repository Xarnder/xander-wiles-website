import React, { createContext, useContext, useState } from 'react';

const BackupContext = createContext();

export function useBackup() {
    return useContext(BackupContext);
}

export function BackupProvider({ children }) {
    const [isBackupOpen, setIsBackupOpen] = useState(false);
    const [backupMessage, setBackupMessage] = useState(null);

    const openBackup = (message = null) => {
        setBackupMessage(message);
        setIsBackupOpen(true);
    };

    const closeBackup = () => {
        setIsBackupOpen(false);
        setBackupMessage(null);
    };

    const value = {
        isBackupOpen,
        backupMessage,
        openBackup,
        closeBackup
    };

    return (
        <BackupContext.Provider value={value}>
            {children}
        </BackupContext.Provider>
    );
}
