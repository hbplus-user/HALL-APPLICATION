import { useState, useEffect } from 'react';
import { addToken, subscribeToTokens, updateToken, deleteToken } from '../../services/tokenService';
import { getPacks } from '../../services/questionService';
import { subscribeToCandidates } from '../../services/candidateService';
import { showNotification } from '../common/NotificationSystem';
import { sendTokenEmails } from '../../services/emailService';

function generateCode(length = 8) {
  return Array.from({ length }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
}

// ── (EmailJS fully configured — banner removed) ──────────────────────────────

// ── Send Confirmation Modal ─────────────────────────────────────────────────

function SendEmailModal({ tokens, onConfirm, onClose, sending }) {
  const [selected, setSelected] = useState(new Set(tokens.map(t => t.id)));

  const toggleAll = (check) => setSelected(check ? new Set(tokens.map(t => t.id)) : new Set());
  const toggle = (id) => setSelected(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const selectedTokens = tokens.filter(t => selected.has(t.id));

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
            <i className="fas fa-paper-plane" style={{ color: '#4361ee', marginRight: 8 }} />
            Send Token Emails
          </h3>
          <button onClick={onClose} disabled={sending} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: '#6b7280' }}>×</button>
        </div>

        {/* Select all row */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox"
            checked={selected.size === tokens.length}
            onChange={e => toggleAll(e.target.checked)}
            id="select-all-emails"
          />
          <label htmlFor="select-all-emails" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            Select All ({tokens.length} emails)
          </label>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--gray)' }}>
            {selected.size} selected
          </span>
        </div>

        {/* Email list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 20px' }}>
          {tokens.map(t => (
            <label
              key={t.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                onChange={() => toggle(t.id)}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{t.email}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                  Token: <code style={{ fontWeight: 600 }}>{t.token}</code>
                  &nbsp;·&nbsp;
                  <span style={{ textTransform: 'capitalize' }}>{t.role}</span>
                </div>
              </div>
              <span className={`status-badge ${t.status === 'active' ? 'status-completed' : 'status-inprogress'}`} style={{ fontSize: '0.7rem' }}>
                {t.status}
              </span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-sm" onClick={onClose} disabled={sending}
            style={{ background: '#f3f4f6', border: 'none', color: '#374151' }}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={selected.size === 0 || sending}
            onClick={() => onConfirm(selectedTokens)}
          >
            {sending
              ? <><i className="fas fa-spinner fa-spin" /> Sending...</>
              : <><i className="fas fa-paper-plane" /> Send to {selected.size} email{selected.size !== 1 ? 's' : ''}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TokenManagement() {
  const [emails, setEmails] = useState('candidate@example.com, test@example.com');
  const [role, setRole] = useState('fitness');
  const [subRole, setSubRole] = useState('internal');
  const [expiry, setExpiry] = useState('24');
  const [tokens, setTokens] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [packs, setPacks] = useState([]);
  const [selectedPacks, setSelectedPacks] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastGenerated, setLastGenerated] = useState(null);

  // Email UI state
  const [showModal, setShowModal] = useState(false);
  const [modalTokens, setModalTokens] = useState([]);
  const [sending, setSending] = useState(false);
  // Row checkbox selection
  const [checkedIds, setCheckedIds] = useState(new Set());

  useEffect(() => {
    const unsub = subscribeToTokens(setTokens);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToCandidates(setCandidates);
    return unsub;
  }, []);

  useEffect(() => {
    getPacks().then(ps => {
      let filtered = ps;
      if (role === 'fitness') filtered = ps.filter(p => p.role === 'fitness' && p.subRole === subRole);
      else filtered = ps.filter(p => p.role === role);
      setPacks(filtered);
      setSelectedPacks([]);
    });
  }, [role, subRole]);

  const parsedEmails = emails.split(',').map(e => e.trim()).filter(e => e && e.includes('@'));

  const generateTokens = async () => {
    if (parsedEmails.length === 0) { showNotification('Enter at least one valid email.', 'error'); return; }
    const expiryMs = parseInt(expiry) * 3600000;
    const expiryDate = new Date(Date.now() + expiryMs).toISOString();
    let count = 0;
    for (const email of parsedEmails) {
      const token = generateCode();
      await addToken({
        email, token, status: 'active', role, subRole: role === 'fitness' ? subRole : null,
        expiryHours: parseInt(expiry), expiryDate, assignedPacks: selectedPacks, createdAt: new Date().toISOString()
      });
      count++;
    }
    setLastGenerated({ count, expiry });
    showNotification(`${count} tokens generated!`, 'success');
  };

  // Robust expiry resolver — handles ISO strings, Timestamp, {seconds}, number, Date
  const resolveExpiry = (ed) => {
    if (!ed) return Infinity;
    if (typeof ed === 'string') return new Date(ed).getTime();
    if (typeof ed.toMillis === 'function') return ed.toMillis();
    if (typeof ed.seconds === 'number') return ed.seconds * 1000;
    if (typeof ed === 'number') return ed;
    if (ed instanceof Date) return ed.getTime();
    return Infinity;
  };

  // Build tokenId → candidate status map (precise: only marks THIS token as used)
  const USED_STATUSES = new Set(['completed', 'qualified', 'disqualified', 'in-progress']);
  const candidateStatusByTokenId = {};
  candidates.forEach(c => {
    if (c.tokenId) {
      candidateStatusByTokenId[c.tokenId] = c.status;
    }
  });

  // Sort newest first — use 0 for missing createdAt so old tokens sort LAST
  const resolveTimestamp = (ts) => {
    if (!ts) return 0;
    if (typeof ts === 'string') return new Date(ts).getTime();
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    if (typeof ts === 'number') return ts;
    if (ts instanceof Date) return ts.getTime();
    return 0;
  };

  const now = Date.now();
  // STATUS PRIORITY: active=0, used=1, expired=2 — for sort ordering
  const STATUS_ORDER = { active: 0, used: 1, expired: 2 };

  const sorted_all = [...tokens]
    .map(t => ({
      ...t,
      effectiveStatus: (() => {
        const raw = (t.status || '').toLowerCase().trim();
        if (raw === 'used') return 'used';
        if (raw === 'expired') return 'expired';
        // Cross-ref by tokenId (precise): only mark THIS token as used
        const candStatus = candidateStatusByTokenId[t.id];
        if (candStatus && USED_STATUSES.has(candStatus)) return 'used';
        // Auto-detect expired from Firestore Timestamp
        const expiryMs = resolveExpiry(t.expiryDate);
        if (expiryMs !== Infinity && expiryMs < now) return 'expired';
        return 'active';
      })(),
    }))
    .sort((a, b) => {
      // Primary: Active first → Used → Expired
      const statusDiff = (STATUS_ORDER[a.effectiveStatus] ?? 0) - (STATUS_ORDER[b.effectiveStatus] ?? 0);
      if (statusDiff !== 0) return statusDiff;
      // Secondary: newest createdAt first within each group
      return resolveTimestamp(b.createdAt) - resolveTimestamp(a.createdAt);
    });


  const filtered = sorted_all.filter(t => {
    const statusOk = filterStatus === 'all' || t.effectiveStatus === filterStatus;
    const searchOk = !searchQuery || t.email?.includes(searchQuery) || t.token?.includes(searchQuery);
    return statusOk && searchOk;
  });

  // Checkbox helpers
  const allChecked = filtered.length > 0 && filtered.every(t => checkedIds.has(t.id));
  const someChecked = filtered.some(t => checkedIds.has(t.id));
  const toggleAll = (check) => {
    setCheckedIds(prev => {
      const s = new Set(prev);
      filtered.forEach(t => check ? s.add(t.id) : s.delete(t.id));
      return s;
    });
  };
  const toggleRow = (id) => setCheckedIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const checkedTokens = filtered.filter(t => checkedIds.has(t.id));

  // Open modal with a specific single token pre-selected
  const openSendSingle = (token) => {
    setModalTokens([token]);
    setShowModal(true);
  };

  // Open modal with all currently filtered tokens
  const openSendAll = () => {
    if (filtered.length === 0) { showNotification('No tokens to send.', 'error'); return; }
    setModalTokens(filtered);
    setShowModal(true);
  };

  const handleSendConfirm = async (selectedTokens) => {
    setSending(true);
    try {
      const { sent, failed } = await sendTokenEmails(selectedTokens);
      if (sent > 0) showNotification(`✅ ${sent} email${sent > 1 ? 's' : ''} sent successfully!`, 'success');
      if (failed.length > 0) showNotification(`❌ Failed: ${failed.join(', ')}`, 'error');
      if (sent > 0) { setShowModal(false); setCheckedIds(new Set()); }
    } catch (err) {
      showNotification(`Email error: ${err.message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  // Send directly from checked rows (no intermediate modal needed)
  const handleSendChecked = () => {
    if (checkedTokens.length === 0) { showNotification('Select at least one email.', 'error'); return; }
    setModalTokens(checkedTokens);
    setShowModal(true);
  };

  // Delete a token permanently from Firebase
  const handleDelete = async (t) => {
    if (!window.confirm(`Delete token for ${t.email}?\nThis cannot be undone.`)) return;
    const ok = await deleteToken(t.id);
    if (ok) {
      setCheckedIds(prev => { const s = new Set(prev); s.delete(t.id); return s; });
      showNotification(`Token for ${t.email} deleted.`, 'success');
    } else {
      showNotification('Failed to delete token.', 'error');
    }
  };

  return (
    <div>
      {/* ── Token Generation Form ── */}
      <div className="form-group">
        <label htmlFor="candidate-emails">Candidate Emails (comma separated)</label>
        <textarea id="candidate-emails" className="form-control multiple-emails-input" value={emails} onChange={e => setEmails(e.target.value)} />
        <div id="email-preview" style={{ marginTop: 10, color: 'var(--gray)', fontSize: '0.85rem' }}>
          {parsedEmails.length > 0 ? `${parsedEmails.length} email(s): ${parsedEmails.join(', ')}` : 'No valid emails'}
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="token-role">Role</label>
        <select id="token-role" className="form-control" value={role} onChange={e => setRole(e.target.value)}>
          <option value="fitness">Fitness</option>
          <option value="account">Account</option>
          <option value="operation">Operation</option>
          <option value="marketing">Marketing</option>
        </select>
      </div>
      {role === 'fitness' && (
        <div className="form-group" id="token-fitness-type-group">
          <label htmlFor="token-fitness-type">Fitness Type</label>
          <select id="token-fitness-type" className="form-control" value={subRole} onChange={e => setSubRole(e.target.value)}>
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </select>
        </div>
      )}
      <div className="form-group" id="token-question-pack-group">
        <label>Select Question Pack(s)</label>
        <div id="assignable-packs-container" className="assignable-packs-container">
          {packs.length === 0
            ? <p className="packs-placeholder">No packs found for this role.</p>
            : packs.map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input type="checkbox" checked={selectedPacks.includes(p.id)}
                  onChange={e => setSelectedPacks(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))} />
                {p.fileName} ({p.questions?.length || 0} questions)
              </label>
            ))
          }
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="token-expiry">Expiry Time</label>
        <select id="token-expiry" className="form-control" value={expiry} onChange={e => setExpiry(e.target.value)}>
          <option value="24">24 Hours</option>
          <option value="48">48 Hours</option>
          <option value="168">7 Days</option>
        </select>
      </div>
      <button className="btn btn-primary" id="generate-token-btn" onClick={generateTokens}>Generate Tokens</button>
      <div className="token-note mt-4">
        <i className="fas fa-info-circle"></i> Tokens are stored in Firebase Firestore and will work across all devices and browsers.
      </div>
      {lastGenerated && (
        <div className="token-card" id="token-display" style={{ display: 'block' }}>
          <p>Tokens Generated Successfully</p>
          <h3 id="token-value">{lastGenerated.count} Token{lastGenerated.count > 1 ? 's' : ''} Created</h3>
          <div className="token-info">
            <div><i className="fas fa-envelope"></i> <span id="token-count">{lastGenerated.count} email{lastGenerated.count > 1 ? 's' : ''}</span></div>
            <div><i className="fas fa-clock"></i> Expires in <span id="token-expiry-display">{lastGenerated.expiry} hours</span></div>
          </div>
        </div>
      )}

      {/* ── Generated Tokens Table ── */}
      <div className="section-title" style={{ marginTop: 20 }}>
        <h3>Generated Tokens</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="search" id="search-tokens" className="form-control" placeholder="Search by email or token..."
            style={{ display: 'inline-block', width: 'auto' }} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          <select id="filter-tokens-status" className="form-control" style={{ display: 'inline-block', width: 'auto' }}
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="active">🟢 Active</option>
            <option value="used">🟠 Used</option>
            <option value="expired">🔴 Expired</option>
          </select>
          {/* Send to checked rows */}
          <button
            className="btn btn-sm btn-primary"
            onClick={handleSendChecked}
            disabled={checkedTokens.length === 0 || sending}
            title={checkedTokens.length === 0 ? 'Select rows below first' : `Send to ${checkedTokens.length} selected`}
            style={{ whiteSpace: 'nowrap', opacity: checkedTokens.length === 0 ? 0.5 : 1 }}
          >
            <i className="fas fa-paper-plane" style={{ marginRight: 5 }} />
            {sending ? 'Sending...' : `Send Emails${checkedTokens.length > 0 ? ` (${checkedTokens.length})` : ''}`}
          </button>
        </div>
      </div>

      <div className="token-list" id="token-list">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', background: '#f8fafc' }}>
              <th style={{ padding: '10px 8px', width: 36 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                  onChange={e => toggleAll(e.target.checked)}
                  title="Select all visible rows"
                />
              </th>
              <th style={{ padding: 10, textAlign: 'left' }}>Email</th>
              <th style={{ padding: 10, textAlign: 'left' }}>Token</th>
              <th style={{ padding: 10, textAlign: 'left' }}>Status</th>
              <th style={{ padding: 10, textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody id="tokens-table-body">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: 20, textAlign: 'center', color: 'var(--gray)' }}>
                  No tokens found.
                </td>
              </tr>
            ) : filtered.map(t => {
              const st = t.effectiveStatus;
              const statusStyle = {
                active:  { bg: '#dcfce7', color: '#15803d', label: '● Active'  },
                used:    { bg: '#fef3c7', color: '#b45309', label: '● Used'    },
                expired: { bg: '#fee2e2', color: '#dc2626', label: '● Expired' },
              }[st] || { bg: '#f3f4f6', color: '#6b7280', label: st || 'active' };

              return (
                <tr key={t.id} style={{
                  borderBottom: '1px solid var(--border)',
                  background: checkedIds.has(t.id) ? '#eff6ff' : 'transparent',
                  transition: 'background 0.15s',
                }}>
                  <td style={{ padding: '10px 8px' }}>
                    <input
                      type="checkbox"
                      checked={checkedIds.has(t.id)}
                      onChange={() => toggleRow(t.id)}
                    />
                  </td>
                  <td style={{ padding: 10 }}>{t.email}</td>
                  <td style={{ padding: 10, fontFamily: 'monospace', fontWeight: 600 }}>{t.token}</td>
                  <td style={{ padding: 10 }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 12,
                      fontSize: '0.75rem', fontWeight: 700,
                      background: statusStyle.bg, color: statusStyle.color,
                    }}>
                      {statusStyle.label}
                    </span>
                  </td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="btn btn-sm copy-btn" title="Copy token"
                        onClick={() => { navigator.clipboard.writeText(t.token); showNotification('Token copied!', 'success'); }}>
                        <i className="fas fa-copy" />
                      </button>
                      <button
                        className="btn btn-sm"
                        title={`Send email to ${t.email}`}
                        style={{ background: '#4361ee', color: '#fff', border: 'none' }}
                        onClick={() => { setModalTokens([t]); setCheckedIds(new Set([t.id])); setShowModal(true); }}
                      >
                        <i className="fas fa-envelope" />
                      </button>
                      {/* Delete token from Firebase */}
                      <button
                        className="btn btn-sm"
                        title={`Delete token for ${t.email}`}
                        style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                        onClick={() => handleDelete(t)}
                      >
                        <i className="fas fa-trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 30, textAlign: 'center', color: 'var(--gray)' }}>
                  No tokens found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Send Email Modal ── */}
      {showModal && (
        <SendEmailModal
          tokens={modalTokens}
          sending={sending}
          onConfirm={handleSendConfirm}
          onClose={() => !sending && setShowModal(false)}
        />
      )}
    </div>
  );
}
