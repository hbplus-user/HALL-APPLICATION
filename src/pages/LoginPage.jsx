import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useExam } from '../contexts/ExamContext';
import { findToken, updateToken } from '../services/tokenService';
import { findCandidateByEmail, setCandidateData, updateCandidateData } from '../services/candidateService';
import { showNotification } from '../components/common/NotificationSystem';
import { showLoader, hideLoader } from '../components/common/LoadingOverlay';

export default function LoginPage() {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fadeClass, setFadeClass] = useState('');
  const { loginWithGoogle, currentAdmin, logout } = useAuth();
  const { setCandidate, resetExam } = useExam();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const magicEmail = searchParams.get('email');
    const magicToken = searchParams.get('token');

    if (magicEmail && magicToken && !isAdminMode) {
      setEmail(magicEmail);
      setPassword(magicToken);
      setTimeout(() => doLogin(magicEmail, magicToken), 300);
      return;
    }

    if (currentAdmin) {
      if (!currentAdmin.email?.endsWith('@hbplus.fit')) {
        showNotification('Access Denied: Must use an @hbplus.fit email address', 'error');
        logout();
      } else {
        navigate('/admin');
        showNotification('Admin login successful!', 'success');
      }
    }
  }, [currentAdmin, searchParams]);

  const toggleMode = (e) => {
    e.preventDefault();
    setFadeClass('view-fade-out');
    setTimeout(() => {
      setIsAdminMode(v => !v);
      setEmail(''); setPassword('');
      setFadeClass('view-fade-in');
      setTimeout(() => setFadeClass(''), 400);
    }, 400);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { showNotification('Email and token are required', 'error'); return; }
    await doLogin(email, password);
  };

  const handleGoogleLogin = async () => {
    try { await loginWithGoogle(); }
    catch (err) { showNotification(`Login Failed: ${err.message}`, 'error'); }
  };

  const doLogin = async (emailArg, tokenArg) => {
    showLoader();
    try { await handleCandidateLogin(emailArg, tokenArg); }
    finally { hideLoader(); }
  };

  const handleCandidateLogin = async (emailArg, tokenArg) => {
    const useEmail = (emailArg || email).trim().toLowerCase();
    const useToken = (tokenArg || password).trim();

    try {
      // 1. Validate token
      const token = await findToken(useEmail, useToken);
      if (!token) { showNotification('Invalid email or access token.', 'error'); return; }

      const now = new Date();

      // Allow re-entry if token used but exam still in-progress
      if (token.status === 'used') {
        const existing = await findCandidateByEmail(useEmail);
        if (existing && existing.status === 'in-progress') {
          resetExam();
          setCandidate(existing);
          navigate('/exam/instructions');
          return;
        }
        showNotification('This access token has already been used.', 'error');
        return;
      }

      if (token.status === 'expired' || (token.expiryDate && new Date(token.expiryDate) < now)) {
        await updateToken(token.id, { status: 'expired' });
        showNotification('This access token has expired.', 'error');
        return;
      }

      // 2. ALWAYS create a brand new candidate row for each valid token use.
      //    This ensures previous exam data is never overwritten and each
      //    attempt has its own record in the admin dashboard.
      const candidate = await setCandidateData(null, {
        email: useEmail,
        name: useEmail.split('@')[0],
        role: token.role || 'general',
        subRole: token.subRole || null,
        status: 'pending',
        assignedPacks: token.assignedPacks || [],
        tokenId: token.id,
      });

      if (!candidate) {
        showNotification('Failed to create candidate record. Please try again.', 'error');
        return;
      }

      // 3. Proceed to exam
      resetExam();
      setCandidate(candidate);
      navigate('/exam/photo');

    } catch (err) {
      console.error('Candidate login error:', err);
      showNotification('Login failed. Please try again.', 'error');
    }
  };

  return (
    <div className="new-login-wrapper" id="new-login-view" style={{ display: 'flex' }}>
      <div className={`new-login-container ${fadeClass}`}>
        <div className="new-login-header-container">
          <div className="new-login-header gradient-text-effect">
            {isAdminMode ? 'Admin Login' : 'Candidate Login'}
          </div>
        </div>
        <h1>HALL</h1>
        {isAdminMode ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--gray)', marginBottom: '20px', fontSize: '0.9rem' }}>
              Sign in with your @hbplus.fit Google workspace account to access the dashboard.
            </p>
            <button
              type="button"
              onClick={handleGoogleLogin}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                width: '100%', padding: '12px', background: '#fff', color: '#333',
                border: '1px solid #ccc', borderRadius: 8, fontSize: '1rem',
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              }}
            >
              <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" style={{ width: 20, height: 20 }} />
              Continue with Google
            </button>
          </div>
        ) : (
          <form id="unified-login-form" onSubmit={handleSubmit} noValidate>
            <div className="new-form-group">
              <input type="email" id="login-email" className="new-form-control" placeholder="Email Address"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="new-form-group">
              <input type="password" id="login-password" className="new-form-control" placeholder="Access Token"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" id="new-login-btn" className="new-login-btn">Start Assessment</button>
          </form>
        )}
        <div className="new-admin-link">
          {isAdminMode
            ? <>Not an admin? <a href="#" onClick={toggleMode}>Take Assessment</a></>
            : <>If you are an admin, <a href="#" onClick={toggleMode}>login here</a>.</>
          }
        </div>
      </div>
    </div>
  );
}
