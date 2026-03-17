export default function QuestionPanel({
  question, questionIndex, totalQuestions, selectedAnswer,
  onOptionSelect, onPrev, onNext, canGoPrev, canGoNext, onSubmit
}) {
  if (!question) return null;

  return (
    <div className="question-container">
      <div className="question-text" id="question-text">
        {question.text}
      </div>
      <ul className="options-list" id="options-list">
        {question.options.map((opt, i) => (
          <li
            key={i}
            className={`option-item ${selectedAnswer === (i + 1) ? 'selected' : ''}`}
            data-option={i + 1}
            onClick={() => onOptionSelect(i + 1)}
          >
            {opt}
          </li>
        ))}
      </ul>
      <div className="nav-buttons">
        <button
          className="btn btn-primary"
          id="prev-question"
          disabled={!canGoPrev}
          onClick={onPrev}
        >
          <i className="fas fa-arrow-left"></i> Previous
        </button>
        {canGoNext ? (
          <button
            className="btn btn-primary"
            id="next-question"
            onClick={onNext}
          >
            Next <i className="fas fa-arrow-right"></i>
          </button>
        ) : (
          <button
            className="btn btn-success"
            id="submit-exam-btn"
            onClick={onSubmit}
          >
            <i className="fas fa-check"></i> Submit Exam
          </button>
        )}
      </div>
    </div>
  );
}
