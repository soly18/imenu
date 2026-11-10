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
import OrdersPage from '@/pages/OrdersPage';
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
                    <Route path="/pos"        element={<PosPage />} />
                    <Route path="/tables"     element={<TablesPage />} />
                    <Route path="/orders"     element={<OrdersPage />} />
                    <Route path="/reports"    element={
                      <ProtectedRoute roles={['admin', 'manager']}><ReportsPage /></ProtectedRoute>
                    } />
                    <Route path="/backoffice" element={<BackOfficePage />} />
                    <Route path="*"           element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </AppLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
