import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ActivityPage from './pages/ActivityPage';
import CatalogListPage from './pages/catalog/CatalogListPage';
import BookFormPage from './pages/catalog/BookFormPage';
import BookDetailPage from './pages/catalog/BookDetailPage';
import MembersPage from './pages/members/MembersPage';
import MemberDetailPage from './pages/members/MemberDetailPage';
import CirculationPage from './pages/circulation/CirculationPage';
import LoansPage from './pages/LoansPage';
import FinesPage from './pages/FinesPage';
import ReportsPage from './pages/reports/ReportsPage';
import StockVerificationPage from './pages/reports/StockVerificationPage';
import SettingsPage from './pages/SettingsPage';
import OpacPage from './pages/opac/OpacPage';
import MyAccountPage from './pages/opac/MyAccountPage';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  }
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  if (user.role === 'member') {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/opac" element={<OpacPage />} />
          <Route path="/my-account" element={<MyAccountPage />} />
          <Route path="*" element={<Navigate to="/opac" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/catalog" element={<CatalogListPage />} />
        <Route path="/catalog/new" element={<BookFormPage />} />
        <Route path="/catalog/:id" element={<BookDetailPage />} />
        <Route path="/catalog/:id/edit" element={<BookFormPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/members/:id" element={<MemberDetailPage />} />
        <Route path="/circulation" element={<CirculationPage />} />
        <Route path="/loans" element={<LoansPage />} />
        <Route path="/fines" element={<FinesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/stock" element={<StockVerificationPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/opac" element={<OpacPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
