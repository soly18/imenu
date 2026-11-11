import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useFeature } from '@/store/licenceStore';
import type { UserRole } from '@imenu25/shared';

interface Props {
  children: React.ReactNode;
  roles?: UserRole[];
  feature?: string;   // module key that the supplier can switch off
}

export default function ProtectedRoute({ children, roles, feature }: Props) {
  const featureOn = useFeature(feature || '_');
  const { isAuthenticated, employee } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && employee && !roles.includes(employee.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (feature && !featureOn) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
