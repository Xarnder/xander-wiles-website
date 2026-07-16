import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { BookOpen } from 'lucide-react';

const AuthContext = createContext();
const ALLOWED_EMAILS = ['xanderwiles@gmail.com'];

function isAuthorized(user) {
    const email = user?.email || '';
    return email.endsWith('@xanderwiles.com') || ALLOWED_EMAILS.includes(email);
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
            await signOut(auth);
            const message = 'Access is restricted to authorized accounts.';
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
                setAuthError('Access is restricted to authorized accounts.');
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
