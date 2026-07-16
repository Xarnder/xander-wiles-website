import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function Login() {
    const { login, authError, clearAuthError } = useAuth();
    const [error, setError] = useState('');
    const [isSigningIn, setIsSigningIn] = useState(false);
    const navigate = useNavigate();

    async function handleLogin() {
        try {
            setError('');
            clearAuthError();
            setIsSigningIn(true);
            await login();
            navigate('/');
        } catch (err) {
            setError(err.message || 'Failed to sign in. Please try again.');
        } finally {
            setIsSigningIn(false);
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-bg text-text">
            <div className="p-8 rounded-lg bg-surface shadow-lg max-w-sm w-full border border-border text-center">
                <h2 className="text-3xl font-serif text-primary mb-6">Journal Login</h2>
                {(error || authError) && <div role="alert" className="bg-red-500/15 text-red-400 border border-red-500/20 p-3 rounded mb-4 text-sm">{error || authError}</div>}

                <button
                    type="button"
                    onClick={handleLogin}
                    disabled={isSigningIn}
                    aria-busy={isSigningIn}
                    className="w-full bg-primary hover:bg-primary-variant text-white font-bold py-3 px-4 rounded transition duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                >
                    {isSigningIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
                    </svg>}
                    {isSigningIn ? 'Signing in…' : 'Sign In with Google'}
                </button>
                <p className="mt-6 text-text-muted text-sm">
                    Strictly private. Authorized users only.
                </p>
            </div>
        </div>
    );
}
