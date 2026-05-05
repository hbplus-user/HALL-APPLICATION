import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { subscribeToCandidates } from '../../services/candidateService';
import { showNotification } from '../../components/common/NotificationSystem';
import StatCards from '../../components/admin/StatCards';
import CandidatesTable from '../../components/admin/CandidatesTable';
import QuestionManagement from '../../components/admin/QuestionManagement';
import TokenManagement from '../../components/admin/TokenManagement';
import AdminManagement from '../../components/admin/AdminManagement';
import LiveMonitoringTab from '../../components/admin/LiveMonitoringTab';
import CandidateModal from '../../components/admin/CandidateModal';

const TABS = [
  { id: 'candidates', label: 'Candidates' },
  { id: 'live-monitoring', label: '🔴 Live Monitoring' },
  { id: 'manage-questions', label: 'Manage Questions' },
  { id: 'generate-tokens', label: 'Generate Tokens' },
  { id: 'admin-management', label: 'Admin Management' },
];

export default function AdminDashboard() {
  const { currentAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('candidates');
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  useEffect(() => {
    if (!currentAdmin) { navigate('/'); return; }
    const unsub = subscribeToCandidates(setCandidates);
    return unsub;
  }, [currentAdmin]);

  const handleLogout = async () => {
    try {
      await logout();
      showNotification('Logged out successfully', 'success');
      navigate('/');
    } catch {
      showNotification('Logout failed.', 'error');
    }
  };

  const stats = {
    total: candidates.length,
    completed: candidates.filter(c => c.status === 'completed' || c.status === 'qualified').length,
    disqualified: candidates.filter(c => c.status === 'disqualified').length,
    inProgress: candidates.filter(c => c.status === 'in-progress').length,
  };

  return (
    <div className="container" id="admin-dashboard">
      <div className="card">
        <div className="card-header">
          <h2>Admin Dashboard</h2>
          <div>
            <button id="refresh-btn" className="btn btn-refresh btn-sm" onClick={() => {}}>
              <i className="fas fa-sync-alt"></i> Refresh
            </button>
            <span style={{ marginRight: 15 }}>
              <i className="fas fa-user-circle"></i>{' '}
              <span id="current-admin">{currentAdmin?.email || 'Admin User'}</span>
            </span>
            <button className="btn btn-primary btn-sm" id="admin-logout" onClick={handleLogout}>Logout</button>
          </div>
        </div>
        <div className="card-body">
          <StatCards stats={stats} />
          <div className="tabs">
            {TABS.map(tab => (
              <div
                key={tab.id}
                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                data-tab={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </div>
            ))}
          </div>

          {activeTab === 'candidates' && (
            <div className="tab-content active" id="candidates">
              <CandidatesTable
                candidates={candidates}
                onViewCandidate={setSelectedCandidate}
              />
            </div>
          )}
          {activeTab === 'live-monitoring' && (
            <div className="tab-content active" id="live-monitoring">
              <LiveMonitoringTab onViewCandidate={setSelectedCandidate} />
            </div>
          )}
          {activeTab === 'manage-questions' && (
            <div className="tab-content active" id="manage-questions">
              <QuestionManagement />
            </div>
          )}
          {activeTab === 'generate-tokens' && (
            <div className="tab-content active" id="generate-tokens">
              <TokenManagement />
            </div>
          )}
          {activeTab === 'admin-management' && (
            <div className="tab-content active" id="admin-management">
              <AdminManagement />
            </div>
          )}
        </div>
      </div>

      {selectedCandidate && (
        <CandidateModal
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          onUpdate={(updated) => setSelectedCandidate(updated)}
        />
      )}
    </div>
  );
}
