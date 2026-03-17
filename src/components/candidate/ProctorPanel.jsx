import { useEffect, useRef } from 'react';

export default function ProctorPanel({ videoRef, warnings, maxWarnings, currentActivity, activityType, onAudioBarsReady }) {
  const audioBarRefs = useRef([]);

  useEffect(() => {
    if (onAudioBarsReady && audioBarRefs.current.length > 0) {
      onAudioBarsReady(audioBarRefs.current.filter(Boolean));
    }
  }, [onAudioBarsReady]);

  return (
    <div className="proctoring-panel" id="proctoring-panel">
      <h3>Proctoring Monitor</h3>
      <div className="camera-feed">
        <div className="gaze-detection-overlay"><span></span></div>
        <video ref={videoRef} id="exam-camera" autoPlay playsInline />
        <div className="camera-placeholder" id="exam-camera-placeholder">
          <i className="fas fa-camera"></i>
          <p>Proctoring camera is active</p>
        </div>
      </div>

      <div className="audio-visualizer" id="audio-visualizer">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="audio-bar"
            ref={el => audioBarRefs.current[i] = el}
          />
        ))}
      </div>

      <div className="proctoring-stats">
        <div className="proctor-stat">
          <h4><i className="fas fa-exclamation-triangle"></i> Warnings</h4>
          <p><span className="warning-badge" id="warning-count">{warnings}</span> of {maxWarnings}</p>
        </div>
        <div className="proctor-stat">
          <h4><i className="fas fa-eye"></i> Focus</h4>
          <p>
            <span className={`focus-indicator ${activityType === 'safe' ? 'good' : 'warning'}`} id="focus-indicator"></span>
            <span id="focus-status">{activityType === 'safe' ? 'Good' : 'Alert'}</span>
          </p>
        </div>
        <div className="proctor-stat">
          <h4><i className="fas fa-microphone"></i> Microphone</h4>
          <p><span id="mic-status">Listening...</span></p>
        </div>
        <div className="proctor-stat">
          <h4><i className="fas fa-mouse-pointer"></i> Cursor</h4>
          <p><span id="cursor-status">In Window</span></p>
        </div>
      </div>

      <div className={`activity-log ${activityType}`} id="activity-log">
        {activityType === 'safe'
          ? <><i className="fas fa-check-circle"></i> {currentActivity}</>
          : <><i className="fas fa-exclamation-circle"></i> {currentActivity}</>
        }
      </div>
    </div>
  );
}
