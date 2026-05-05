import { useState } from 'react';
import { updateCandidateData, setCandidateData } from '../../services/candidateService';
import { deleteObjectByPath } from '../../services/storageService';
import { showNotification } from '../common/NotificationSystem';

export default function CandidateModal({ candidate, onClose, onUpdate }) {
  const [loading, setLoading] = useState(false);

  if (!candidate) return null;

  const statusClass = {
    completed: 'status-completed', qualified: 'status-completed',
    disqualified: 'status-disqualified', 'in-progress': 'status-inprogress',
  }[candidate.status] || '';

  const score = candidate.score || 0;
  const total = candidate.examResults?.questions?.length || 0;
  const correct = total > 0 ? candidate.examResults.questions.filter((q, i) => candidate.examResults.answers?.[i] === q.correctAnswer).length : 0;
  const avatarUrl = candidate.photo || candidate.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(candidate.name || candidate.email)}&background=4361ee&color=fff&size=120`;

  const handleDecision = async (status) => {
    setLoading(true);
    await updateCandidateData(candidate.id, { status });
    onUpdate({ ...candidate, status });
    showNotification(`Candidate ${status === 'qualified' ? 'qualified' : 'disqualified'}!`, 'success');
    setLoading(false);
  };

  const handleDeleteRecording = async () => {
    if (!window.confirm('Delete this recording?')) return;
    if (candidate.recordingPath) await deleteObjectByPath(candidate.recordingPath);
    await updateCandidateData(candidate.id, { recordingUrl: null, recordingPath: null });
    onUpdate({ ...candidate, recordingUrl: null });
    showNotification('Recording deleted.', 'success');
  };

  const handleDeletePhoto = async () => {
    if (!window.confirm('Delete this photo?')) return;
    await updateCandidateData(candidate.id, { photo: null });
    onUpdate({ ...candidate, photo: null });
    showNotification('Photo deleted.', 'success');
  };

  const handleDeleteSnapshot = async (snap) => {
    if (snap.path) await deleteObjectByPath(snap.path);
    const updated = (candidate.proctoringSnapshots || []).filter(s => s.path !== snap.path);
    await setCandidateData(candidate.id, { proctoringSnapshots: updated });
    onUpdate({ ...candidate, proctoringSnapshots: updated });
    showNotification('Snapshot deleted.', 'success');
  };

  const handleSeekVideo = (time) => {
    const video = document.getElementById('modal-video-player');
    if (video) { video.currentTime = time; video.play(); }
  };

  const handleDownloadAnswers = () => {
    if (typeof window.jspdf === 'undefined') {
      showNotification('PDF library not loaded. Downloading as text...', 'warning');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Answer Sheet - ${candidate.name || candidate.email}`, 10, 20);
    doc.setFontSize(11);
    let y = 35;
    (candidate.examResults?.questions || []).forEach((q, i) => {
      const ans = candidate.examResults.answers?.[i];
      const isCorrect = ans === q.correctAnswer;
      doc.text(`${i + 1}. ${q.text}`, 10, y);
      y += 7;
      const ansText = ans != null ? q.options[ans - 1] : 'Not answered';
      doc.setTextColor(isCorrect ? '#00aa00' : '#cc0000');
      doc.text(`   Ans: ${ansText}`, 10, y);
      doc.setTextColor('#000000');
      y += 10;
      if (y > 270) { doc.addPage(); y = 20; }
    });
    doc.save(`${candidate.name || candidate.email}_answers.pdf`);
  };

  const sendAdminCommand = async (command) => {
    await updateCandidateData(candidate.id, { adminCommand: command });
    showNotification(`Command "${command}" sent.`, 'success');
  };

  const riskColor = candidate.riskScore >= 61 ? '#9F4022' : candidate.riskScore >= 31 ? '#A9674D' : '#747440';

  return (
    <div className="modal" id="candidate-modal" style={{ display: 'flex' }}>
      <div className="modal-content">
        <div className="modal-header">
          <h3 id="modal-title">Candidate: {candidate.name || candidate.email}</h3>
          <button className="close-modal" id="close-modal" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body" id="modal-body">
          {/* Candidate Header */}
          <div className="candidate-details">
            <div style={{ textAlign: 'center' }}>
              <img src={avatarUrl} className="candidate-photo" alt={candidate.name} />
              {candidate.photo && (
                <button className="btn btn-danger btn-sm" style={{ width: '100%', marginTop: 5 }} onClick={handleDeletePhoto}>
                  <i className="fas fa-trash"></i> Delete Photo
                </button>
              )}
            </div>
            <div>
              <h3>{candidate.name || 'Unknown'}</h3>
              <p>{candidate.email}</p>
              <p className={`status-badge ${statusClass}`}>{candidate.status} {candidate.score !== undefined ? `(${score}%)` : ''}</p>
              {candidate.riskScore !== undefined && (
                <p style={{ marginTop: 8 }}>
                  <strong>Risk Score: </strong>
                  <span style={{ color: riskColor, fontWeight: 700 }}>{candidate.riskScore}/100</span>
                </p>
              )}
            </div>
          </div>

          {/* Live Admin Controls (for in-progress candidates) */}
          {candidate.status === 'in-progress' && (
            <div className="exam-results mt-4">
              <h4>🎮 Admin Live Controls</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={() => sendAdminCommand('warn')}>⚠️ Send Warning</button>
                <button className="btn btn-primary btn-sm" onClick={() => sendAdminCommand('pause')}>⏸️ Pause</button>
                <button className="btn btn-primary btn-sm" onClick={() => sendAdminCommand('resume')}>▶️ Resume</button>
                <button className="btn btn-danger btn-sm" onClick={() => sendAdminCommand('force-submit')}>📤 Force Submit</button>
                <button className="btn btn-danger btn-sm" onClick={() => sendAdminCommand('disqualify')}>❌ Disqualify</button>
              </div>
              <div style={{ marginTop: 10 }}>
                <strong>Current Question:</strong> Q{(candidate.currentQuestionIndex || 0) + 1}
                {candidate.selectedAnswer && <span> – Selected: Option {candidate.selectedAnswer}</span>}
              </div>
            </div>
          )}

          {/* Recording */}
          <div className="exam-results mt-4">
            <h4>Full Exam Recording</h4>
            {candidate.recordingUrl ? (
              <>
                <video id="modal-video-player" controls width="100%" src={candidate.recordingUrl} />
                <div className="admin-actions mt-2" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button id="admin-qualify-btn" className="btn btn-success" onClick={() => handleDecision('qualified')} disabled={loading}>Qualify</button>
                  <button id="admin-disqualify-btn" className="btn btn-danger" onClick={() => handleDecision('disqualified')} disabled={loading}>Disqualify</button>
                  <button id="admin-delete-recording-btn" className="btn btn-danger" onClick={handleDeleteRecording} disabled={loading}>Delete Recording</button>
                </div>
              </>
            ) : (
              <>
                <p>No recording is available for this candidate.</p>
                {(candidate.status === 'completed' || candidate.status === 'disqualified') && (
                  <div className="admin-actions mt-2" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-success" onClick={() => handleDecision('qualified')} disabled={loading}>Qualify</button>
                    <button className="btn btn-danger" onClick={() => handleDecision('disqualified')} disabled={loading}>Disqualify</button>
                  </div>
                )}
              </>
            )}
            
            {/* Violation Timeline */}
            {candidate.warningTimestamps?.length > 0 && (
              <div className="video-timestamps-container" style={{ marginTop: 15 }}>
                <h4>Warning Timestamps</h4>
                <div className="timestamp-list">
                  {candidate.warningTimestamps.map((ts, i) => {
                    const m = Math.floor(ts.time / 60).toString().padStart(2, '0');
                    const s = (ts.time % 60).toString().padStart(2, '0');
                    return (
                      <div key={i} className="timestamp-item-container" style={{ marginBottom: 15, padding: '10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i className="fas fa-flag" style={{ color: '#ef4444' }}></i>
                          <span>{m}:{s} – {ts.reason.replace(/_/g, ' ')}</span>
                        </div>
                        {ts.videoUrl && (
                          <div style={{ marginTop: 8 }}>
                            <video src={ts.videoUrl} controls width="100%" style={{ borderRadius: 6, maxHeight: 200, background: '#000' }} />
                          </div>
                        )}
                        {!ts.videoUrl && ts.snapshotUrl && (
                          <img src={ts.snapshotUrl} alt="Violation" style={{ width: '100%', borderRadius: 6, marginTop: 5 }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Exam Results */}
          {candidate.examResults ? (
            <div className="exam-results mt-4">
              <div className="section-title" style={{ margin: 0, padding: 0, border: 'none' }}>
                <h4>Exam Results ({correct}/{total})</h4>
                <button id="download-answers-btn" className="btn btn-primary btn-sm" onClick={handleDownloadAnswers} data-id={candidate.id} style={{ marginLeft: 'auto' }}>
                  <i className="fas fa-download"></i> Download
                </button>
              </div>
              {candidate.examResults.questions?.map((q, i) => {
                const ans = candidate.examResults.answers?.[i];
                const isCorrect = ans === q.correctAnswer;
                const userAnswer = ans != null ? q.options[ans - 1] : 'Not answered';
                const correctAnswer = q.options[q.correctAnswer - 1];
                return (
                  <div key={i} className="result-item">
                    <div className="result-question">{i + 1}. {q.text}</div>
                    <div><strong>Answer:</strong> <span className={`result-answer ${isCorrect ? 'answer-correct' : 'answer-incorrect'}`}>{userAnswer}</span></div>
                    {!isCorrect && <div><strong>Correct:</strong> <span className="result-answer answer-correct">{correctAnswer}</span></div>}
                  </div>
                );
              })}
            </div>
          ) : (
            candidate.status !== 'in-progress' && (
              <div className="exam-results mt-4" style={{ padding: '20px', textAlign: 'center', background: '#fef2f2', borderRadius: 10, border: '1px solid #fee2e2' }}>
                <i className="fas fa-exclamation-circle" style={{ color: '#dc2626', fontSize: '1.5rem', marginBottom: 10 }} />
                <h4 style={{ color: '#991b1b', margin: '0 0 5px 0' }}>No Answer Data Found</h4>
                <p style={{ fontSize: '0.85rem', color: '#b91c1c', margin: 0 }}>
                  The candidate may have exited the browser before the results could sync, or the session was interrupted.
                </p>
              </div>
            )
          )}

          {/* Snapshots */}
          <div className="snapshot-container">
            <h4>Proctoring Flags &amp; Snapshots</h4>
            {!candidate.proctoringSnapshots?.length
              ? <p>No warning snapshots were recorded.</p>
              : candidate.proctoringSnapshots.map((snap, i) => (
                <div key={i} className="snapshot-item">
                  <img src={snap.url} className="snapshot-image" alt="Snapshot" />
                  <div className="snapshot-info">
                    <div className="snapshot-reason-text">{snap.reason?.replace(/_/g, ' ')}</div>
                    <div className="snapshot-time">
                      {snap.timestamp ? (typeof snap.timestamp.toDate === 'function' ? snap.timestamp.toDate().toLocaleString() : new Date(snap.timestamp).toLocaleString()) : ''}
                    </div>
                  </div>
                  <button className="btn btn-danger btn-sm delete-snapshot-btn" onClick={() => handleDeleteSnapshot(snap)}>
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}
