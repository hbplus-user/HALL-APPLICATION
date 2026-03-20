import { useRef, useCallback } from 'react';

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const useFaceDetection = () => {
  const faceLandmarkerRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  const initFaceDetection = useCallback(async () => {
    try {
      const { FaceLandmarker, FilesetResolver } = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm'
      );
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        outputFaceBlendshapes: true,
      });
      return true;
    } catch (e) {
      console.error('Face detection init failed:', e);
      return false;
    }
  }, []);

  const detectFaces = useCallback((videoEl) => {
    if (!faceLandmarkerRef.current || !videoEl || videoEl.readyState < 2) return null;
    const time = videoEl.currentTime;
    if (time === lastVideoTimeRef.current) return null;
    lastVideoTimeRef.current = time;
    try {
      return faceLandmarkerRef.current.detectForVideo(videoEl, Date.now());
    } catch (e) {
      return null;
    }
  }, []);

  const analyzeFaceResult = (results) => {
    if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) {
      return { faceCount: 0, isLookingAway: false, isHeadTurned: false };
    }

    const faceCount = results.faceLandmarks.length;
    if (faceCount > 1) {
      return { faceCount, isLookingAway: false, isHeadTurned: false };
    }

    const landmarks = results.faceLandmarks[0];

    // 1. Head Turn Calculation (from old script)
    const nose = landmarks[1].x;
    const leftCorner = landmarks[130].x;
    const rightCorner = landmarks[359].x;
    const faceWidth = rightCorner - leftCorner;
    const headRatio = (nose - leftCorner) / faceWidth;

    // Threshold from old PROCTOR_CONFIG (0.15)
    const isHeadTurned = headRatio < 0.15 || headRatio > 0.85;

    // 2. Gaze Calculation (from old script)
    const leftIris = landmarks[473];
    const rightIris = landmarks[468];
    const irisAvgX = (leftIris.x + rightIris.x) / 2;
    const gazeRatio = (irisAvgX - leftCorner) / faceWidth;

    // Threshold from old PROCTOR_CONFIG (0.35)
    const isLookingAway = gazeRatio < 0.35 || gazeRatio > 0.65;

    return { faceCount, isLookingAway, isHeadTurned };
  };

  return { initFaceDetection, detectFaces, analyzeFaceResult };
};
