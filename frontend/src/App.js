import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from './context/ToastProvider';
import { AuthProvider, useAuth } from './context/AuthProvider';
import AppShell from './components/layout/AppShell';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import ForgotPassword from './pages/auth/ForgotPassword';
import Dashboard from './pages/dashboard/Dashboard';
import ProjectWorkspace from './pages/project/ProjectWorkspace';

function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function GuestOnly() {
  const { user } = useAuth();
  return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route element={<GuestOnly />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/projects/:projectId" element={<ProjectWorkspace />} />
              <Route path="/projects/:projectId/:tab" element={<ProjectWorkspace />} />
            </Route>

            {/* Addresses used by the previous version of the portal */}
            <Route path="/adduser" element={<Navigate to="/signup" replace />} />
            <Route path="/studentdashboard" element={<Navigate to="/dashboard" replace />} />
            <Route path="/groupleaderdashboard" element={<Navigate to="/dashboard" replace />} />
            <Route path="/supervisordashboard" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
