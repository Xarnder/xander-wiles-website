import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { BookOpen } from 'lucide-react';

const AuthContext = createContext();

function normalizeEmail(email) {
    const trimmed = String(email || '').trim().toLowerCase();
    const at = trimmed.lastIndexOf('@');
    if (at <= 0) return trimmed;

    const local = trimmed.slice(0, at);
    const domain = trimmed.slice(at + 1);
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
        return `${local.split('+')[0].replaceAll('.', '')}@gmail.com`;
    }
    return `${local}@${domain}`;
}

const ALLOWED_EMAILS = ['xanderwiles@gmail.com', 'isobelwilesuk@gmail.com'].map(normalizeEmail);

function emailsFromUser(user) {
    return [user?.email, ...(user?.providerData || []).map((profile) => profile?.email)]
        .filter(Boolean)
        .map(normalizeEmail);
}

function isAuthorized(user) {
    const emails = emailsFromUser(user);
    return emails.some((email) => (
        email.endsWith('@xanderwiles.com') || ALLOWED_EMAILS.includes(email)
    ));
}

function restrictedMessage(user) {
    const email = user?.email || user?.providerData?.[0]?.email;
    if (!email) {
        return 'Access is restricted. This Google account did not provide an email address.';
    }
    return `Access is restricted for ${email}.`;
}

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState('');

    async function login() {
        setAuthError('');
        const result = await signInWithPopup(auth, googleProvider);
        if (!isAuthorized(result.user)) {
            const message = restrictedMessage(result.user);
            await signOut(auth);
            setAuthError(message);
            throw new Error(message);
        }
        return result;
    }

    function logout() {
        return signOut(auth);
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user && !isAuthorized(user)) {
                setAuthError(restrictedMessage(user));
                signOut(auth);
                setCurrentUser(null);
            } else {
                setCurrentUser(user);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const value = {
        currentUser,
        login,
        logout,
        authError,
        clearAuthError: () => setAuthError('')
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div className="min-h-screen bg-bg text-text flex items-center justify-center" role="status" aria-live="polite">
                    <div className="glass-card px-8 py-10 text-center">
                        <BookOpen className="w-10 h-10 mx-auto mb-4 text-primary animate-pulse" />
                        <p className="font-serif text-lg">Opening your journal…</p>
                        <span className="sr-only">Checking authentication</span>
                    </div>
                </div>
            ) : children}
        </AuthContext.Provider>
    );
}
