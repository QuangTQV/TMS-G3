import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { Layout } from './Layout';

export function ProtectedRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}
