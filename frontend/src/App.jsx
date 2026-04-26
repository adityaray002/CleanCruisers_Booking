import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import InstallPWA from './components/InstallPWA';

// Public pages
import Home from './pages/Home';
import BookingPage from './pages/BookingPage';
import ConfirmationPage from './pages/ConfirmationPage';
import LoginPage from './pages/LoginPage';

// Admin pages
import Dashboard from './pages/admin/Dashboard';
import BookingManagement from './pages/admin/BookingManagement';
import StaffManagement from './pages/admin/StaffManagement';
import ServiceManagement from './pages/admin/ServiceManagement';
import NewBooking from './pages/admin/NewBooking';
import ScheduleView from './pages/admin/ScheduleView';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/book" element={<BookingPage />} />
        <Route path="/confirmation/:bookingId" element={<ConfirmationPage />} />
        <Route path="/admin/login" element={<LoginPage />} />

        {/* Protected admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/bookings"
          element={
            <ProtectedRoute>
              <BookingManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/staff"
          element={
            <ProtectedRoute>
              <StaffManagement />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/new-booking"
          element={<ProtectedRoute><NewBooking /></ProtectedRoute>}
        />
        <Route
          path="/admin/schedule"
          element={<ProtectedRoute><ScheduleView /></ProtectedRoute>}
        />
        <Route
          path="/admin/services"
          element={
            <ProtectedRoute>
              <ServiceManagement />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* PWA install prompt — shows on Android automatically, shows guide on iOS */}
      <InstallPWA />
    </AuthProvider>
  );
}
