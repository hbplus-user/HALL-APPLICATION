import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExam } from '../../contexts/ExamContext';
import { uploadCandidatePhoto } from '../../services/storageService';
import { setCandidateData } from '../../services/candidateService';
import { showNotification } from '../../components/common/NotificationSystem';
import { showLoader, hideLoader } from '../../components/common/LoadingOverlay';

export default function PhotoCapturePage() {
  const { candidate, setCandidate } = useExam();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const usePhotoRef = useRef(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    if (!candidate) { navigate('/'); return; }
    startCamera();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraReady(true);
      }
    } catch {
      showNotification('Camera access denied. Please enable camera permissions.', 'error');
    }
  };

  const capturePhoto = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedPhoto(dataUrl);
    // Auto-proceed after a brief 1.5s preview
    setTimeout(() => usePhotoRef.current?.(dataUrl), 1500);
  };

  const retake = () => setCapturedPhoto(null);

  const usePhoto = async (photoDataUrl) => {
    const photo = photoDataUrl || capturedPhoto;
    if (!photo || !candidate) return;
    showLoader();
    try {
      const result = await uploadCandidatePhoto(photo, candidate.id);
      const photoUrl = result?.url || photo;
      await setCandidateData(candidate.id, { photo: photoUrl });
      setCandidate(prev => ({ ...prev, photo: photoUrl }));
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      navigate('/exam/instructions');
    } catch {
      showNotification('Failed to save photo. Continuing...', 'warning');
      navigate('/exam/instructions');
    } finally {
      hideLoader();
    }
  };
  // Keep ref in sync so setTimeout can call latest version
  usePhotoRef.current = usePhoto;

  return (
    <div className="container" id="photo-capture-view">
      <div className="photo-approval-container" style={{ overflowY: 'auto', maxHeight: '95vh' }}>
        <div className="login-header">
          <h1>Identity Verification</h1>
          <p>Please capture your photo for identity verification</p>
        </div>
        <div className="photo-approval-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingBottom: 24 }}>
          <div className="camera-container">
            {capturedPhoto ? (
              <img src={capturedPhoto} className="captured-photo" alt="Captured" />
            ) : (
              <>
                <video ref={videoRef} id="camera-preview" autoPlay playsInline />
                {!cameraReady && (
                  <div className="camera-placeholder" id="camera-placeholder">
                    <i className="fas fa-camera" style={{ fontSize: '2.5rem', marginBottom: 10 }}></i>
                    <p>Camera feed will appear here</p>
                  </div>
                )}
              </>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} id="photo-canvas" />
          </div>

          {/* Confirmation message */}
          {capturedPhoto && (
            <div id="confirmation-message" className="confirmation-message" style={{ display: 'block' }}>
              <i className="fas fa-check-circle"></i> Photo captured. Proceeding automatically...
            </div>
          )}

          {/* Show capture button OR captured photo — no manual proceed button */}
          {!capturedPhoto ? (
            <div className="capture-btn" id="capture-btn" onClick={capturePhoto}>
              <i className="fas fa-camera"></i>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
