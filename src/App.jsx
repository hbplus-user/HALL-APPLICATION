import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ExamProvider } from './contexts/ExamContext';
import { ProctorProvider } from './contexts/ProctorContext';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import PhotoCapturePage from './pages/candidate/PhotoCapturePage';
import InstructionsPage from './pages/candidate/InstructionsPage';
import ExamPage from './pages/candidate/ExamPage';
import ExamCompletePage from './pages/candidate/ExamCompletePage';
import NotificationSystem from './components/common/NotificationSystem';
import LoadingOverlay from './components/common/LoadingOverlay';

const ProtectedAdminRoute = ({ children }) => {
  const { currentAdmin } = useAuth();
  return currentAdmin ? children : <Navigate to="/" replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <ExamProvider>
        <ProctorProvider>
          <NotificationSystem />
          <LoadingOverlay />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/admin" element={
                <ProtectedAdminRoute>
                  <AdminDashboard />
                </ProtectedAdminRoute>
              } />
              <Route path="/exam/photo" element={<PhotoCapturePage />} />
              <Route path="/exam/instructions" element={<InstructionsPage />} />
              <Route path="/exam" element={<ExamPage />} />
              <Route path="/exam/complete" element={<ExamCompletePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ProctorProvider>
      </ExamProvider>
    </AuthProvider>
  );
}
