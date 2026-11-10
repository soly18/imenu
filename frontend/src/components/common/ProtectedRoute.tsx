import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@imenu25/shared';

interface Props {
  children: React.ReactNode;
  roles?: UserRole[];
}

export default function ProtectedRoute({ children, roles }: Props) {
  const { isAuthenticated, employee } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && employee && !roles.includes(employee.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
