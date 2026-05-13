import { useRef, useCallback, useEffect } from 'react';

export const useObjectDetection = ({ onPhoneDetected } = {}) => {
  const modelRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const consecutiveHitsRef = useRef(0); // require 2 consecutive detections to filter false positives

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
        // Removed 'book' and 'remote' — common household items, not cheating devices (Bug 4 fix)
        const phoneClasses = ['cell phone', 'laptop', 'tablet'];
        const detected = predictions.filter(p =>
          phoneClasses.includes(p.class) && p.score > 0.65
        );
        if (detected.length > 0) {
          consecutiveHitsRef.current += 1;
          // Require 2 consecutive detections before firing to suppress false positives (Bug 4 fix)
          if (consecutiveHitsRef.current >= 2 && onPhoneDetected) {
            onPhoneDetected(detected[0].class);
          }
        } else {
          consecutiveHitsRef.current = 0;
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
