import { createContext, useContext, useState, useRef } from 'react';

const ExamContext = createContext(null);
export const useExam = () => useContext(ExamContext);

export const ExamProvider = ({ children }) => {
  const [candidate, setCandidate] = useState(null);
  const [examQuestions, setExamQuestions] = useState([]);
  const [candidateAnswers, setCandidateAnswers] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const [examInProgress, setExamInProgress] = useState(false);
  const [examStartTimeMs, setExamStartTimeMs] = useState(0);
  const [sessionStartIndex, setSessionStartIndex] = useState(0);
  const timerRef = useRef(null);

  const startTimer = (onTimeout) => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const resetExam = () => {
    setExamQuestions([]);
    setCandidateAnswers([]);
    setCurrentQuestionIndex(0);
    setTimeLeft(30 * 60);
    setExamInProgress(false);
    setExamStartTimeMs(0);
    setSessionStartIndex(0);
    stopTimer();
  };

  const selectAnswer = (questionIndex, answer) => {
    setCandidateAnswers(prev => {
      const updated = [...prev];
      updated[questionIndex] = answer;
      return updated;
    });
  };

  return (
    <ExamContext.Provider value={{
      candidate, setCandidate,
      examQuestions, setExamQuestions,
      candidateAnswers, setCandidateAnswers,
      currentQuestionIndex, setCurrentQuestionIndex,
      timeLeft, setTimeLeft,
      examInProgress, setExamInProgress,
      examStartTimeMs, setExamStartTimeMs,
      sessionStartIndex, setSessionStartIndex,
      startTimer, stopTimer, resetExam, selectAnswer
    }}>
      {children}
    </ExamContext.Provider>
  );
};
