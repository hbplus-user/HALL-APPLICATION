import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../../contexts/ExamContext';
import { useProctor } from '../../contexts/ProctorContext';
import { subscribeToCandidate, setCandidateData, updateCandidateData } from '../../services/candidateService';
import { uploadSnapshot, uploadRecording } from '../../services/storageService';
import { updateToken } from '../../services/tokenService';
import { saveWebRTCOffer, subscribeToWebRTCAnswer, subscribeToWebRTCRequest } from '../../services/liveMonitoringService';
import { useFaceDetection } from '../../hooks/useFaceDetection';
import { useObjectDetection } from '../../hooks/useObjectDetection';
import { useAudioDetection } from '../../hooks/useAudioDetection';
import { useExamRecording } from '../../hooks/useExamRecording';
import { showNotification } from '../../components/common/NotificationSystem';
import QuestionPanel from '../../components/candidate/QuestionPanel';
import ProctorPanel from '../../components/candidate/ProctorPanel';
import WarningOverlay from '../../components/candidate/WarningOverlay';

const SNAPSHOT_INTERVAL = 30000;
const RANDOM_SNAPSHOT_MIN = 60000;
const RANDOM_SNAPSHOT_MAX = 120000;
const LIVE_SYNC_INTERVAL = 3000; // every 3s for snappier live updates

export default function ExamPage() {
  const navigate = useNavigate();
  const {
    candidate, setCandidate, examQuestions, candidateAnswers, setCandidateAnswers,
    currentQuestionIndex, setCurrentQuestionIndex, timeLeft,
    setExamInProgress, setExamStartTimeMs, sessionStartIndex,
    startTimer, stopTimer
  } = useExam();
  const {
    warnings, addWarning, addSnapshot, warningTimestamps, proctoringSnapshots,
    tabSwitches, setTabSwitches, phoneDetections, setPhoneDetections,
    speakingViolations, setSpeakingViolations,
    setDisqualified, setDisqualificationReason,
    currentActivity, activityType, MAX_WARNINGS
  } = useProctor();

  const examCameraRef = useRef(null);
  const streamRef = useRef(null);
  const examStartTimeMsRef = useRef(0);
  const warningOverlayRef = useRef(null);
  const procIntervalRef = useRef(null);
  const snapIntervalRef = useRef(null);
  const randomSnapRef = useRef(null);
  const liveSyncRef = useRef(null);
  const rtcPeerRef = useRef(null);
  const examInProgressRef = useRef(false);
  const submitCalledRef = useRef(false); // prevent double-submit

  // Always-fresh refs
  const answersRef = useRef(candidateAnswers);
  const qIndexRef = useRef(currentQuestionIndex);
  const warningsRef = useRef(warnings);
  const warnTsRef = useRef(warningTimestamps);
  const snapshotsRef = useRef(proctoringSnapshots);
  const tabRef = useRef(tabSwitches);
  const phoneRef = useRef(phoneDetections);
  const speakRef = useRef(speakingViolations);
  const timeLeftRef = useRef(timeLeft);

  useEffect(() => { answersRef.current = candidateAnswers; }, [candidateAnswers]);
  useEffect(() => { qIndexRef.current = currentQuestionIndex; }, [currentQuestionIndex]);
  useEffect(() => { warningsRef.current = warnings; }, [warnings]);
  useEffect(() => { warnTsRef.current = warningTimestamps; }, [warningTimestamps]);
  useEffect(() => { snapshotsRef.current = proctoringSnapshots; }, [proctoringSnapshots]);
  useEffect(() => { tabRef.current = tabSwitches; }, [tabSwitches]);
  useEffect(() => { phoneRef.current = phoneDetections; }, [phoneDetections]);
  useEffect(() => { speakRef.current = speakingViolations; }, [speakingViolations]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  const { initFaceDetection, detectFaces, analyzeFaceResult } = useFaceDetection();
  const { initObjectDetection, startDetection: startObjDetect, stopDetection: stopObjDetect } = useObjectDetection({
    onPhoneDetected: useCallback((cls) => {
      if (!examInProgressRef.current) return;
      setPhoneDetections(p => p + 1);
      handleWarning(`phone_detected: ${cls}`, true);
    }, [])
  });
  const { initAudio, startVisualizer, stopAudio } = useAudioDetection({
    onSpeechDetected: useCallback(() => {
      if (!examInProgressRef.current) return;
      setSpeakingViolations(v => v + 1);
    }, [])
  });
  const { startRecording, stopRecording } = useExamRecording();

  // ── Mount / unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!candidate || examQuestions.length === 0) { navigate('/'); return; }
    startExam();
    return () => cleanup();
  }, []);

  // ── Admin command subscription ───────────────────────────────────────────
  // Use refs so the callback always calls the latest function (no stale closures)
  const handleSubmitExamRef = useRef(null);
  const handleDisqualifyRef = useRef(null);
  const handleWarningRef = useRef(null);

  useEffect(() => {
    if (!candidate?.id) return;
    const unsub = subscribeToCandidate(candidate.id, (updated) => {
      const cmd = (updated.admin_command || updated.adminCommand || '').trim();
      if (!cmd) return;
      console.log('[ExamPage] admin command received:', cmd);

      // Clear the command immediately so it doesn't re-fire
      updateCandidateData(candidate.id, { adminCommand: null, admin_command: null }).catch(() => { });

      if (cmd === 'force-submit') handleSubmitExamRef.current?.('Admin forced submission');
      else if (cmd === 'disqualify') handleDisqualifyRef.current?.('Admin disqualified candidate');
      else if (cmd === 'warn') handleWarningRef.current?.('admin_warning', false);
      else if (cmd === 'pause') showNotification('⏸ Exam paused by admin', 'warning');
      else if (cmd === 'resume') showNotification('▶ Exam resumed by admin', 'success');
    });
    return unsub;
  }, [candidate?.id]);

  // ── Live sync every 3 seconds ────────────────────────────────────────────
  const startLiveSync = (candidateId) => {
    liveSyncRef.current = setInterval(async () => {
      if (!examInProgressRef.current || !candidateId) return;
      try {
        await updateCandidateData(candidateId, {
          currentQuestionIndex: qIndexRef.current,
          totalQuestions: examQuestions.length,
          selectedAnswer: answersRef.current[qIndexRef.current] ?? null,
          warningCount: warningsRef.current,
          tabSwitches: tabRef.current,
          phoneDetections: phoneRef.current,
          speakingViolations: speakRef.current,
          warningTimestamps: warnTsRef.current,
        });
      } catch (e) { console.warn('Live sync error:', e); }
    }, LIVE_SYNC_INTERVAL);
  };

  // ── Start exam ────────────────────────────────────────────────────────────
  const startExam = async () => {
    try {
      try { await document.documentElement.requestFullscreen(); } catch { }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (examCameraRef.current) examCameraRef.current.srcObject = stream;

      const fingerprint = `${navigator.userAgent}|${screen.width}|${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
      const startIso = new Date().toISOString();
      const startMs = Date.now();

      examStartTimeMsRef.current = startMs;
      examInProgressRef.current = true;
      submitCalledRef.current = false;
      setExamInProgress(true);
      setExamStartTimeMs(startMs);

      // Initial DB write — everything the live card needs
      await updateCandidateData(candidate.id, {
        status: 'in-progress',
        exam_start_time: startIso,
        deviceFingerprint: fingerprint,
        adminCommand: null,
        admin_command: null,
        warningCount: 0,
        currentQuestionIndex: 0,
        totalQuestions: examQuestions.length,
        selectedAnswer: null,
        tabSwitches: 0,
        phoneDetections: 0,
        speakingViolations: 0,
        warningTimestamps: [],
        proctoringSnapshots: [],
      });

      await updateToken(candidate.tokenId, { status: 'used' });

      await initFaceDetection();
      await initObjectDetection();

      const audioStream = new MediaStream(stream.getAudioTracks());
      await initAudio(audioStream);
      await startRecording(stream);

      procIntervalRef.current = setInterval(() => runProctoringCheck(), 500);
      snapIntervalRef.current = setInterval(() => takeSnapshot('periodic'), SNAPSHOT_INTERVAL);
      scheduleRandomSnapshot();
      startLiveSync(candidate.id);

      if (examCameraRef.current) startObjDetect(examCameraRef.current);
      startTimer(() => handleSubmitExam('Time expired'));

      // Take an immediate snapshot so live card shows something right away
      setTimeout(() => takeSnapshot('exam_start'), 2500);

      setupWebRTC(stream);

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('blur', handleWindowBlur);
      document.body.addEventListener('mouseleave', handleMouseLeave);
      document.body.addEventListener('mouseenter', handleMouseEnter);
      document.addEventListener('fullscreenchange', handleFullscreenChange);

    } catch (err) {
      console.error('Exam start error:', err);
      showNotification('Failed to start exam. Please check camera/microphone permissions.', 'error');
      navigate('/exam/instructions');
    }
  };

  // ── WebRTC ────────────────────────────────────────────────────────────────
  const setupWebRTC = async (stream) => {
    try {
      if (rtcPeerRef.current) rtcPeerRef.current.close();
      rtcPeerRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      });
      stream.getTracks().forEach(t => rtcPeerRef.current.addTrack(t, stream));
      const offer = await rtcPeerRef.current.createOffer();
      await rtcPeerRef.current.setLocalDescription(offer);
      await new Promise(res => {
        if (rtcPeerRef.current.iceGatheringState === 'complete') res();
        else {
          setTimeout(res, 2000);
          rtcPeerRef.current.onicegatheringstatechange = () => {
            if (rtcPeerRef.current?.iceGatheringState === 'complete') res();
          };
        }
      });
      await saveWebRTCOffer(candidate.id, {
        type: rtcPeerRef.current.localDescription.type,
        sdp: rtcPeerRef.current.localDescription.sdp,
      });
      subscribeToWebRTCAnswer(candidate.id, async ({ answer }) => {
        if (answer && rtcPeerRef.current &&
          rtcPeerRef.current.signalingState !== 'closed' &&
          !rtcPeerRef.current.remoteDescription) {
          try { await rtcPeerRef.current.setRemoteDescription(new RTCSessionDescription(answer)); }
          catch (e) { console.warn('WebRTC answer error:', e); }
        }
      });
    } catch (e) {
      console.warn('WebRTC failed (snapshot fallback active):', e);
    }
  };

  useEffect(() => {
    if (!candidate?.id) return;
    const unsub = subscribeToWebRTCRequest(candidate.id, () => {
      if (streamRef.current) setupWebRTC(streamRef.current);
    });
    return unsub;
  }, [candidate?.id]);

  // ── Proctoring ────────────────────────────────────────────────────────────
  const runProctoringCheck = () => {
    if (!examCameraRef.current || !examInProgressRef.current) return;
    const result = detectFaces(examCameraRef.current);
    if (!result) return;
    const { faceCount, isLookingAway } = analyzeFaceResult(result);
    if (faceCount === 0) handleWarning('face_not_visible', true);
    else if (faceCount > 1) handleWarning('multiple_faces_detected', true);
    else if (isLookingAway) handleWarning('looking_away', false);
  };

  const handleWarning = useCallback((reason, takeSnap = false) => {
    if (!examInProgressRef.current) return;
    addWarning(reason, examStartTimeMsRef.current, (r) => handleDisqualifyRef.current?.(r));
    if (takeSnap) takeSnapshot(reason);
    if (warningOverlayRef.current) warningOverlayRef.current.show(reason.replace(/_/g, ' '));
  }, []);

  const takeSnapshot = async (reason) => {
    if (!examCameraRef.current || !candidate) return;
    try {
      const c = document.createElement('canvas');
      c.width = examCameraRef.current.videoWidth || 320;
      c.height = examCameraRef.current.videoHeight || 240;
      c.getContext('2d').drawImage(examCameraRef.current, 0, 0);
      const dataUrl = c.toDataURL('image/jpeg', 0.7);
      const res = await uploadSnapshot(dataUrl, candidate.id, reason);
      if (res) {
        const snap = { url: res.url, path: res.path, reason, timestamp: new Date().toISOString() };
        addSnapshot(snap);
        const updated = [...(snapshotsRef.current || []), snap];
        await updateCandidateData(candidate.id, { proctoringSnapshots: updated });
      }
    } catch (e) { console.error('Snapshot error:', e); }
  };

  const scheduleRandomSnapshot = () => {
    const delay = RANDOM_SNAPSHOT_MIN + Math.random() * (RANDOM_SNAPSHOT_MAX - RANDOM_SNAPSHOT_MIN);
    randomSnapRef.current = setTimeout(() => {
      if (examInProgressRef.current) { takeSnapshot('random_check'); scheduleRandomSnapshot(); }
    }, delay);
  };

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'hidden' && examInProgressRef.current) {
      setTabSwitches(t => t + 1);
      handleWarning('tab_switch', false);
    }
  }, []);
  const handleWindowBlur = useCallback(() => {
    if (examInProgressRef.current) handleWarning('window_blur', false);
  }, []);
  const handleMouseLeave = useCallback(() => {
    if (examInProgressRef.current)
      updateCandidateData(candidate?.id, { cursorStatus: 'out' }).catch(() => { });
  }, [candidate?.id]);
  const handleMouseEnter = useCallback(() => {
    if (candidate?.id) updateCandidateData(candidate.id, { cursorStatus: 'in' }).catch(() => { });
  }, [candidate?.id]);
  const handleFullscreenChange = useCallback(() => {
    if (!document.fullscreenElement && examInProgressRef.current)
      handleWarning('fullscreen_exited', false);
  }, []);

  // ── Finalize (shared by submit + disqualify) ──────────────────────────────
  const finalizeExam = async () => {
    examInProgressRef.current = false;
    setExamInProgress(false);
    stopTimer();
    if (liveSyncRef.current) clearInterval(liveSyncRef.current);

    let recordingUrl = null, recordingPath = null;
    try {
      const blob = await stopRecording();
      if (blob && blob.size > 0) {
        const res = await uploadRecording(blob, candidate.id);
        if (res) { recordingUrl = res.url; recordingPath = res.path; }
      }
    } catch (e) { console.error('Recording upload error:', e); }

    cleanup();
    return { recordingUrl, recordingPath };
  };

  // ── Disqualify ────────────────────────────────────────────────────────────
  const handleDisqualify = async (reason) => {
    if (!examInProgressRef.current) return;
    const { recordingUrl, recordingPath } = await finalizeExam();

    setDisqualified(true);
    setDisqualificationReason(reason);

    const ans = answersRef.current;
    const score = examQuestions.length > 0
      ? Math.round(examQuestions.filter((q, i) => ans[i] === q.correctAnswer).length / examQuestions.length * 100)
      : 0;

    try {
      await updateCandidateData(candidate.id, {
        status: 'disqualified',
        disqualificationReason: reason,
        examEndTime: new Date().toISOString(),
        score,
        examResults: { questions: examQuestions, answers: ans },
        recordingUrl: recordingUrl || null,
        recordingPath: recordingPath || null,
        warningTimestamps: warnTsRef.current,
        proctoringSnapshots: snapshotsRef.current,
        warningCount: warningsRef.current,
        tabSwitches: tabRef.current,
        phoneDetections: phoneRef.current,
        speakingViolations: speakRef.current,
        totalQuestions: examQuestions.length,
      });
    } catch (e) { console.error('Disqualify DB error:', e); }

    setCandidate(prev => ({ ...prev, status: 'disqualified', disqualificationReason: reason }));
    navigate('/exam/complete');
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmitExam = async (reason = 'Candidate submitted') => {
    // Guard: prevent double-submit from timer + admin command arriving at same time
    if (!examInProgressRef.current || submitCalledRef.current) return;
    submitCalledRef.current = true;

    console.log('[ExamPage] submitting exam, reason:', reason);

    const { recordingUrl, recordingPath } = await finalizeExam();

    const ans = answersRef.current;
    const total = examQuestions.length;
    const correct = examQuestions.filter((q, i) => ans[i] === q.correctAnswer).length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;

    console.log('[ExamPage] score:', score, 'correct:', correct, 'total:', total);

    try {
      // Use updateCandidateData (simpler UPDATE) rather than setCandidateData
      // to avoid any upsert issues
      const ok = await updateCandidateData(candidate.id, {
        status: 'completed',
        score,
        examEndTime: new Date().toISOString(),
        examResults: { questions: examQuestions, answers: ans },
        recordingUrl: recordingUrl || null,
        recordingPath: recordingPath || null,
        warningTimestamps: warnTsRef.current,
        proctoringSnapshots: snapshotsRef.current,
        warningCount: warningsRef.current,
        tabSwitches: tabRef.current,
        phoneDetections: phoneRef.current,
        speakingViolations: speakRef.current,
        totalQuestions: examQuestions.length,
        adminCommand: null,
        admin_command: null,
      });
      console.log('[ExamPage] DB update result:', ok);
    } catch (e) {
      console.error('Submit DB error:', e);
    }

    setCandidate(prev => ({ ...prev, status: 'completed' }));
    navigate('/exam/complete');
  };

  // Keep refs pointing to latest function versions (prevents stale closures in admin command listener)
  useEffect(() => { handleSubmitExamRef.current = handleSubmitExam; });
  useEffect(() => { handleDisqualifyRef.current = handleDisqualify; });
  useEffect(() => { handleWarningRef.current = handleWarning; });

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleNavigation = (direction) => {
    let next = qIndexRef.current;
    if (direction === 'next' && next < examQuestions.length - 1) next += 1;
    else if (direction === 'prev' && next > sessionStartIndex) next -= 1;
    else return;
    setCurrentQuestionIndex(next);
    // Immediate push so live card updates right away
    updateCandidateData(candidate.id, {
      currentQuestionIndex: next,
      totalQuestions: examQuestions.length,
      selectedAnswer: answersRef.current[next] ?? null,
    }).catch(() => { });
  };

  const handleOptionSelect = (optionNumber) => {
    const updated = [...answersRef.current];
    updated[currentQuestionIndex] = optionNumber;
    setCandidateAnswers(updated);
    updateCandidateData(candidate.id, {
      selectedAnswer: optionNumber,
      currentQuestionIndex: qIndexRef.current,
    }).catch(() => { });
  };

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = () => {
    stopObjDetect();
    stopAudio();
    if (procIntervalRef.current) clearInterval(procIntervalRef.current);
    if (snapIntervalRef.current) clearInterval(snapIntervalRef.current);
    if (randomSnapRef.current) clearTimeout(randomSnapRef.current);
    if (liveSyncRef.current) clearInterval(liveSyncRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (rtcPeerRef.current) rtcPeerRef.current.close();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
    document.body.removeEventListener('mouseleave', handleMouseLeave);
    document.body.removeEventListener('mouseenter', handleMouseEnter);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch { }
  };

  if (!candidate || examQuestions.length === 0) return null;

  const currentQuestion = examQuestions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / examQuestions.length) * 100;
  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const seconds = (timeLeft % 60).toString().padStart(2, '0');
  const roleDisplay = candidate.role?.charAt(0).toUpperCase() + candidate.role?.slice(1);

  return (
    <div className="container" id="candidate-exam-view">
      <WarningOverlay ref={warningOverlayRef} />
      <div className="exam-container">
        <div className="card">
          <div className="exam-header" id="exam-header">
            <div style={{ flexGrow: 1 }}>
              <h2 id="exam-title">{roleDisplay} Assessment</h2>
              <p>Candidate: <span id="candidate-name">{candidate.name}</span></p>
            </div>
            <div className="exam-timer">
              <i className="fas fa-clock"></i> <span id="time">{minutes}:{seconds}</span>
            </div>
            <div className="exam-progress-container">
              <div className="exam-progress-bar" id="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="exam-progress-text" id="progress-text">
              Question {currentQuestionIndex + 1} of {examQuestions.length}
            </div>
          </div>
          <div className="exam-body">
            <QuestionPanel
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={examQuestions.length}
              selectedAnswer={candidateAnswers[currentQuestionIndex]}
              onOptionSelect={handleOptionSelect}
              onPrev={() => handleNavigation('prev')}
              onNext={() => handleNavigation('next')}
              canGoPrev={currentQuestionIndex > sessionStartIndex}
              canGoNext={currentQuestionIndex < examQuestions.length - 1}
              onSubmit={() => handleSubmitExam('Candidate submitted')}
            />
            <ProctorPanel
              videoRef={examCameraRef}
              warnings={warnings}
              maxWarnings={MAX_WARNINGS}
              currentActivity={currentActivity}
              activityType={activityType}
              onAudioBarsReady={startVisualizer}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
