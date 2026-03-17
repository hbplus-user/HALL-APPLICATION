import { useState, useEffect } from 'react';

let setVisible = null;
export const showLoader = () => setVisible && setVisible(true);
export const hideLoader = () => setVisible && setVisible(false);

export default function LoadingOverlay() {
  const [visible, _setVisible] = useState(false);

  useEffect(() => {
    setVisible = _setVisible;
    return () => { setVisible = null; };
  }, []);

  if (!visible) return null;

  return (
    <div className="loading-overlay" style={{ display: 'flex' }}>
      <svg id="loading-logo" width="150" height="80" viewBox="0 0 150 80">
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
          fontFamily="'The Seasons', Tahoma, sans-serif" fontSize="60" fontWeight="bold" fill="#000000">
          HB+
        </text>
      </svg>
    </div>
  );
}
