import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import LoginPage      from '@/pages/LoginPage';
import DashboardPage  from '@/pages/DashboardPage';
import PosPage        from '@/pages/PosPage';
import BackOfficePage from '@/pages/BackOfficePage';
import ReportsPage    from '@/pages/ReportsPage';
import AppLayout      from '@/components/layout/AppLayout';
import TablesPage from '@/pages/TablesPage';
import AdminPage from '@/pages/AdminPage';
import MigrationPage from '@/pages/MigrationPage';
import OrdersPage from '@/pages/OrdersPage';
import LicenceGate from '@/components/common/LicenceGate';
import ProtectedRoute from '@/components/common/ProtectedRoute';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <LicenceGate>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Routes>
                    <Route path="/dashboard"  element={<DashboardPage />} />
                    <Route path="/pos"        element={<ProtectedRoute feature="pos"><PosPage /></ProtectedRoute>} />
                    <Route path="/tables"     element={<ProtectedRoute feature="tables"><TablesPage /></ProtectedRoute>} />
                    <Route path="/orders"     element={<ProtectedRoute feature="orders"><OrdersPage /></ProtectedRoute>} />
                    <Route path="/reports"    element={
                      <ProtectedRoute feature="reports" roles={['admin', 'manager', 'cashier']}><ReportsPage /></ProtectedRoute>
                    } />
                    <Route path="/admin"      element={
                      <ProtectedRoute feature="admin" roles={['admin']}><AdminPage /></ProtectedRoute>
                    } />
                    <Route path="/migration"  element={
                      <ProtectedRoute feature="migration" roles={['admin']}><MigrationPage /></ProtectedRoute>
                    } />
                    <Route path="/backoffice" element={<ProtectedRoute feature="backoffice"><BackOfficePage /></ProtectedRoute>} />
                    <Route path="*"           element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </AppLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      </LicenceGate>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
