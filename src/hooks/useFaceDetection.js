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

  const analyzeFaceResult = useCallback((result) => {
    if (!result) return { faceCount: 0, isLookingAway: false, mouthOpen: false };

    const faceCount = result.faceLandmarks?.length ?? 0;
    let isLookingAway = false;
    let mouthOpen = false;

    if (faceCount > 0 && result.faceBlendshapes?.[0]) {
      const shapes = result.faceBlendshapes[0].categories;
      const get = (name) => shapes.find(s => s.categoryName === name)?.score ?? 0;

      const headYaw = result.faceLandmarks[0];
      // Simple gaze check using nose tip vs face width
      if (headYaw) {
        const noseTip = headYaw[4];
        if (noseTip && (noseTip.x < 0.2 || noseTip.x > 0.8)) isLookingAway = true;
      }

      const mouthOpenScore = (get('mouthOpen') + get('jawOpen')) / 2;
      mouthOpen = mouthOpenScore > 0.3;
    }

    return { faceCount, isLookingAway, mouthOpen };
  }, []);

  return { initFaceDetection, detectFaces, analyzeFaceResult };
};
