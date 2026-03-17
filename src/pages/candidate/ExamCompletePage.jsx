import { useNavigate } from 'react-router-dom';
import { useExam } from '../../contexts/ExamContext';
import { useEffect } from 'react';

export default function ExamCompletePage() {
  const { candidate, resetExam } = useExam();
  const navigate = useNavigate();

  useEffect(() => {
    if (!candidate) navigate('/');
  }, []);

  const handleReturn = () => {
    resetExam();
    const lockOverlay = document.getElementById('lock-overlay');
    if (lockOverlay) lockOverlay.style.display = 'none';
    navigate('/');
  };

  const isDisqualified = candidate?.status === 'disqualified';

  return (
    <div className="container" id="exam-complete-view">
      {isDisqualified ? (
        <div id="disqualification-view" style={{ display: 'block' }}>
          <div className="exam-complete-container">
            <i className="fas fa-exclamation-triangle" style={{ color: 'var(--danger)' }}></i>
            <h1>You have been Disqualified</h1>
            <p style={{ marginTop: 10, color: 'var(--gray)' }}>
              {candidate?.disqualificationReason || 'You were disqualified due to proctoring violations.'}
            </p>
            <button className="btn btn-primary" id="disqualified-home-btn" style={{ marginTop: 25 }} onClick={handleReturn}>
              Return to Home
            </button>
          </div>
        </div>
      ) : (
        <div id="successful-completion-view" style={{ display: 'block' }}>
          <div className="exam-complete-container">
            <i className="fas fa-check-circle" style={{ color: 'var(--success)' }}></i>
            <h1 id="completion-title">Thank You!</h1>
            <p>Thank you for giving the examination, our team will contact you.</p>
            <button className="btn btn-primary" id="exam-complete-btn" style={{ marginTop: 25 }} onClick={handleReturn}>
              Return to Home
            </button>
          </div>
        </div>
      )}
      <div className="lock-overlay" id="lock-overlay"></div>
    </div>
  );
}
