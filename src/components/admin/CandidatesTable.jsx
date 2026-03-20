import { useState, useEffect } from 'react';
import { deleteCandidates } from '../../services/candidateService';
import { subscribeToTokens } from '../../services/tokenService';
import { sendTokenEmail } from '../../services/emailService';
import { showNotification } from '../common/NotificationSystem';

export default function CandidatesTable({ candidates, onViewCandidate }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [selectAll, setSelectAll] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [sendingEmail, setSendingEmail] = useState(null); // candidateId being emailed

  useEffect(() => subscribeToTokens(setTokens), []);

  const roles = [...new Set(candidates.map(c => c.role).filter(Boolean))];

  const filtered = candidates.filter(c => {
    const statusOk = filterStatus === 'all' || c.status === filterStatus;
    const roleOk = filterRole === 'all' || c.role === filterRole;
    return statusOk && roleOk;
  });

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSelectAll = (e) => {
    setSelectAll(e.target.checked);
    setSelectedIds(e.target.checked ? filtered.map(c => c.id) : []);
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} candidates?`)) return;
    await deleteCandidates(selectedIds);
    setSelectedIds([]);
    setSelectAll(false);
    showNotification('Candidates deleted.', 'success');
    window.location.reload();
  };

  const handleResendEmail = async (candidate) => {
    // Find the most recent active token for this candidate's email
    const token = tokens
      .filter(t => t.email === candidate.email && (t.status || 'active') === 'active')
      .sort((a, b) => {
        const at = a.createdAt?.seconds || 0;
        const bt = b.createdAt?.seconds || 0;
        return bt - at;
      })[0];
    if (!token) {
      showNotification(`No active token found for ${candidate.email}`, 'error');
      return;
    }
    setSendingEmail(candidate.id);
    try {
      await sendTokenEmail({ email: token.email, token: token.token, role: token.role, expiryHours: 24 });
      showNotification(`Email resent to ${candidate.email}`, 'success');
    } catch (err) {
      showNotification('Failed to send email: ' + err.message, 'error');
    } finally {
      setSendingEmail(null);
    }
  };

  const getStatusBadge = (status) => {
    const classes = {
      completed: 'status-completed', qualified: 'status-completed',
      disqualified: 'status-disqualified', 'in-progress': 'status-inprogress',
    };
    return <span className={`status-badge ${classes[status] || ''}`}>{status}</span>;
  };

  return (
    <div className="content-grid">
      <div>
        <div className="actions-header">
          <h3 className="section-title" style={{ margin: 0, padding: 0, border: 'none' }}>All Assessments</h3>
          <div>
            <select
              id="filter-candidates-role"
              className="form-control"
              style={{ display: 'inline-block', width: 'auto', verticalAlign: 'middle', marginRight: 10 }}
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
            >
              <option value="all">All Roles</option>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              id="filter-candidates-status"
              className="form-control"
              style={{ display: 'inline-block', width: 'auto', verticalAlign: 'middle', marginRight: 10 }}
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="qualified">Qualified</option>
              <option value="disqualified">Disqualified</option>
              <option value="in-progress">In Progress</option>
            </select>
            <button id="delete-selected" className="btn btn-danger btn-sm" onClick={handleDeleteSelected}>
              <i className="fas fa-trash"></i> Delete Selected
            </button>
          </div>
        </div>
        <table className="candidates-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <div className="select-all-container">
                  <input type="checkbox" id="select-all-candidates" checked={selectAll} onChange={handleSelectAll} />
                </div>
              </th>
              <th>Candidate</th>
              <th>Role</th>
              <th>Status</th>
              <th>Score</th>
              <th>Actions</th>
              <th>Email</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody id="candidates-table-body">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>No candidates found.</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id}>
                <td>
                  <input
                    type="checkbox"
                    className="candidate-checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => toggleSelect(c.id)}
                  />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img
                      src={c.photo || c.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || c.email)}&background=4361ee&color=fff&size=40`}
                      alt={c.name}
                      style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name || c.email}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{c.email}</div>
                    </div>
                  </div>
                </td>
                <td><span className={`role-badge role-${c.role}`}>{c.role}{c.subRole ? ` (${c.subRole})` : ''}</span></td>
                <td>{getStatusBadge(c.status)}</td>
                <td>{c.score !== undefined ? `${c.score}%` : '—'}</td>
                <td>
                  <button className="btn btn-primary btn-sm view-candidate" data-id={c.id} onClick={() => onViewCandidate(c)}>
                    View
                  </button>
                </td>
                <td>
                  <button
                    className="btn btn-sm"
                    title={`Resend exam email to ${c.email}`}
                    style={{ background: '#4361ee', color: '#fff', border: 'none' }}
                    disabled={sendingEmail === c.id}
                    onClick={() => handleResendEmail(c)}
                  >
                    {sendingEmail === c.id
                      ? <i className="fas fa-spinner fa-spin" />
                      : <i className="fas fa-envelope" />}
                  </button>
                </td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteCandidates([c.id]).then(() => { showNotification('Deleted', 'success'); window.location.reload(); })}>
                    <i className="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="section-title">Live Exams</h3>
        <div id="current-exams">
          {candidates.filter(c => c.status === 'in-progress').length === 0
            ? <p>No exams currently in progress.</p>
            : candidates.filter(c => c.status === 'in-progress').map(c => (
              <div key={c.id} className="candidate-card">
                <img src={c.photo || c.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || c.email)}&background=e74c3c&color=fff&size=40`} alt="" style={{ width: 45, height: 45, borderRadius: '50%', objectFit: 'cover' }} />
                <div className="candidate-info">
                  <h4>{c.name || c.email}</h4>
                  <p>{c.role} · Q{(c.currentQuestionIndex || 0) + 1}</p>
                  <p>Warnings: {c.warningCount || 0}</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => onViewCandidate(c)}>View</button>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
