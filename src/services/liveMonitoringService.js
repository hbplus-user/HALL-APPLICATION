import { supabase } from './supabase';

export const subscribeToLiveCandidates = (callback) => {
  const fetchLive = async () => {
    const { data } = await supabase.from('candidates').select('*').eq('status', 'in-progress');
    if (data) callback(data);
  };
  
  fetchLive();
  
  const sub = supabase
    .channel('public:live-candidates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates', filter: 'status=eq.in-progress' }, () => {
      fetchLive();
    })
    .subscribe();
    
  return () => supabase.removeChannel(sub);
};

export const getWebRTCSession = async (candidateId) => {
  return null;
};

// Singleton channel for WebRTC signaling
let webrtcChannel = null;
const getWebrtcChannel = () => {
  if (!webrtcChannel) {
    webrtcChannel = supabase.channel('public:webrtc');
    webrtcChannel.subscribe();
  }
  return webrtcChannel;
};

export const saveWebRTCOffer = async (candidateId, offer) => {
  await getWebrtcChannel().send({
    type: 'broadcast',
    event: 'offer',
    payload: { candidateId, offer }
  });
};

export const saveWebRTCAnswer = async (candidateId, answer) => {
  await getWebrtcChannel().send({
    type: 'broadcast',
    event: 'answer',
    payload: { candidateId, answer }
  });
};

export const subscribeToWebRTCAnswer = (candidateId, callback) => {
  const channel = getWebrtcChannel();
  channel.on('broadcast', { event: 'answer' }, (payload) => {
    if (payload.payload.candidateId === candidateId) {
      callback({ answer: payload.payload.answer });
    }
  });
  return () => {};
};

export const requestWebRTCOffer = async (candidateId) => {
  await getWebrtcChannel().send({
    type: 'broadcast',
    event: 'request-offer',
    payload: { candidateId }
  });
};

export const subscribeToWebRTCRequest = (candidateId, callback) => {
  const channel = getWebrtcChannel();
  channel.on('broadcast', { event: 'request-offer' }, (payload) => {
    if (payload.payload.candidateId === candidateId) {
      callback();
    }
  });
  return () => {};
};

export const subscribeToWebRTCOffer = (candidateId, callback) => {
  const channel = getWebrtcChannel();
  channel.on('broadcast', { event: 'offer' }, (payload) => {
    if (payload.payload.candidateId === candidateId) {
      callback({ offer: payload.payload.offer });
    }
  });
  return () => {};
};

export const cleanupWebRTCSession = async (candidateId) => {
  // Cleanup happens automatically when channels unsubscribe
};

export const sendAdminCommand = async (candidateId, command) => {
  try {
    await supabase.from('candidates').update({ admin_command: command }).eq('id', candidateId);
  } catch (e) {
    console.error('Error sending admin command:', e);
  }
};
