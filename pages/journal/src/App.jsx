import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { BackupProvider } from './context/BackupContext';
import Login from './components/Login';
import Layout from './components/Layout';
// Placeholders for now, will create next
import CalendarView from './components/CalendarView';
import MonthView from './components/MonthView';
import EntryEditor from './components/EntryEditor';
import StatsView from './components/StatsView';
import PdfExportView from './components/PdfExportView';
import ImageView from './components/ImageView';
import MemoriesView from './components/MemoriesView';

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
              <Route path="/month" element={<MonthView />} />
              <Route path="/images" element={<ImageView />} />
              <Route path="/stats" element={<StatsView />} />
              <Route path="/memories" element={<MemoriesView />} />
              <Route path="/pdf-export" element={<PdfExportView />} />
            </Route>
          </Routes>
        </BackupProvider>
      </div>
    </ToastProvider>
  );
}

export default App;
