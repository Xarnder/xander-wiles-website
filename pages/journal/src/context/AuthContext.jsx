import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    function login() {
        return signInWithPopup(auth, googleProvider);
    }

    function logout() {
        return signOut(auth);
    }

    useEffect(() => {
        console.log("AuthProvider: useEffect triggered");
        const allowedEmails = ['xanderwiles@gmail.com'];
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            console.log("AuthProvider: onAuthStateChanged triggered", user ? "User found" : "No user");
            if (user && !user.email.endsWith('@xanderwiles.com') && !allowedEmails.includes(user.email)) {
                console.warn("Unauthorized user attempted login:", user.email);
                alert('Access restricted to authorized users only.');
                signOut(auth);
                setCurrentUser(null);
            } else {
                setCurrentUser(user);
            }
            setLoading(false);
            console.log("AuthProvider: Loading set to false");
        });

        return unsubscribe;
    }, []);

    const value = {
        currentUser,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
