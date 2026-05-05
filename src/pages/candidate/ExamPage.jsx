import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../../contexts/ExamContext';
import { useProctor } from '../../contexts/ProctorContext';
import { subscribeToCandidate, updateCandidateData } from '../../services/candidateService';
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

// ─── Proctoring config ────────────────────────────────────────────────────────
const PROCTOR_CONFIG = {
  STRIKES_PER_WARNING: 5,      // 5 sub-strikes → 1 main warning
  MAX_WARNINGS: 3,      // 3 main warnings → disqualify
  headTurnRatioThreshold: 0.18,   // how extreme a head-turn must be
  gazeRatioThreshold: 0.28,   // how far eyes must look away
  COOLDOWN_MS: 15000,  // min 15s between same-type strikes
  MIC_SILENCE_THRESHOLD_MS: 30000,  // 30s silence before mic warning
  MOUTH_CLOSED_THRESHOLD: 0.04,
  AUDIO_MISMATCH_FRAMES: 20,
};

const SNAPSHOT_INTERVAL = 45000;  // periodic snapshot every 45s
const LIVE_SYNC_INTERVAL = 3000;

export default function ExamPage() {
  const navigate = useNavigate();
  const {
    candidate, setCandidate, examQuestions, candidateAnswers, setCandidateAnswers,
    currentQuestionIndex, setCurrentQuestionIndex, timeLeft,
    setExamInProgress, setExamStartTimeMs, sessionStartIndex,
    startTimer, stopTimer,
  } = useExam();
  const {
    addWarning, addSnapshot, warningTimestamps, proctoringSnapshots,
    tabSwitches, setTabSwitches, phoneDetections, setPhoneDetections,
    speakingViolations, setSpeakingViolations,
    setDisqualified, setDisqualificationReason,
    currentActivity, activityType,
  } = useProctor();

  // ── Core refs ─────────────────────────────────────────────────────────────
  const examCameraRef = useRef(null);
  const streamRef = useRef(null);
  const examStartTimeMsRef = useRef(0);
  const warningOverlayRef = useRef(null);
  const snapIntervalRef = useRef(null);
  const randomSnapRef = useRef(null);
  const liveSyncRef = useRef(null);
  const rtcPeerRef = useRef(null);
  const examInProgressRef = useRef(false);
  const submitCalledRef = useRef(false);

  // ── Always-fresh value refs ───────────────────────────────────────────────
  const answersRef = useRef(candidateAnswers);
  const qIndexRef = useRef(currentQuestionIndex);
  const warnTsRef = useRef(warningTimestamps);
  const snapshotsRef = useRef(proctoringSnapshots);
  const tabRef = useRef(tabSwitches);
  const phoneRef = useRef(phoneDetections);
  const speakRef = useRef(speakingViolations);
  // CRITICAL: Keep examQuestions and candidate in refs so async closures always
  // have the current data even if component is re-rendering or state is stale
  const examQuestionsRef = useRef(examQuestions);
  const candidateIdRef = useRef(candidate?.id);

  useEffect(() => { answersRef.current = candidateAnswers; }, [candidateAnswers]);
  useEffect(() => { qIndexRef.current = currentQuestionIndex; }, [currentQuestionIndex]);
  useEffect(() => { warnTsRef.current = warningTimestamps; }, [warningTimestamps]);
  useEffect(() => { snapshotsRef.current = proctoringSnapshots; }, [proctoringSnapshots]);
  useEffect(() => { tabRef.current = tabSwitches; }, [tabSwitches]);
  useEffect(() => { phoneRef.current = phoneDetections; }, [phoneDetections]);
  useEffect(() => { speakRef.current = speakingViolations; }, [speakingViolations]);
  useEffect(() => { examQuestionsRef.current = examQuestions; }, [examQuestions]);
  useEffect(() => { candidateIdRef.current = candidate?.id; }, [candidate?.id]);

  // ── Proctoring state (ref — no re-renders on each frame) ──────────────────
  const ps = useRef({
    isFaceVisible: true,
    isGazeAway: false,
    isHeadTurned: false,
    isSpeaking: false,
    isPhoneDetected: false,
    areMultiplePeople: false,
    mouthOpenRatio: 0,
    lastSoundTime: 0,

    headTurnStrikes: 0,
    gazeAwayStrikes: 0,
    faceMissingStrikes: 0,
    multiplePeopleStrikes: 0,
    phoneDetectedStrikes: 0,
    focusLossStrikes: 0,
    audioMismatchStrikes: 0,

    totalWarnings: 0,

    isHeadTurnedActive: false,
    isGazeAwayActive: false,
    isFaceMissingActive: false,
    isMultiplePeopleActive: false,
    isPhoneDetectedActive: false,
    isMicMutedActive: false,
    isFocusLostActive: false,
    hasIssuedEarphoneWarn: false,

    lastStrikeTime: {},
  });

  // ── Function refs — so rAF loop always calls the LATEST version ───────────
  const handleSubmitExamRef = useRef(null);
  const handleDisqualifyRef = useRef(null);
  // KEY FIX: showBanner stored in a ref so the rAF loop always reads the live
  // warningOverlayRef.current instead of a stale closure copy
  const showBannerRef = useRef(null);

  // ── Detectors ─────────────────────────────────────────────────────────────
  const { initFaceDetection, detectFaces } = useFaceDetection();

  const { initObjectDetection, startDetection: startObjDetect, stopDetection: stopObjDetect } = useObjectDetection({
    onPhoneDetected: useCallback(() => {
      if (!examInProgressRef.current) return;
      ps.current.isPhoneDetected = true;
      setPhoneDetections(p => p + 1);
    }, []),
  });

  const { initAudio, startVisualizer, stopAudio } = useAudioDetection({
    onSpeechDetected: useCallback(() => {
      if (!examInProgressRef.current) return;
      ps.current.isSpeaking = true;
      ps.current.lastSoundTime = Date.now();
      setSpeakingViolations(v => v + 1);
    }, []),
  });

  const { startRecording, stopRecording, recordClip } = useExamRecording();

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!candidate || examQuestions.length === 0) { navigate('/'); return; }
    startExam();
    return () => cleanup();
  }, []);

  // Update showBannerRef every render so it always has the latest ref handle
  // This is the key fix — rAF closures call showBannerRef.current() which
  // always resolves to the current warningOverlayRef.current
  useEffect(() => {
    showBannerRef.current = (message) => {
      if (warningOverlayRef.current?.show) {
        warningOverlayRef.current.show(message);
      } else {
        // Fallback: direct DOM injection if ref not ready
        const el = document.getElementById('__warning_banner__');
        if (el) {
          el.textContent = message;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
          clearTimeout(el._timer);
          el._timer = setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-130%)';
          }, 4000);
        }
      }
    };
  });

  // ── Admin command listener ────────────────────────────────────────────────
  useEffect(() => {
    if (!candidate?.id) return;
    const unsub = subscribeToCandidate(candidate.id, (updated) => {
      const cmd = (updated.admin_command || updated.adminCommand || '').trim();
      if (!cmd) return;
      updateCandidateData(candidate.id, { adminCommand: null, admin_command: null }).catch(() => { });
      if (cmd === 'force-submit') handleSubmitExamRef.current?.('Admin forced submission');
      else if (cmd === 'disqualify') handleDisqualifyRef.current?.('Admin disqualified candidate');
      else if (cmd === 'warn') issueMainWarning('Admin issued a warning.', 'Admin_Warning');
      else if (cmd === 'pause') showNotification('⏸ Exam paused by admin', 'warning');
      else if (cmd === 'resume') showNotification('▶ Exam resumed by admin', 'success');
    });
    return unsub;
  }, [candidate?.id]);

  // ── Live sync ─────────────────────────────────────────────────────────────
  const startLiveSync = (candidateId) => {
    liveSyncRef.current = setInterval(async () => {
      if (!examInProgressRef.current || !candidateId) return;
      try {
        const riskScore = Math.min(100,
          ps.current.totalWarnings * 20 +
          tabRef.current * 15 +
          phoneRef.current * 25 +
          speakRef.current * 10
        );

        await updateCandidateData(candidateId, {
          currentQuestionIndex: qIndexRef.current,
          totalQuestions: examQuestions.length,
          selectedAnswer: answersRef.current[qIndexRef.current] ?? null,
          warningCount: ps.current.totalWarnings,
          tabSwitches: tabRef.current,
          phoneDetections: phoneRef.current,
          speakingViolations: speakRef.current,
          warningTimestamps: warnTsRef.current,
          riskScore: riskScore,
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

      const startIso = new Date().toISOString();
      const startMs = Date.now();
      examStartTimeMsRef.current = startMs;
      examInProgressRef.current = true;
      submitCalledRef.current = false;
      ps.current.lastSoundTime = Date.now();

      setExamInProgress(true);
      setExamStartTimeMs(startMs);

      await updateCandidateData(candidate.id, {
        status: 'in-progress',
        exam_start_time: startIso,
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
      // await startRecording(stream); // DISABLED: Only recording warning clips now

      // Start proctoring rAF loop
      window.requestAnimationFrame(proctoringLoop);

      snapIntervalRef.current = setInterval(() => takeSnapshot('periodic'), SNAPSHOT_INTERVAL);
      scheduleRandomSnapshot();

      if (examCameraRef.current) startObjDetect(examCameraRef.current);

      startTimer(() => handleSubmitExam('Time expired'));
      startLiveSync(candidate.id);

      setTimeout(() => takeSnapshot('exam_start'), 3000);

      setupWebRTC(stream);

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('blur', handleWindowBlur);
      document.body.addEventListener('mouseleave', handleMouseLeave);
      document.body.addEventListener('mouseenter', handleMouseEnter);
      document.addEventListener('fullscreenchange', handleFullscreenChange);

    } catch (err) {
      console.error('Exam start error:', err);
      showNotification('Failed to start exam. Check camera/microphone permissions.', 'error');
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
        ],
      });
      stream.getTracks().forEach(t => rtcPeerRef.current.addTrack(t, stream));
      const offer = await rtcPeerRef.current.createOffer();
      await rtcPeerRef.current.setLocalDescription(offer);
      await new Promise(res => {
        if (rtcPeerRef.current.iceGatheringState === 'complete') return res();
        setTimeout(res, 2000);
        rtcPeerRef.current.onicegatheringstatechange = () => {
          if (rtcPeerRef.current?.iceGatheringState === 'complete') res();
        };
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
    } catch (e) { console.warn('WebRTC unavailable:', e); }
  };

  useEffect(() => {
    if (!candidate?.id) return;
    const unsub = subscribeToWebRTCRequest(candidate.id, () => {
      if (streamRef.current) setupWebRTC(streamRef.current);
    });
    return unsub;
  }, [candidate?.id]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCTORING rAF LOOP
  // ═══════════════════════════════════════════════════════════════════════════
  const proctoringLoop = useCallback(() => {
    if (!examInProgressRef.current) return;

    const video = examCameraRef.current;
    if (video && video.readyState >= 2) {
      const results = detectFaces(video);
      if (results) processFaceResults(results);
    }

    checkViolations();
    window.requestAnimationFrame(proctoringLoop);
  }, []); // stable ref — reads everything through refs

  // ── Face landmark processing ──────────────────────────────────────────────
  function processFaceResults(results) {
    const landmarks = results.faceLandmarks?.[0];
    const blendshapes = results.faceBlendshapes?.[0]?.categories;

    if (!landmarks) {
      ps.current.isFaceVisible = false;
      return;
    }
    ps.current.isFaceVisible = true;

    const nose = landmarks[1].x;
    const leftCorner = landmarks[130].x;
    const rightCorner = landmarks[359].x;
    const faceWidth = rightCorner - leftCorner;

    if (faceWidth > 0) {
      const headRatio = (nose - leftCorner) / faceWidth;
      ps.current.isHeadTurned =
        headRatio < PROCTOR_CONFIG.headTurnRatioThreshold ||
        headRatio > (1 - PROCTOR_CONFIG.headTurnRatioThreshold);
    }

    if (landmarks[473] && landmarks[468] && faceWidth > 0) {
      const irisAvgX = (landmarks[473].x + landmarks[468].x) / 2;
      const gazeRatio = (irisAvgX - leftCorner) / faceWidth;
      ps.current.isGazeAway =
        gazeRatio < PROCTOR_CONFIG.gazeRatioThreshold ||
        gazeRatio > (1 - PROCTOR_CONFIG.gazeRatioThreshold);
    }

    if (blendshapes) {
      const mouthOpen = blendshapes.find(s => s.categoryName === 'mouthOpen');
      ps.current.mouthOpenRatio = mouthOpen?.score ?? 0;
    }
  }

  // ── Check all flags and issue strikes ─────────────────────────────────────
  function checkViolations() {
    const p = ps.current;
    const now = Date.now();

    // Mic silence
    if (!p.isMicMutedActive && now - p.lastSoundTime > PROCTOR_CONFIG.MIC_SILENCE_THRESHOLD_MS) {
      p.isMicMutedActive = true;
      showBannerRef.current?.('⚠️ WARNING: Your microphone seems silent. Please check it.');
      setTimeout(() => {
        if (examInProgressRef.current && p.isMicMutedActive) {
          handleDisqualifyRef.current?.('Microphone was muted or disconnected.');
        }
      }, 30000);
    }

    // Head turned
    if (p.isHeadTurned) {
      if (!p.isHeadTurnedActive) p.isHeadTurnedActive = true;
      const last = p.lastStrikeTime['Head_Turn'] || 0;
      if (now - last >= PROCTOR_CONFIG.COOLDOWN_MS) {
        p.lastStrikeTime['Head_Turn'] = now;
        fireStrike('Head_Turn',
          '⚠️ Strike: Please face the screen directly.',
          'Repeatedly turning head away from screen.');
      }
    } else {
      p.isHeadTurnedActive = false;
    }

    // Gaze away
    if (p.isGazeAway) {
      if (!p.isGazeAwayActive) p.isGazeAwayActive = true;
      const last = p.lastStrikeTime['Gaze_Away'] || 0;
      if (now - last >= PROCTOR_CONFIG.COOLDOWN_MS) {
        p.lastStrikeTime['Gaze_Away'] = now;
        fireStrike('Gaze_Away',
          '⚠️ Strike: Please keep your eyes on the screen.',
          'Repeatedly looking away from screen.');
      }
    } else {
      p.isGazeAwayActive = false;
    }

    // Face missing
    if (!p.isFaceVisible) {
      if (!p.isFaceMissingActive) p.isFaceMissingActive = true;
      const last = p.lastStrikeTime['Face_Missing'] || 0;
      if (now - last >= PROCTOR_CONFIG.COOLDOWN_MS) {
        p.lastStrikeTime['Face_Missing'] = now;
        fireStrike('Face_Missing',
          '⚠️ Strike: Your face is not visible. Please stay in camera view.',
          'Face not visible in camera multiple times.');
      }
    } else {
      p.isFaceMissingActive = false;
    }

    // Multiple people
    if (p.areMultiplePeople) {
      if (!p.isMultiplePeopleActive) p.isMultiplePeopleActive = true;
      const last = p.lastStrikeTime['Multiple_People'] || 0;
      if (now - last >= PROCTOR_CONFIG.COOLDOWN_MS) {
        p.lastStrikeTime['Multiple_People'] = now;
        fireStrike('Multiple_People',
          '⚠️ Strike: Another person detected in frame.',
          'Multiple people detected repeatedly.');
      }
    } else {
      p.isMultiplePeopleActive = false;
    }

    // Phone detected
    if (p.isPhoneDetected) {
      if (!p.isPhoneDetectedActive) p.isPhoneDetectedActive = true;
      const last = p.lastStrikeTime['Phone_Detected'] || 0;
      if (now - last >= PROCTOR_CONFIG.COOLDOWN_MS) {
        p.lastStrikeTime['Phone_Detected'] = now;
        fireStrike('Phone_Detected',
          '⚠️ Strike: Mobile phone detected. Please put it away.',
          'Mobile phone detected multiple times.');
      }
    } else {
      p.isPhoneDetectedActive = false;
      p.isPhoneDetected = false;
    }

    // Earphone / audio-visual mismatch
    if (!p.hasIssuedEarphoneWarn) {
      if (p.isSpeaking && p.mouthOpenRatio < PROCTOR_CONFIG.MOUTH_CLOSED_THRESHOLD) {
        p.audioMismatchStrikes++;
      } else {
        p.audioMismatchStrikes = Math.max(0, p.audioMismatchStrikes - 1);
      }
      if (p.audioMismatchStrikes > PROCTOR_CONFIG.AUDIO_MISMATCH_FRAMES) {
        p.hasIssuedEarphoneWarn = true;
        showBannerRef.current?.('⚠️ WARNING: Earphones are not permitted during the exam.');
      }
    }
  }

  // ── fireStrike: accumulate sub-strikes, every N → main warning ────────────
  function fireStrike(reasonCode, strikeMsg, warnMsg) {
    if (!examInProgressRef.current) return;

    // Show banner immediately via the ref — this is the reliable path
    showBannerRef.current?.(strikeMsg);

    // Record timestamp
    const ts = { time: Math.floor((Date.now() - examStartTimeMsRef.current) / 1000), reason: reasonCode };
    warnTsRef.current = [...warnTsRef.current, ts];

    // Async snapshot and clip recording (non-blocking)
    (async () => {
      try {
        const video = examCameraRef.current;
        if (!video || !streamRef.current) return;
        
        // Take snapshot first
        const snapshot = await takeSnapshot(reasonCode);
        
        // Record a 5-second clip
        const clipBlob = await recordClip(streamRef.current, 5000);
        if (clipBlob) {
          const res = await uploadRecording(clipBlob, candidate.id);
          if (res) {
            // Update the specific timestamp entry with the video URL
            const updatedTs = warnTsRef.current.map(item => 
              (item.time === ts.time && item.reason === ts.reason) 
                ? { ...item, videoUrl: res.url, snapshotUrl: snapshot?.url } 
                : item
            );
            warnTsRef.current = updatedTs;
            await updateCandidateData(candidate.id, { warningTimestamps: updatedTs });
          }
        }
      } catch (e) { console.error('Clip recording/upload error:', e); }
    })();

    // Increment per-type counter
    const p = ps.current;
    let count = 0;
    switch (reasonCode) {
      case 'Head_Turn': p.headTurnStrikes++; count = p.headTurnStrikes; break;
      case 'Gaze_Away': p.gazeAwayStrikes++; count = p.gazeAwayStrikes; break;
      case 'Face_Missing': p.faceMissingStrikes++; count = p.faceMissingStrikes; break;
      case 'Multiple_People': p.multiplePeopleStrikes++; count = p.multiplePeopleStrikes; break;
      case 'Phone_Detected': p.phoneDetectedStrikes++; count = p.phoneDetectedStrikes; break;
      case 'Tab_Switch':
      case 'Window_Blur': p.focusLossStrikes++; count = p.focusLossStrikes; break;
      default: count = PROCTOR_CONFIG.STRIKES_PER_WARNING;
    }

    if (count % PROCTOR_CONFIG.STRIKES_PER_WARNING === 0) {
      issueMainWarning(warnMsg, reasonCode);
    }
  }

  // ── Issue a main warning ──────────────────────────────────────────────────
  function issueMainWarning(message, reasonCode) {
    if (!examInProgressRef.current) return;

    ps.current.totalWarnings++;
    const total = ps.current.totalWarnings;

    showBannerRef.current?.(
      `🚨 MAIN WARNING ${total}/${PROCTOR_CONFIG.MAX_WARNINGS}: ${message}`
    );

    updateCandidateData(candidate?.id, {
      warningCount: total,
      warningTimestamps: [...warnTsRef.current, {
        time: Math.floor((Date.now() - examStartTimeMsRef.current) / 1000),
        reason: `MAIN_WARNING_${reasonCode}`,
      }],
    }).catch(() => { });

    addWarning(reasonCode, examStartTimeMsRef.current, () => { });

    if (total >= PROCTOR_CONFIG.MAX_WARNINGS) {
      setTimeout(() => {
        handleDisqualifyRef.current?.(`Exceeded maximum of ${PROCTOR_CONFIG.MAX_WARNINGS} warnings.`);
      }, 2500);
    }
  }

  // ── Browser focus/visibility events ──────────────────────────────────────
  const handleVisibilityChange = useCallback(() => {
    if (!examInProgressRef.current) return;
    if (document.visibilityState === 'hidden') {
      setTabSwitches(t => t + 1);
      if (!ps.current.isFocusLostActive) {
        ps.current.isFocusLostActive = true;
        ps.current.lastStrikeTime['Tab_Switch'] = 0; // allow immediate first strike
        fireStrike('Tab_Switch',
          '⚠️ Strike: You switched away from the exam window.',
          'Tab switching detected multiple times.');
      }
    } else {
      ps.current.isFocusLostActive = false;
    }
  }, []);

  const handleWindowBlur = useCallback(() => {
    if (!examInProgressRef.current) return;
    if (!ps.current.isFocusLostActive) {
      ps.current.isFocusLostActive = true;
      fireStrike('Window_Blur',
        '⚠️ Strike: You left the exam window.',
        'Leaving exam window detected multiple times.');
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (examInProgressRef.current && candidate?.id)
      updateCandidateData(candidate.id, { cursorStatus: 'out' }).catch(() => { });
  }, [candidate?.id]);

  const handleMouseEnter = useCallback(() => {
    if (candidate?.id) {
      updateCandidateData(candidate.id, { cursorStatus: 'in' }).catch(() => { });
      ps.current.isFocusLostActive = false;
    }
  }, [candidate?.id]);

  const handleFullscreenChange = useCallback(() => {
    if (!document.fullscreenElement && examInProgressRef.current)
      showBannerRef.current?.('⚠️ Please stay in fullscreen mode (press F11 to return).');
  }, []);

  // ── Snapshots ─────────────────────────────────────────────────────────────
  async function takeSnapshot(reason) {
    const video = examCameraRef.current;
    if (!video || !candidate?.id) return;
    try {
      const c = document.createElement('canvas');
      c.width = video.videoWidth || 320;
      c.height = video.videoHeight || 240;
      c.getContext('2d').drawImage(video, 0, 0);
      const res = await uploadSnapshot(c.toDataURL('image/jpeg', 0.7), candidate.id, reason);
      if (res) {
        const snap = { url: res.url, path: res.path, reason, timestamp: new Date().toISOString() };
        addSnapshot(snap);
        snapshotsRef.current = [...snapshotsRef.current, snap];
        await updateCandidateData(candidate.id, { proctoringSnapshots: snapshotsRef.current });
      }
    } catch (e) { console.error('Snapshot error:', e); }
  }

  function scheduleRandomSnapshot() {
    const delay = 60000 + Math.random() * 90000;
    randomSnapRef.current = setTimeout(() => {
      if (examInProgressRef.current) { takeSnapshot('random_check'); scheduleRandomSnapshot(); }
    }, delay);
  }

  // ── Finalize ──────────────────────────────────────────────────────────────
  const finalizeExam = async () => {
    examInProgressRef.current = false;
    setExamInProgress(false);
    stopTimer();
    if (liveSyncRef.current) clearInterval(liveSyncRef.current);

    cleanup();
    return { recordingUrl: null, recordingPath: null };
  };

  // ── Disqualify ────────────────────────────────────────────────────────────
  const handleDisqualify = async (reason) => {
    if (!examInProgressRef.current) return;
    const { recordingUrl, recordingPath } = await finalizeExam();

    setDisqualified(true);
    setDisqualificationReason(reason);

    const ans = answersRef.current;
    const qs = examQuestionsRef.current;
    const cId = candidateIdRef.current;
    const score = qs.length > 0
      ? Math.round(qs.filter((q, i) => ans[i] === q.correctAnswer).length / qs.length * 100) : 0;

    try {
      await updateCandidateData(cId, {
        status: 'disqualified',
        disqualificationReason: reason,
        examEndTime: new Date().toISOString(),
        score,
        examResults: { questions: qs, answers: ans },
        recordingUrl: recordingUrl || null,
        recordingPath: recordingPath || null,
        warningTimestamps: warnTsRef.current,
        proctoringSnapshots: snapshotsRef.current,
        warningCount: ps.current.totalWarnings,
        tabSwitches: tabRef.current,
        phoneDetections: phoneRef.current,
        speakingViolations: speakRef.current,
        totalQuestions: qs.length,
      });
    } catch (e) { console.error('Disqualify DB error:', e); }

    setCandidate(prev => ({ ...prev, status: 'disqualified', disqualificationReason: reason }));
    navigate('/exam/complete');
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmitExam = async (reason = 'Candidate submitted') => {
    if (!examInProgressRef.current || submitCalledRef.current) return;
    submitCalledRef.current = true;

    // 1. Immediately stop timers and intervals to freeze the state
    examInProgressRef.current = false;
    setExamInProgress(false);
    stopTimer();
    if (liveSyncRef.current) clearInterval(liveSyncRef.current);

    const ans = answersRef.current;
    // Use ref to ensure we have the correct questions even if state was stale
    const qs = examQuestionsRef.current;
    const cId = candidateIdRef.current;
    const correct = qs.filter((q, i) => ans[i] === q.correctAnswer).length;
    const score = qs.length > 0 ? Math.round((correct / qs.length) * 100) : 0;
    const endTime = new Date().toISOString();
    
    const riskScore = Math.min(100,
      ps.current.totalWarnings * 20 +
      tabRef.current * 15 +
      phoneRef.current * 25 +
      speakRef.current * 10
    );

    console.log(`[Submit] Questions: ${qs.length}, Correct: ${correct}, Score: ${score}%, CandidateId: ${cId}`);

    // 2. SAVE CORE DATA IMMEDIATELY (Status, Score, Answers, Risk)
    try {
      const success = await updateCandidateData(cId, {
        status: 'completed',
        score,
        riskScore,
        examEndTime: endTime,
        examResults: { questions: qs, answers: ans },
        warningTimestamps: warnTsRef.current,
        proctoringSnapshots: snapshotsRef.current,
        warningCount: ps.current.totalWarnings,
        tabSwitches: tabRef.current,
        phoneDetections: phoneRef.current,
        speakingViolations: speakRef.current,
        totalQuestions: qs.length,
        adminCommand: null,
        admin_command: null,
      });
      
      if (!success) {
        throw new Error('Database update returned failure');
      }
    } catch (e) {
      console.error('Core data submit error:', e);
      showNotification('Submission error. Retrying...', 'warning');
      // Retry once
      await new Promise(r => setTimeout(r, 1500));
      await updateCandidateData(cId, { status: 'completed', score, riskScore });
    }

    // Small delay to ensure Supabase triggers have finished
    await new Promise(r => setTimeout(r, 800));

    // 3. Finalize Recording
    const { recordingUrl, recordingPath } = await finalizeExam();

    // 4. Update recording info if we got it
    if (recordingUrl) {
      try {
        await updateCandidateData(candidate.id, {
          recordingUrl,
          recordingPath,
        });
      } catch (e) { console.error('Recording update error:', e); }
    }

    setCandidate(prev => ({ ...prev, status: 'completed' }));
    navigate('/exam/complete');
  };

  // Keep function refs fresh on every render
  useEffect(() => { handleSubmitExamRef.current = handleSubmitExam; });
  useEffect(() => { handleDisqualifyRef.current = handleDisqualify; });

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleNavigation = (direction) => {
    let next = qIndexRef.current;
    if (direction === 'next' && next < examQuestions.length - 1) next++;
    else if (direction === 'prev' && next > sessionStartIndex) next--;
    else return;
    setCurrentQuestionIndex(next);
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

  // ── Render ────────────────────────────────────────────────────────────────
  if (!candidate || examQuestions.length === 0) return null;

  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const seconds = (timeLeft % 60).toString().padStart(2, '0');
  const progress = ((currentQuestionIndex + 1) / examQuestions.length) * 100;
  const roleDisplay = candidate.role?.charAt(0).toUpperCase() + candidate.role?.slice(1);

  return (
    <div className="container" id="candidate-exam-view">
      {/* WarningOverlay — always rendered so ref always attaches */}
      <WarningOverlay ref={warningOverlayRef} />

      {/* DOM fallback banner in case React ref isn't ready yet */}
      <div
        id="__warning_banner__"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99998,
          display: 'flex',
          justifyContent: 'center',
          padding: '0 16px',
          pointerEvents: 'none',
          opacity: 0,
          transform: 'translateY(-130%)',
          transition: 'transform 0.28s ease, opacity 0.28s ease',
        }}
      >
        <div style={{
          marginTop: 14,
          background: 'rgba(83,55,43,0.95)',
          color: '#fff',
          padding: '14px 28px',
          borderRadius: 10,
          fontSize: '1rem',
          fontWeight: 600,
          maxWidth: 640,
          width: '100%',
          textAlign: 'center',
        }} />
      </div>

      <div className="exam-container">
        <div className="card">
          <div className="exam-header" id="exam-header">
            <div style={{ flexGrow: 1 }}>
              <h2 id="exam-title">{roleDisplay} Assessment</h2>
              <p>Candidate: <span id="candidate-name">{candidate.name}</span></p>
            </div>
            <div className="exam-timer">
              <i className="fas fa-clock" /> <span id="time">{minutes}:{seconds}</span>
            </div>
            <div className="exam-progress-container">
              <div className="exam-progress-bar" id="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="exam-progress-text" id="progress-text">
              Question {currentQuestionIndex + 1} of {examQuestions.length}
            </div>
          </div>
          <div className="exam-body">
            <QuestionPanel
              question={examQuestions[currentQuestionIndex]}
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
              warnings={ps.current.totalWarnings}
              maxWarnings={PROCTOR_CONFIG.MAX_WARNINGS}
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
