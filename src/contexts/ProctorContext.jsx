import { createContext, useContext, useState, useCallback } from 'react';

const ProctorContext = createContext(null);
export const useProctor = () => useContext(ProctorContext);

const MAX_WARNINGS = 3;

// AI Risk Score weights
const calcRiskScore = (tabSwitches, phoneDetections, speakingViolations, warnings) => {
  const score = warnings * 20 + tabSwitches * 15 + phoneDetections * 25 + speakingViolations * 10;
  return Math.min(100, score);
};

export const ProctorProvider = ({ children }) => {
  const [warnings, setWarnings] = useState(0);
  const [warningTimestamps, setWarningTimestamps] = useState([]);
  const [proctoringSnapshots, setProctoringSnapshots] = useState([]);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [phoneDetections, setPhoneDetections] = useState(0);
  const [speakingViolations, setSpeakingViolations] = useState(0);
  const [currentActivity, setCurrentActivity] = useState('No suspicious activity detected');
  const [activityType, setActivityType] = useState('safe');
  const [disqualified, setDisqualified] = useState(false);
  const [disqualificationReason, setDisqualificationReason] = useState('');

  const riskScore = calcRiskScore(tabSwitches, phoneDetections, speakingViolations, warnings);

  const addWarning = useCallback((reason, examStartTimeMs, onMax) => {
    setWarnings(prev => {
      const next = prev + 1;
      if (next >= MAX_WARNINGS && onMax) {
        onMax(`Auto-disqualified: ${next} violations (${reason})`);
      }
      return next;
    });
    const timeInExam = examStartTimeMs ? Math.floor((Date.now() - examStartTimeMs) / 1000) : 0;
    setWarningTimestamps(prev => [...prev, { time: timeInExam, reason }]);
    setCurrentActivity(reason.replace(/_/g, ' '));
    setActivityType('warning');
  }, []);

  const addSnapshot = useCallback((snap) => {
    setProctoringSnapshots(prev => [...prev, snap]);
  }, []);

  const resetProctor = () => {
    setWarnings(0);
    setWarningTimestamps([]);
    setProctoringSnapshots([]);
    setTabSwitches(0);
    setPhoneDetections(0);
    setSpeakingViolations(0);
    setCurrentActivity('No suspicious activity detected');
    setActivityType('safe');
    setDisqualified(false);
    setDisqualificationReason('');
  };

  return (
    <ProctorContext.Provider value={{
      warnings, warningTimestamps, proctoringSnapshots,
      tabSwitches, setTabSwitches,
      phoneDetections, setPhoneDetections,
      speakingViolations, setSpeakingViolations,
      currentActivity, setCurrentActivity,
      activityType, setActivityType,
      disqualified, setDisqualified,
      disqualificationReason, setDisqualificationReason,
      riskScore, addWarning, addSnapshot, resetProctor, MAX_WARNINGS
    }}>
      {children}
    </ProctorContext.Provider>
  );
};
