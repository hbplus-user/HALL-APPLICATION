import { useState } from 'react';
import { createAdminAccount } from '../../services/adminService';
import { showNotification } from '../common/NotificationSystem';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminManagement() {
  const { currentAdmin } = useAuth();
  const [newEmail, setNewEmail] = useState('manager@fitproctor.com');
  const [newPassword, setNewPassword] = useState('managerpass');
  const [loading, setLoading] = useState(false);

  const handleAddAdmin = async () => {
    if (!newEmail || !newPassword) {
      showNotification('Email and password required.', 'error');
      return;
    }
    setLoading(true);
    try {
      await createAdminAccount(newEmail, newPassword);
      showNotification(`Admin account created for ${newEmail}!`, 'success');
      setNewEmail('');
      setNewPassword('');
    } catch (err) {
      showNotification(`Error: ${err.code || err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3 className="section-title">Admin Accounts</h3>
      <div className="form-group">
        <label htmlFor="new-admin-email">New Admin Email</label>
        <input type="email" id="new-admin-email" className="form-control" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Enter admin email" />
      </div>
      <div className="form-group">
        <label htmlFor="new-admin-password">Password</label>
        <input type="password" id="new-admin-password" className="form-control" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter password" />
      </div>
      <button className="btn btn-primary" id="add-admin-btn" onClick={handleAddAdmin} disabled={loading}>
        {loading ? 'Creating...' : 'Add Admin Account'}
      </button>
      <div style={{ marginTop: 20 }}>
        <h4>Current Session</h4>
        <table className="admin-table" id="admin-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="admin-table-body">
            <tr>
              <td>{currentAdmin?.email}</td>
              <td><span className="status-badge status-completed">Active</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
