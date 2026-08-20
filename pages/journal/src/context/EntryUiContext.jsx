import React, { createContext, useContext, useMemo, useState } from 'react';

const EntryUiContext = createContext({
    isEditingEntry: false,
    setIsEditingEntry: () => {}
});

export function useEntryUi() {
    return useContext(EntryUiContext);
}

export function EntryUiProvider({ children }) {
    const [isEditingEntry, setIsEditingEntry] = useState(false);
    const value = useMemo(
        () => ({ isEditingEntry, setIsEditingEntry }),
        [isEditingEntry]
    );

    return (
        <EntryUiContext.Provider value={value}>
            {children}
        </EntryUiContext.Provider>
    );
}
