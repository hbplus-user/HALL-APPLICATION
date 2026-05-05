import { useState, useEffect, useRef } from 'react';
import {
  subscribeToLiveCandidates,
  subscribeToWebRTCOffer,
  saveWebRTCAnswer,
  sendAdminCommand,
  requestWebRTCOffer,
} from '../../services/liveMonitoringService';
import { showNotification } from '../common/NotificationSystem';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcRisk(c) {
  return Math.min(100,
    (c.warning_count || c.warningCount || 0) * 20 +
    (c.tab_switches || c.tabSwitches || 0) * 15 +
    (c.phone_detections || c.phoneDetections || 0) * 25 +
    (c.speaking_violations || c.speakingViolations || 0) * 10
  );
}

function riskMeta(score) {
  if (score >= 61) return { label: 'HIGH', bg: '#dc2626', text: '#fff' };
  if (score >= 31) return { label: 'MED', bg: '#f59e0b', text: '#000' };
  return { label: 'LOW', bg: '#16a34a', text: '#fff' };
}

function elapsed(startVal) {
  if (!startVal) return '—';
  // Handle ISO string or numeric ms
  const ms = typeof startVal === 'number' ? startVal : new Date(startVal).getTime();
  if (!ms || isNaN(ms)) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function timeLeft(startVal, totalSecs = 1800) {
  if (!startVal) return '—';
  const ms = typeof startVal === 'number' ? startVal : new Date(startVal).getTime();
  if (!ms || isNaN(ms)) return '—';
  const elapsed = Math.floor((Date.now() - ms) / 1000);
  const remaining = Math.max(0, totalSecs - elapsed);
  const m = Math.floor(remaining / 60).toString().padStart(2, '0');
  const s = (remaining % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Live Video Cell ──────────────────────────────────────────────────────────

function LiveVideoCell({ candidateId, snapshotUrl }) {
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const [hasStream, setHasStream] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    let unsubWrtc;
    (async () => {
      try {
        peerRef.current = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
        peerRef.current.ontrack = (e) => {
          if (videoRef.current && e.streams?.[0]) {
            videoRef.current.srcObject = e.streams[0];
            setHasStream(true);
          }
        };
        unsubWrtc = subscribeToWebRTCOffer(candidateId, async (session) => {
          if (session.offer && peerRef.current && !peerRef.current.remoteDescription) {
            await peerRef.current.setRemoteDescription(new RTCSessionDescription(session.offer));
            const answer = await peerRef.current.createAnswer();
            await peerRef.current.setLocalDescription(answer);
            await new Promise(r => setTimeout(r, 500));
            await saveWebRTCAnswer(candidateId, {
              type: peerRef.current.localDescription.type,
              sdp: peerRef.current.localDescription.sdp
            });
          }
        });
        await requestWebRTCOffer(candidateId);
      } catch {
        // WebRTC unavailable — snapshot fallback shown below
      }
    })();
    return () => {
      if (unsubWrtc) unsubWrtc();
      if (peerRef.current) peerRef.current.close();
    };
  }, [candidateId]);

  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '16/9',
      background: '#0f172a', borderRadius: 10, overflow: 'hidden',
    }}>
      <video
        ref={videoRef} autoPlay playsInline muted={isMuted}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: hasStream ? 'block' : 'none' }}
      />
      {!hasStream && snapshotUrl && (
        <img src={snapshotUrl} alt="Last snapshot"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {!hasStream && !snapshotUrl && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', color: '#475569', gap: 6,
        }}>
          <i className="fas fa-video-slash" style={{ fontSize: '1.8rem' }} />
          <span style={{ fontSize: '0.75rem' }}>No feed</span>
        </div>
      )}
      {/* LIVE badge */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        background: 'rgba(220,38,38,0.9)', color: '#fff',
        fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4,
        letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 4, zIndex: 10,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: '#fff',
          animation: 'livePulse 1.2s infinite', display: 'inline-block',
        }} />
        LIVE
      </div>
      {hasStream && (
        <button
          onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
          style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
            borderRadius: '50%', width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 10,
          }}
        >
          <i className={`fas fa-volume-${isMuted ? 'mute' : 'up'}`}
            style={{ fontSize: '0.8rem', color: isMuted ? '#f87171' : '#fff' }} />
        </button>
      )}
    </div>
  );
}

// ─── Violation Timeline ───────────────────────────────────────────────────────

function ViolationTimeline({ timestamps }) {
  if (!timestamps?.length) return null;
  const recent = [...timestamps].reverse().slice(0, 5);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Violation Timeline
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {recent.map((ts, i) => {
          const m = Math.floor(ts.time / 60).toString().padStart(2, '0');
          const s = (ts.time % 60).toString().padStart(2, '0');
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.73rem', color: '#374151',
              background: '#fef3c7', borderRadius: 4, padding: '2px 7px',
            }}>
              <i className="fas fa-flag" style={{ color: '#b45309', fontSize: '0.65rem' }} />
              <span style={{ fontWeight: 600, minWidth: 35 }}>{m}:{s}</span>
              <span style={{ color: '#6b7280' }}>{ts.reason?.replace(/_/g, ' ')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Candidate Card ───────────────────────────────────────────────────────────

function CandidateCard({ candidate, onViewDetails, tick }) {
  const [sending, setSending] = useState(false);
  const risk = calcRisk(candidate);
  const meta = riskMeta(risk);

  // Support both snake_case (from DB) and camelCase (from mapped frontend)
  const currentQ = candidate.current_question_index ?? candidate.currentQuestionIndex ?? 0;
  const totalQ = candidate.total_questions ?? candidate.totalQuestions ?? 0;
  const warnCount = candidate.warning_count ?? candidate.warningCount ?? 0;
  const tabSw = candidate.tab_switches ?? candidate.tabSwitches ?? 0;
  const phoneDet = candidate.phone_detections ?? candidate.phoneDetections ?? 0;
  const speakViol = candidate.speaking_violations ?? candidate.speakingViolations ?? 0;
  const snapshots = candidate.proctoring_snapshots ?? candidate.proctoringSnapshots ?? [];
  const warnTs = candidate.warning_timestamps ?? candidate.warningTimestamps ?? [];
  const startTime = candidate.exam_start_time ?? candidate.examStartTime;
  const selectedAns = candidate.selected_answer ?? candidate.selectedAnswer;

  const lastSnap = snapshots.slice(-1)[0]?.url;
  const avatarSrc = candidate.photo || candidate.photo_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(candidate.name || candidate.email)}&background=4361ee&color=fff&size=64`;

  const elapsedStr = elapsed(startTime);
  const remainingStr = timeLeft(startTime, 1800);
  const progressPct = totalQ > 0 ? ((currentQ + 1) / totalQ) * 100 : 0;

  const doCommand = async (cmd) => {
    setSending(true);
    try {
      await sendAdminCommand(candidate.id, cmd);
      showNotification(`"${cmd}" sent to ${candidate.name || candidate.email}`, 'success');
    } catch (e) {
      showNotification('Failed to send command: ' + e.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const cardBorder = risk >= 61 ? '2px solid #dc2626' : risk >= 31 ? '2px solid #f59e0b' : '1px solid var(--border)';

  return (
    <div style={{
      border: cardBorder, borderRadius: 14, background: 'white',
      boxShadow: risk >= 61 ? '0 4px 20px rgba(220,38,38,0.15)' : '0 4px 12px rgba(0,0,0,0.07)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        background: risk >= 61 ? '#fef2f2' : risk >= 31 ? '#fffbeb' : '#f0fdf4',
        borderBottom: '1px solid var(--border)',
      }}>
        <img src={avatarSrc} alt={candidate.name}
          style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {candidate.name || candidate.email}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
            {candidate.role} &nbsp;·&nbsp; ⏱ {elapsedStr} elapsed
          </div>
        </div>
        <div style={{
          background: meta.bg, color: meta.text,
          borderRadius: 8, padding: '4px 10px',
          fontSize: '0.75rem', fontWeight: 800, flexShrink: 0,
        }}>
          {meta.label} {risk}/100
        </div>
      </div>

      {/* Live video */}
      <div style={{ padding: '10px 14px 0' }}>
        <LiveVideoCell candidateId={candidate.id} snapshotUrl={lastSnap} />
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6,
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
      }}>
        {[
          { icon: 'exclamation-triangle', color: '#dc2626', label: 'Warnings', value: `${warnCount}/3` },
          { icon: 'exchange-alt', color: '#7c3aed', label: 'Tab Switch', value: tabSw },
          { icon: 'mobile-alt', color: '#b45309', label: 'Phone', value: phoneDet },
          { icon: 'microphone', color: '#0369a1', label: 'Speaking', value: speakViol },
        ].map(stat => (
          <div key={stat.label} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 8, padding: '6px 2px' }}>
            <i className={`fas fa-${stat.icon}`} style={{ color: stat.color, fontSize: '0.85rem' }} />
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111', marginTop: 2 }}>{stat.value}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--gray)', lineHeight: 1.2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Question progress — key section */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: '0.82rem', color: '#374151' }}>
            📋 Question <strong>{currentQ + 1}</strong> / <strong>{totalQ || '?'}</strong>
          </span>
          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
            ⏰ {remainingStr} left
          </span>
        </div>
        {selectedAns != null && (
          <div style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>
            ✅ Option {selectedAns} selected
          </div>
        )}
        {/* Progress bar */}
        <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6 }}>
          <div style={{
            height: '100%', borderRadius: 4, background: '#4361ee',
            width: `${progressPct}%`, transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 3, textAlign: 'right' }}>
          {Math.round(progressPct)}% complete
        </div>
      </div>

      {/* Violation timeline */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
        <ViolationTimeline timestamps={warnTs} />
        {!warnTs.length && (
          <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>No violations recorded yet</span>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-primary" style={{ fontSize: '0.75rem' }}
          onClick={() => onViewDetails(candidate)}>
          <i className="fas fa-eye" /> View
        </button>
        <button className="btn btn-sm btn-success" style={{ fontSize: '0.75rem' }}
          disabled={sending} onClick={async () => {
            setSending(true);
            try {
              const { updateCandidateData } = await import('../../services/candidateService');
              await updateCandidateData(candidate.id, { status: 'qualified' });
              showNotification(`Qualified ${candidate.name}`, 'success');
            } catch (e) { showNotification('Error: ' + e.message, 'error'); }
            finally { setSending(false); }
          }}>
          <i className="fas fa-check" /> Qualify
        </button>
        <button className="btn btn-sm"
          style={{ fontSize: '0.75rem', background: '#f59e0b', color: '#000', border: 'none' }}
          disabled={sending} onClick={() => doCommand('warn')}>
          ⚠️ Warn
        </button>
        <button className="btn btn-sm"
          style={{ fontSize: '0.75rem', background: '#7c3aed', color: '#fff', border: 'none' }}
          disabled={sending} onClick={() => doCommand('force-submit')}>
          📤 Submit
        </button>
        <button className="btn btn-sm btn-danger" style={{ fontSize: '0.75rem' }}
          disabled={sending} onClick={() => doCommand('disqualify')}>
          ❌ DQ
        </button>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function LiveMonitoringTab({ onViewCandidate }) {
  const [liveCandidates, setLiveCandidates] = useState([]);
  const [sortBy, setSortBy] = useState('risk');
  const [filterRisk, setFilterRisk] = useState('all');
  const [tick, setTick] = useState(0);

  // Re-render every second for elapsed/remaining timers
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsub = subscribeToLiveCandidates(setLiveCandidates);
    return unsub;
  }, []);

  const enriched = liveCandidates.map(c => ({ ...c, _risk: calcRisk(c) }));

  const filtered = enriched.filter(c => {
    if (filterRisk === 'high') return c._risk >= 61;
    if (filterRisk === 'medium') return c._risk >= 31 && c._risk < 61;
    if (filterRisk === 'low') return c._risk < 31;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'risk') return b._risk - a._risk;
    if (sortBy === 'name') return (a.name || a.email).localeCompare(b.name || b.email);
    return 0;
  });

  const highRiskCount = enriched.filter(c => c._risk >= 61).length;

  return (
    <div>
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', background: '#dc2626',
            display: 'inline-block', animation: 'livePulse 1.2s infinite',
          }} />
          <h3 style={{ margin: 0 }}>Live Monitoring</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
          <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 20, padding: '3px 12px', fontSize: '0.8rem', fontWeight: 600 }}>
            {liveCandidates.length} Active
          </span>
          {highRiskCount > 0 && (
            <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 20, padding: '3px 12px', fontSize: '0.8rem', fontWeight: 600 }}>
              🔴 {highRiskCount} High Risk
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}>
            <option value="all">All Risk Levels</option>
            <option value="high">🔴 High Risk</option>
            <option value="medium">🟡 Medium Risk</option>
            <option value="low">🟢 Low Risk</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}>
            <option value="risk">Sort: Risk ↓</option>
            <option value="name">Sort: Name A–Z</option>
          </select>
        </div>
      </div>

      {liveCandidates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--gray)' }}>
          <i className="fas fa-video" style={{ fontSize: '3rem', opacity: 0.3 }} />
          <p style={{ marginTop: 12, fontSize: '1.05rem', fontWeight: 500 }}>No live exams in progress</p>
          <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Cards appear here in real-time when an exam starts.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray)' }}>
          <p>No candidates match the current filter.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 18 }}>
          {sorted.map(c => (
            <CandidateCard
              key={c.id}
              candidate={c}
              onViewDetails={onViewCandidate}
              tick={tick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
