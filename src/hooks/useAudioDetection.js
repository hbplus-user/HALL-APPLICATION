import { useRef, useCallback } from 'react';

export const useAudioDetection = ({ onSpeechDetected } = {}) => {
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animFrameRef = useRef(null);
  const barsRef = useRef([]);
  const lastSpeechTimeRef = useRef(0);

  const initAudio = useCallback(async (stream) => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      return true;
    } catch (e) {
      console.error('Audio init failed:', e);
      return false;
    }
  }, []);

  const startVisualizer = useCallback((barEls) => {
    barsRef.current = barEls;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      if (!analyserRef.current || !dataArrayRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      const avg = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;

      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const val = dataArrayRef.current[i * 4] || 0;
        bar.style.height = `${Math.max(4, val / 2)}px`;
      });

      // Detect sustained speech
      if (avg > 30) {
        const now = Date.now();
        if (now - lastSpeechTimeRef.current > 3000 && onSpeechDetected) {
          lastSpeechTimeRef.current = now;
          onSpeechDetected();
        }
      }
    };
    animate();
  }, [onSpeechDetected]);

  const stopAudio = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  return { initAudio, startVisualizer, stopAudio };
};
