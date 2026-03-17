import { useRef, useCallback, useEffect } from 'react';

export const useObjectDetection = ({ onPhoneDetected } = {}) => {
  const modelRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  const initObjectDetection = useCallback(async () => {
    try {
      // cocoSsd is loaded globally via script tag in index.html
      if (typeof window.cocoSsd !== 'undefined') {
        modelRef.current = await window.cocoSsd.load();
        return true;
      }
      return false;
    } catch (e) {
      console.error('COCO-SSD init failed:', e);
      return false;
    }
  }, []);

  const startDetection = useCallback((videoEl) => {
    if (!modelRef.current || !videoEl) return;

    detectionIntervalRef.current = setInterval(async () => {
      if (videoEl.readyState < 2) return;
      try {
        const predictions = await modelRef.current.detect(videoEl);
        const phoneClasses = ['cell phone', 'remote', 'laptop', 'book', 'tablet'];
        const detected = predictions.filter(p =>
          phoneClasses.includes(p.class) && p.score > 0.6
        );
        if (detected.length > 0 && onPhoneDetected) {
          onPhoneDetected(detected[0].class);
        }
      } catch (e) {
        // Silently handle detection errors
      }
    }, 5000);
  }, [onPhoneDetected]);

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopDetection(), [stopDetection]);

  return { initObjectDetection, startDetection, stopDetection };
};
