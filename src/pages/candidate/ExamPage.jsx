import { useEffect, useRef, useState, useCallback } from 'react';
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

const SNAPSHOT_INTERVAL = 30000; // 30 seconds
const RANDOM_SNAPSHOT_MIN = 60000;
const RANDOM_SNAPSHOT_MAX = 120000;

export default function ExamPage() {
  const navigate = useNavigate();
  const {
    candidate, setCandidate, examQuestions, candidateAnswers, setCandidateAnswers,
    currentQuestionIndex, setCurrentQuestionIndex, timeLeft, setTimeLeft,
    examInProgress, setExamInProgress, setExamStartTimeMs, sessionStartIndex, setSessionStartIndex,
    startTimer, stopTimer
  } = useExam();
  const {
    warnings, addWarning, addSnapshot, warningTimestamps, proctoringSnapshots,
    tabSwitches, setTabSwitches, phoneDetections, setPhoneDetections,
    speakingViolations, setSpeakingViolations, disqualified, setDisqualified,
    setDisqualificationReason, currentActivity, activityType, riskScore, MAX_WARNINGS
  } = useProctor();

  const examCameraRef = useRef(null);
  const streamRef = useRef(null);
  const examStartTimeMsRef = useRef(0);
  const warningOverlayRef = useRef(null);
  const proctoringIntervalRef = useRef(null);
  const snapshotIntervalRef = useRef(null);
  const randomSnapshotRef = useRef(null);
  const rtcPeerRef = useRef(null);
  const examInProgressRef = useRef(false);

  const { initFaceDetection, detectFaces, analyzeFaceResult } = useFaceDetection();
  const { initObjectDetection, startDetection: startObjectDetection, stopDetection: stopObjectDetection } = useObjectDetection({
    onPhoneDetected: useCallback((objClass) => {
      if (!examInProgressRef.current) return;
      setPhoneDetections(p => p + 1);
      handleWarning(`phone_detected: ${objClass}`, true);
    }, [])
  });
  const { initAudio, startVisualizer, stopAudio } = useAudioDetection({
    onSpeechDetected: useCallback(() => {
      if (!examInProgressRef.current) return;
      setSpeakingViolations(v => v + 1);
    }, [])
  });
  const { startRecording, stopRecording } = useExamRecording();

  useEffect(() => {
    if (!candidate || examQuestions.length === 0) { navigate('/'); return; }
    startExam();
    return () => cleanup();
  }, []);

  // Admin command subscription
  useEffect(() => {
    if (!candidate?.id) return;
    const unsub = subscribeToCandidate(candidate.id, (updated) => {
      const cmd = updated.admin_command || updated.adminCommand;;
      if (!cmd) return;
      if (cmd === 'force-submit') handleSubmitExam('Admin forced submission');
      if (cmd === 'disqualify') handleDisqualify('Admin disqualified candidate');
      if (cmd === 'warn') handleWarning('admin_warning', false);
    });
    return unsub;
  }, [candidate?.id]);

  const startExam = async () => {
    try {
      // Request fullscreen
      try { await document.documentElement.requestFullscreen(); } catch { }

      // Open camera
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (examCameraRef.current) examCameraRef.current.srcObject = stream;

      // Device fingerprint
      const fingerprint = `${navigator.userAgent}|${screen.width}|${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
      const startTime = new Date().toISOString();
      const startMs = Date.now();
      examStartTimeMsRef.current = startMs;
      examInProgressRef.current = true;
      setExamInProgress(true);
      setExamStartTimeMs(startMs);

      await updateCandidateData(candidate.id, {
        status: 'in-progress',
        exam_start_time: startTime,
        deviceFingerprint: fingerprint,
        adminCommand: null,
        warningCount: 0,
        currentQuestionIndex: 0
      });
      await updateToken(candidate.tokenId, { status: 'used' });

      // Init AI/Detection
      await initFaceDetection();
      await initObjectDetection();

      // Audio
      const audioStream = new MediaStream(stream.getAudioTracks());
      await initAudio(audioStream);

      // Recording
      await startRecording(stream);

      // Proctoring loop (face detection)
      proctoringIntervalRef.current = setInterval(() => runProctoringCheck(), 500);

      // Periodic snapshot every 30s
      snapshotIntervalRef.current = setInterval(() => takeSnapshot('periodic'), SNAPSHOT_INTERVAL);
      scheduleRandomSnapshot();

      // Object detection
      if (examCameraRef.current) startObjectDetection(examCameraRef.current);

      // Start timer
      startTimer(() => handleSubmitExam('Time expired'));

      // Setup WebRTC for live monitoring
      setupWebRTC(stream);

      // Setup proctoring event listeners
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

  const setupWebRTC = async (stream) => {
    try {
      if (rtcPeerRef.current) rtcPeerRef.current.close();

      rtcPeerRef.current = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      stream.getTracks().forEach(track => rtcPeerRef.current.addTrack(track, stream));

      const offer = await rtcPeerRef.current.createOffer();
      await rtcPeerRef.current.setLocalDescription(offer);

      // Wait a moment for ICE gathering to complete before broadcasting the offer
      await new Promise(resolve => {
        if (rtcPeerRef.current.iceGatheringState === 'complete') resolve();
        else {
          setTimeout(resolve, 1500); // Wait max 1.5s for ICE candidates
          rtcPeerRef.current.onicegatheringstatechange = () => {
            if (rtcPeerRef.current.iceGatheringState === 'complete') resolve();
          };
        }
      });

      // Broadcast our offer
      await saveWebRTCOffer(candidate.id, { type: rtcPeerRef.current.localDescription.type, sdp: rtcPeerRef.current.localDescription.sdp });

      // Listen for the answer from admin
      subscribeToWebRTCAnswer(candidate.id, async ({ answer }) => {
        if (answer && rtcPeerRef.current && rtcPeerRef.current.signalingState !== 'closed' && !rtcPeerRef.current.remoteDescription) {
          try {
            await rtcPeerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (e) { console.warn('Answer set error:', e); }
        }
      });
    } catch (e) {
      console.warn('WebRTC setup failed (will use snapshot fallback):', e);
    }
  };

  useEffect(() => {
    if (!candidate?.id) return;
    const unsubReq = subscribeToWebRTCRequest(candidate.id, () => {
      if (streamRef.current) {
        setupWebRTC(streamRef.current);
      }
    });
    return unsubReq;
  }, [candidate?.id]);

  const runProctoringCheck = () => {
    if (!examCameraRef.current || !examInProgressRef.current) return;
    const result = detectFaces(examCameraRef.current);
    if (!result) return;
    const { faceCount, isLookingAway } = analyzeFaceResult(result);

    if (faceCount === 0) {
      handleWarning('face_not_visible', true);
    } else if (faceCount > 1) {
      handleWarning('multiple_faces_detected', true);
    } else if (isLookingAway) {
      handleWarning('looking_away', false);
    }
  };

  const handleWarning = useCallback((reason, takeSnap = false) => {
    if (!examInProgressRef.current) return;
    addWarning(reason, examStartTimeMsRef.current, (disqReason) => handleDisqualify(disqReason));
    if (takeSnap) takeSnapshot(reason);
    showWarningOverlay(reason.replace(/_/g, ' '));

    const newWarning = { time: Math.floor((Date.now() - examStartTimeMsRef.current) / 1000), reason };

    updateCandidateData(candidate.id, {
      warningCount: warnings + 1,
      warningTimestamps: [...(candidate.warningTimestamps || []), newWarning]
    }).catch(() => { });
  }, [warnings, candidate]);

  const showWarningOverlay = (text) => {
    if (warningOverlayRef.current) {
      warningOverlayRef.current.show(text);
    }
  };

  const takeSnapshot = async (reason) => {
    if (!examCameraRef.current || !candidate) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = examCameraRef.current.videoWidth || 320;
      canvas.height = examCameraRef.current.videoHeight || 240;
      canvas.getContext('2d').drawImage(examCameraRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      const result = await uploadSnapshot(dataUrl, candidate.id, reason);
      if (result) {
        const snapObj = { url: result.url, path: result.path, reason, timestamp: new Date().toISOString() };
        addSnapshot(snapObj);

        // Supabase JSONB arrays replace entirely, so we append to our local context array
        await updateCandidateData(candidate.id, {
          proctoringSnapshots: [...(candidate.proctoringSnapshots || []), snapObj]
        });
      }
    } catch (e) {
      console.error('Snapshot error:', e);
    }
  };

  const scheduleRandomSnapshot = () => {
    const delay = RANDOM_SNAPSHOT_MIN + Math.random() * (RANDOM_SNAPSHOT_MAX - RANDOM_SNAPSHOT_MIN);
    randomSnapshotRef.current = setTimeout(() => {
      if (examInProgressRef.current) {
        takeSnapshot('random_check');
        scheduleRandomSnapshot();
      }
    }, delay);
  };

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
    if (examInProgressRef.current) {
      updateCandidateData(candidate?.id, { cursorStatus: 'out' }).catch(() => { });
    }
  }, [candidate?.id]);

  const handleMouseEnter = useCallback(() => {
    if (candidate?.id) updateCandidateData(candidate.id, { cursorStatus: 'in' }).catch(() => { });
  }, [candidate?.id]);

  const handleFullscreenChange = useCallback(() => {
    if (!document.fullscreenElement && examInProgressRef.current) {
      handleWarning('fullscreen_exited', false);
    }
  }, []);

  const handleDisqualify = async (reason) => {
    if (!examInProgressRef.current) return;
    examInProgressRef.current = false;
    setExamInProgress(false);
    stopTimer();

    // Stop recording & upload
    let recordingUrl = null;
    try {
      const blob = await stopRecording();
      if (blob) {
        const res = await uploadRecording(blob, candidate.id);
        if (res) recordingUrl = res.url;
      }
    } catch (e) { console.error('Recording upload error:', e); }

    cleanup();

    setDisqualified(true);
    setDisqualificationReason(reason);

    await updateCandidateData(candidate.id, {
      status: 'disqualified',
      disqualificationReason: reason,
      examEndTime: new Date().toISOString(),
      recordingUrl: recordingUrl || null,
      warningTimestamps,
      proctoringSnapshots,
    });

    setCandidate(prev => ({ ...prev, status: 'disqualified', disqualificationReason: reason }));
    navigate('/exam/complete');
  };

  const handleSubmitExam = async (reason = 'Candidate submitted') => {
    if (!examInProgressRef.current) return;
    examInProgressRef.current = false;
    setExamInProgress(false);
    stopTimer();

    // Stop recording & upload
    let recordingUrl = null;
    try {
      const blob = await stopRecording();
      if (blob) {
        const res = await uploadRecording(blob, candidate.id);
        if (res) recordingUrl = res.url;
      }
    } catch (e) { console.error('Recording upload error:', e); }

    cleanup();

    // Calculate score
    const total = examQuestions.length;
    const correct = examQuestions.filter((q, i) => candidateAnswers[i] === q.correctAnswer).length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;

    await setCandidateData(candidate.id, {
      status: 'completed',
      score,
      examEndTime: new Date().toISOString(),
      examResults: { questions: examQuestions, answers: candidateAnswers },
      recordingUrl: recordingUrl || null,
      warningTimestamps,
      proctoringSnapshots,
    });

    setCandidate(prev => ({ ...prev, status: 'completed' }));
    navigate('/exam/complete');
  };

  const handleNavigation = (direction) => {
    if (direction === 'next' && currentQuestionIndex < examQuestions.length - 1) {
      const next = currentQuestionIndex + 1;
      setCurrentQuestionIndex(next);

      // Tell Supabase the student moved forward!
      updateCandidateData(candidate.id, {
        current_question_index: next,
        selectedAnswer: candidateAnswers[next] ?? null
      }).catch(() => { });

    } else if (direction === 'prev' && currentQuestionIndex > sessionStartIndex) {
      const prev = currentQuestionIndex - 1;
      setCurrentQuestionIndex(prev);

      // Tell Supabase the student moved backward!
      updateCandidateData(candidate.id, {
        current_question_index: prev,
        selectedAnswer: candidateAnswers[prev] ?? null
      }).catch(() => { });
    }
  };


  const handleOptionSelect = (optionNumber) => {
    const updated = [...candidateAnswers];
    updated[currentQuestionIndex] = optionNumber;
    setCandidateAnswers(updated);
    updateCandidateData(candidate.id, { selectedAnswer: optionNumber }).catch(() => { });
  };

  const cleanup = () => {
    stopObjectDetection();
    stopAudio();
    if (proctoringIntervalRef.current) clearInterval(proctoringIntervalRef.current);
    if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);
    if (randomSnapshotRef.current) clearTimeout(randomSnapshotRef.current);
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
  const progress = examQuestions.length > 0 ? ((currentQuestionIndex + 1) / examQuestions.length) * 100 : 0;
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
            <div className="exam-progress-text" id="progress-text">Question {currentQuestionIndex + 1} of {examQuestions.length}</div>
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
