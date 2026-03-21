import { forwardRef, useImperativeHandle, useState, useCallback } from 'react';

const WarningOverlay = forwardRef(function WarningOverlay(_, ref) {
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = { current: null };

  const show = useCallback((message) => {
    setText(message);
    setVisible(true);
    // Clear any existing hide timer
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 4000);
  }, []);

  // Expose show() to parent via ref
  useImperativeHandle(ref, () => ({ show }), [show]);

  const isMainWarning = text.includes('WARNING') && !text.includes('Strike');
  const isDanger = text.includes('🚨');
  const bg = isDanger ? 'rgba(159,64,34,0.97)'
    : isMainWarning ? 'rgba(120,80,20,0.97)'
      : 'rgba(83,55,43,0.95)';

  return (
    // Always in the DOM — never returns null — so the ref always attaches
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 16px',
        pointerEvents: visible ? 'auto' : 'none',
        transform: visible ? 'translateY(0)' : 'translateY(-130%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease',
      }}
    >
      <div
        style={{
          marginTop: 14,
          background: bg,
          color: '#fff',
          padding: '14px 28px',
          borderRadius: 10,
          fontSize: '1rem',
          fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          maxWidth: 640,
          width: '100%',
          textAlign: 'center',
          lineHeight: 1.5,
        }}
      >
        {text}
      </div>
    </div>
  );
});

export default WarningOverlay;
