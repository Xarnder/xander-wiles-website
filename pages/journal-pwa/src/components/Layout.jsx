import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { LogOut, Book, Calendar as CalendarIcon } from 'lucide-react';
import DirectoryImporter from './DirectoryImporter';
import DataRepair from './DataRepair';

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
        <div className="min-h-screen flex flex-col bg-bg text-text font-body">
            {/* Header */}
            <header className="bg-surface border-b border-border sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        {/* Logo / Title */}
                        <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
                            <Book className="h-6 w-6 text-primary mr-2" />
                            <h1 className="text-xl font-serif font-bold text-text">My Digital Journal</h1>
                        </div>

                        {/* Right Side Actions */}
                        <div className="flex items-center space-x-4">
                            <span className="text-sm text-text-muted hidden md:block">
                                {currentUser?.email}
                            </span>

                            <DirectoryImporter />

                            <DataRepair />

                            <button
                                onClick={() => navigate('/')}
                                className="p-2 rounded-full hover:bg-white/5 text-text-muted hover:text-primary transition"
                                title="Calendar"
                            >
                                <CalendarIcon className="h-5 w-5" />
                            </button>

                            <button
                                onClick={handleLogout}
                                className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-text-muted hover:text-white hover:bg-white/5 transition"
                            >
                                <LogOut className="h-4 w-4 mr-2" />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
                <Outlet />
            </main>
        </div>
    );
}
