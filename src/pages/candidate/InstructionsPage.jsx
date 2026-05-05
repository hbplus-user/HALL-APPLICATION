import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../../contexts/ExamContext';
import { getPacksForCandidate } from '../../services/questionService';
import { showNotification } from '../../components/common/NotificationSystem';
import { showLoader, hideLoader } from '../../components/common/LoadingOverlay';

export default function InstructionsPage() {
  const { candidate, setExamQuestions, setCandidateAnswers } = useExam();
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [micStatus, setMicStatus] = useState('');
  const [micVisible, setMicVisible] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!candidate) { navigate('/'); return; }
    checkMicrophone();
  }, []);

  const checkMicrophone = async () => {
    setMicVisible(true);
    setMicStatus('Checking microphone...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicStatus('✓ Microphone detected.');
    } catch {
      setMicStatus('⚠ Microphone not found or access denied. You may continue, but speaking detection will be disabled.');
    }
  };

  const handleStartExam = async () => {
    if (!agreed) return;
    setError('');
    showLoader();
    try {
      // Load question packs
      const packs = await getPacksForCandidate(candidate);
      console.log('Candidate role:', candidate.role, '| subRole:', candidate.subRole);
      console.log('Packs returned:', packs.length, packs);

      if (!packs || packs.length === 0) {
        setError('No question pack found for your role. Please contact the administrator.');
        hideLoader();
        return;
      }

      // Flatten all questions from all packs
      const allQs = packs.flatMap(pack => {
        console.log(`Pack "${pack.fileName}" has ${pack.questions?.length || 0} questions`);
        return pack.questions || [];
      });

      console.log('Total questions across all packs:', allQs.length);

      if (allQs.length === 0) {
        setError('Question pack is empty. Please contact the administrator.');
        hideLoader();
        return;
      }
      const shuffled = [...allQs].sort(() => Math.random() - 0.5).slice(0, Math.min(30, allQs.length));
      console.log('Shuffled questions to load:', shuffled.length);
      setExamQuestions(shuffled);
      setCandidateAnswers(new Array(shuffled.length).fill(null));

      navigate('/exam');
    } catch (err) {
      console.error('Start exam error:', err);
      setError('Failed to load exam. Please try again.');
    } finally {
      hideLoader();
    }

  return (
    <div className="container" id="instruction-view">
      <div className="instruction-container">
        <div className="instruction-header">
          <h1>Exam Instructions</h1>
          <p>Please read the following instructions carefully before you begin.</p>
        </div>
        <div className="instruction-body">
          <h3>General Instructions</h3>
          <ol className="instruction-list">
            <li>The test will include 30 multiple choice questions based on the job role you have applied for. Out of four options only one answer is correct.</li>
            <li>You will have 30 minutes to complete the test. The timer will begin once you start.</li>
            <li>There is no negative marking in the assessment.</li>
            <li>The system will click pictures of yours randomly in the middle of assessment.</li>
            <li>The test must be completed within 24 Hours of receiving the assessment invite. No submissions will be accepted by the system beyond this deadline.</li>
            <li>This is an individual assessment. Do not seek external help or collaborate with others.</li>
            <li>Use of AI tools is strictly prohibited and will lead to disqualification.</li>
            <li>Once submitted, you cannot make any change and please answer carefully.</li>
          </ol>
          <h3 style={{ marginTop: 20 }}>Before You Begin</h3>
          <ol className="instruction-list">
            <li>Use a laptop for the best experience (mobile devices are not recommended).</li>
            <li>Ensure a quiet and disturbance-free environment.</li>
            <li><b>Turn off Bluetooth on your device to avoid interference and potential flagging.</b></li>
            <li>Do not refresh, close or switch your browser tab once the test has started.</li>
            <li>Make sure that your camera and microphone is working properly.</li>
            <li>A strong internet connection.</li>
          </ol>

          {micVisible && (
            <div id="mic-test-container" style={{ display: 'block', textAlign: 'center', padding: 15, background: '#f0f4ff', borderRadius: 8, marginBottom: 20, marginTop: 20, border: '1px solid var(--primary)' }}>
              <i className="fas fa-microphone-alt" style={{ fontSize: '2rem', color: 'var(--primary)' }}></i>
              <p id="mic-test-message" style={{ marginTop: 10, fontWeight: 500, color: 'var(--dark)' }}>{micStatus}</p>
            </div>
          )}

          {error && (
            <div id="pre-exam-error-container" style={{ display: 'block', color: '#721c24', backgroundColor: '#f8d7da', padding: 15, borderRadius: 8, marginBottom: 20, border: '1px solid #f5c6cb' }}>
              <p id="pre-exam-error-message" style={{ margin: 0 }}>{error}</p>
            </div>
          )}

          <div className="agreement-section">
            <input type="checkbox" id="agree-checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <label htmlFor="agree-checkbox">I have read and agree to follow all instructions</label>
          </div>
          <button
            id="start-exam-btn"
            className="start-exam-btn"
            disabled={!agreed}
            onClick={handleStartExam}
          >
            Start Exam
          </button>
        </div>
        <div className="instruction-footer">
          <p>By starting the exam, you agree to all monitoring and proctoring policies.</p>
        </div>
      </div>
    </div>
  );
}
