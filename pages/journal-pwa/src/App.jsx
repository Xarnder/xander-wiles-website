import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
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
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={
        <PrivateRoute>
          <Layout />
        </PrivateRoute>
      }>
        <Route index element={<CalendarView />} />
        <Route path="entry/:date" element={<EntryEditor />} />
      </Route>
    </Routes>
  );
}

export default App;
