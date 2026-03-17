import { forwardRef, useImperativeHandle, useState } from 'react';

const WarningOverlay = forwardRef(function WarningOverlay(_, ref) {
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);

  useImperativeHandle(ref, () => ({
    show: (message) => {
      setText(message);
      setVisible(true);
      setTimeout(() => setVisible(false), 3000);
    }
  }));

  if (!visible) return null;

  return (
    <div className="warning-container" id="warning-container">
      <div className="warning-text" id="warning-text">
        <i className="fas fa-exclamation-triangle"></i> {text}
      </div>
    </div>
  );
});

export default WarningOverlay;
