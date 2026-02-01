import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
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
  return (
    <ToastProvider>
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
    </ToastProvider>
  );
}

export default App;
