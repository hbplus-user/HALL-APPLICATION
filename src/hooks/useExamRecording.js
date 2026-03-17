import { useRef, useCallback } from 'react';

export const useExamRecording = () => {
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const screenRecorderRef = useRef(null);
  const screenChunksRef = useRef([]);

  const startRecording = useCallback(async (stream) => {
    if (!stream) return false;
    try {
      recordedChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.start(1000);
      return true;
    } catch (e) {
      console.error('Recording start failed:', e);
      return false;
    }
  }, []);

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }
      mediaRecorderRef.current.onstop = () => {
        if (recordedChunksRef.current.length === 0) { resolve(null); return; }
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        resolve(blob);
      };
      mediaRecorderRef.current.stop();
    });
  }, []);

  const startScreenRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, audio: false
      });
      screenChunksRef.current = [];
      screenRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
      screenRecorderRef.current.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) screenChunksRef.current.push(e.data);
      };
      screenRecorderRef.current.start(1000);
      return true;
    } catch (e) {
      console.warn('Screen recording not permitted:', e);
      return false;
    }
  }, []);

  const stopScreenRecording = useCallback(() => {
    return new Promise((resolve) => {
      if (!screenRecorderRef.current || screenRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }
      screenRecorderRef.current.onstop = () => {
        if (screenChunksRef.current.length === 0) { resolve(null); return; }
        resolve(new Blob(screenChunksRef.current, { type: 'video/webm' }));
      };
      screenRecorderRef.current.stop();
    });
  }, []);

  return { startRecording, stopRecording, startScreenRecording, stopScreenRecording };
};
