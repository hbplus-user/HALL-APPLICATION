import { supabase } from './supabase';

// ── Live candidates: poll every 3s + realtime (no filter — avoids Supabase
//    realtime filter bugs with eq on non-indexed columns)
export const subscribeToLiveCandidates = (callback) => {
  const fetchLive = async () => {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .eq('status', 'in-progress');
    if (!error && data) callback(data);
  };

  fetchLive();

  // Poll every 3 seconds as reliable fallback for live data
  const pollInterval = setInterval(fetchLive, 3000);

  // Also subscribe to realtime for instant updates
  const sub = supabase
    .channel('live-candidates-channel')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'candidates' }, () => {
      fetchLive();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'candidates' }, () => {
      fetchLive();
    })
    .subscribe();

  return () => {
    clearInterval(pollInterval);
    supabase.removeChannel(sub);
  };
};

// ── WebRTC signaling via Supabase Broadcast ──────────────────────────────────

let webrtcChannel = null;
let channelReady = false;
let readyCallbacks = [];

const getWebrtcChannel = () => {
  if (!webrtcChannel) {
    channelReady = false;
    webrtcChannel = supabase.channel('webrtc-signaling');
    webrtcChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelReady = true;
        readyCallbacks.forEach(fn => fn());
        readyCallbacks = [];
      }
    });
  }
  return webrtcChannel;
};

// Resolves only after the channel is fully subscribed (safe to broadcast)
const whenReady = () => new Promise(resolve => {
  if (channelReady) return resolve();
  readyCallbacks.push(resolve);
  getWebrtcChannel(); // ensure channel is being created
  setTimeout(resolve, 3000); // fallback: don't hang forever
});

export const saveWebRTCOffer = async (candidateId, offer) => {
  await whenReady();
  await getWebrtcChannel().send({
    type: 'broadcast', event: 'offer',
    payload: { candidateId, offer }
  });
};

export const saveWebRTCAnswer = async (candidateId, answer) => {
  await whenReady();
  await getWebrtcChannel().send({
    type: 'broadcast', event: 'answer',
    payload: { candidateId, answer }
  });
};

export const subscribeToWebRTCAnswer = (candidateId, callback) => {
  const ch = getWebrtcChannel();
  const handler = (payload) => {
    if (payload.payload.candidateId === candidateId) callback({ answer: payload.payload.answer });
  };
  ch.on('broadcast', { event: 'answer' }, handler);
  return () => { };
};

export const requestWebRTCOffer = async (candidateId) => {
  await whenReady();
  await getWebrtcChannel().send({
    type: 'broadcast', event: 'request-offer',
    payload: { candidateId }
  });
};

export const subscribeToWebRTCRequest = (candidateId, callback) => {
  const ch = getWebrtcChannel();
  ch.on('broadcast', { event: 'request-offer' }, (payload) => {
    if (payload.payload.candidateId === candidateId) callback();
  });
  return () => { };
};

export const subscribeToWebRTCOffer = (candidateId, callback) => {
  const ch = getWebrtcChannel();
  ch.on('broadcast', { event: 'offer' }, (payload) => {
    if (payload.payload.candidateId === candidateId) callback({ offer: payload.payload.offer });
  });
  return () => { };
};

// ── Live frame broadcast (MJPEG-over-Broadcast fallback for WebRTC) ───────────
// Candidate sends a compressed JPEG frame every few seconds via Supabase Broadcast.
// Reliable across any network — no NAT/TURN issues like WebRTC.

let frameChannel = null;
const getFrameChannel = () => {
  if (!frameChannel) {
    frameChannel = supabase.channel('live-frames');
    frameChannel.subscribe();
  }
  return frameChannel;
};

export const broadcastLiveFrame = async (candidateId, dataUrl) => {
  try {
    await getFrameChannel().send({
      type: 'broadcast',
      event: 'live-frame',
      payload: { candidateId, frame: dataUrl },
    });
  } catch { /* non-fatal */ }
};

export const subscribeToLiveFrames = (candidateId, callback) => {
  const ch = getFrameChannel();
  ch.on('broadcast', { event: 'live-frame' }, (payload) => {
    if (payload.payload?.candidateId === candidateId) callback(payload.payload.frame);
  });
  return () => { };
};

// ── Admin command: write to DB so candidate's subscribeToCandidate picks it up
export const sendAdminCommand = async (candidateId, command) => {
  try {
    const { error } = await supabase
      .from('candidates')
      .update({ admin_command: command })
      .eq('id', candidateId);
    if (error) throw error;
  } catch (e) {
    console.error('sendAdminCommand error:', e);
    throw e;
  }
};