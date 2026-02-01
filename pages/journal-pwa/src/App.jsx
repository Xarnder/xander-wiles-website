import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { BackupProvider } from './context/BackupContext';
import Login from './components/Login';
import Layout from './components/Layout';
// Placeholders for now, will create next
import CalendarView from './components/CalendarView';
import EntryEditor from './components/EntryEditor';

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
}

function App() {
  console.log("App component rendering");
  return (
    <ToastProvider>
      <div className="text-text font-body">
        <BackupProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }>
              <Route path="/" element={<CalendarView />}>
                <Route path="entry/:date" element={<EntryEditor />} />
              </Route>
            </Route>
          </Routes>
        </BackupProvider>
      </div>
    </ToastProvider>
  );
}

export default App;
