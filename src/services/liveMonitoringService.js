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
const getWebrtcChannel = () => {
  if (!webrtcChannel) {
    webrtcChannel = supabase.channel('webrtc-signaling');
    webrtcChannel.subscribe();
  }
  return webrtcChannel;
};

export const saveWebRTCOffer = async (candidateId, offer) => {
  await getWebrtcChannel().send({
    type: 'broadcast', event: 'offer',
    payload: { candidateId, offer }
  });
};

export const saveWebRTCAnswer = async (candidateId, answer) => {
  await getWebrtcChannel().send({
    type: 'broadcast', event: 'answer',
    payload: { candidateId, answer }
  });
};

export const subscribeToWebRTCAnswer = (candidateId, callback) => {
  getWebrtcChannel().on('broadcast', { event: 'answer' }, (payload) => {
    if (payload.payload.candidateId === candidateId) callback({ answer: payload.payload.answer });
  });
  return () => { };
};

export const requestWebRTCOffer = async (candidateId) => {
  await getWebrtcChannel().send({
    type: 'broadcast', event: 'request-offer',
    payload: { candidateId }
  });
};

export const subscribeToWebRTCRequest = (candidateId, callback) => {
  getWebrtcChannel().on('broadcast', { event: 'request-offer' }, (payload) => {
    if (payload.payload.candidateId === candidateId) callback();
  });
  return () => { };
};

export const subscribeToWebRTCOffer = (candidateId, callback) => {
  getWebrtcChannel().on('broadcast', { event: 'offer' }, (payload) => {
    if (payload.payload.candidateId === candidateId) callback({ offer: payload.payload.offer });
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