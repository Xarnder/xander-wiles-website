import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { LogOut, Book, Calendar as CalendarIcon } from 'lucide-react';
import DirectoryImporter from './DirectoryImporter';
import DataRepair from './DataRepair';
import BackupOptions from './BackupOptions';

export default function Layout() {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();

    async function handleLogout() {
        try {
            await logout();
            navigate('/login');
        } catch {
            console.error('Failed to log out');
        }
    }

    return (
        <div className="min-h-screen flex flex-col font-body text-text">
            {/* Glass Header */}
            <header className="sticky top-0 z-50 px-4 pt-4 pb-2">
                <div className="glass-card max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center transition-all duration-300">
                    {/* Logo / Title */}
                    <div className="flex items-center cursor-pointer group" onClick={() => navigate('/')}>
                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors mr-3">
                            <Book className="h-6 w-6 text-primary" />
                        </div>
                        <h1 className="hidden sm:block text-xl font-serif font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                            Digital Journal
                        </h1>
                    </div>

                    {/* Right Side Actions */}
                    <div className="flex items-center space-x-3">
                        <span className="text-sm text-text-muted hidden md:block border-r border-white/10 pr-4 mr-1">
                            {currentUser?.email}
                        </span>

                        <div className="flex items-center gap-2">
                            <DirectoryImporter />
                            <DataRepair />
                            <BackupOptions />
                        </div>

                        <button
                            onClick={() => navigate('/')}
                            className="hidden sm:block p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-primary transition-all duration-200"
                            title="Calendar"
                        >
                            <CalendarIcon className="h-5 w-5" />
                        </button>

                        <button
                            onClick={handleLogout}
                            className="flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all duration-200"
                        >
                            <LogOut className="h-4 w-4 mr-2" />
                            <span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animation-fade-in">
                <Outlet />
            </main>
        </div>
    );
}
