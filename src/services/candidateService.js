import { supabase } from './supabase';

const TABLE = 'candidates';

const mapToFrontend = (c) => {
  if (!c) return null;
  return {
    ...c,
    subRole: c.sub_role,
    tokenId: c.token_id,
    photoUrl: c.photo_url,
    currentQuestionIndex: c.current_question_index,
    examQuestions: c.exam_questions,
    candidateAnswers: c.candidate_answers,
    examStartTime: c.exam_start_time,
    examEndTime: c.exam_end_time,
    disqualificationReason: c.disqualification_reason,
    warningCount: c.warning_count,
    phoneDetections: c.phone_detections,
    speakingViolations: c.speaking_violations,
    tabSwitches: c.tab_switches,
    recordingUrl: c.recording_url,
    recordingPath: c.recording_path,
    videoTimestamps: c.video_timestamps,
    proctoringSnapshots: c.proctoring_snapshots,
  };
};

const mapToDb = (c) => {
  const payload = {};
  if (c.email !== undefined) payload.email = c.email;
  if (c.name !== undefined) payload.name = c.name;
  if (c.role !== undefined) payload.role = c.role;
  if (c.subRole !== undefined) payload.sub_role = c.subRole;
  if (c.status !== undefined) payload.status = c.status;
  if (c.tokenId !== undefined) payload.token_id = c.tokenId;
  if (c.photoUrl !== undefined) payload.photo_url = c.photoUrl;
  if (c.score !== undefined) payload.score = c.score;
  if (c.currentQuestionIndex !== undefined) payload.current_question_index = c.currentQuestionIndex;
  if (c.examQuestions !== undefined) payload.exam_questions = c.examQuestions;
  if (c.candidateAnswers !== undefined) payload.candidate_answers = c.candidateAnswers;
  
  if (c.examStartTime !== undefined) payload.exam_start_time = c.examStartTime;
  if (c.exam_start_time !== undefined) payload.exam_start_time = c.exam_start_time; // Fallback if already snake
  
  if (c.examEndTime !== undefined) payload.exam_end_time = c.examEndTime;
  if (c.exam_end_time !== undefined) payload.exam_end_time = c.exam_end_time;
  
  if (c.disqualificationReason !== undefined) payload.disqualification_reason = c.disqualificationReason;
  if (c.warningCount !== undefined) payload.warning_count = c.warningCount;
  if (c.phoneDetections !== undefined) payload.phone_detections = c.phoneDetections;
  if (c.speakingViolations !== undefined) payload.speaking_violations = c.speakingViolations;
  if (c.tabSwitches !== undefined) payload.tab_switches = c.tabSwitches;
  if (c.recordingUrl !== undefined) payload.recording_url = c.recordingUrl;
  if (c.recordingPath !== undefined) payload.recording_path = c.recordingPath;
  if (c.videoTimestamps !== undefined) payload.video_timestamps = c.videoTimestamps;
  if (c.video_timestamps !== undefined) payload.video_timestamps = c.video_timestamps;
  if (c.proctoringSnapshots !== undefined) payload.proctoring_snapshots = c.proctoringSnapshots;
  if (c.proctoring_snapshots !== undefined) payload.proctoring_snapshots = c.proctoring_snapshots;
  return payload;
};

export const getCandidates = async () => {
  try {
    const { data, error } = await supabase.from(TABLE).select('*').order('exam_start_time', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapToFrontend);
  } catch (e) {
    console.error('Error fetching candidates:', e);
    return [];
  }
};

export const findCandidateByEmail = async (email) => {
  try {
    const { data, error } = await supabase.from(TABLE).select('*').eq('email', email).order('exam_start_time', { ascending: false }).limit(1).single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return mapToFrontend(data);
  } catch (e) {
    console.error('Error finding candidate:', e);
    return null;
  }
};

export const getCandidateById = async (id) => {
  try {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return mapToFrontend(data);
  } catch (e) {
    console.error('Error getting candidate by ID:', e);
    return null;
  }
};

export const setCandidateData = async (candidateId, candidateData) => {
  try {
    let payload = mapToDb(candidateData);
    
    // UUID format check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (candidateId && uuidRegex.test(candidateId)) {
        payload.id = candidateId;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    return mapToFrontend(data);
  } catch (e) {
    console.error('Error setting candidate data:', e);
    return null;
  }
};

export const updateCandidateData = async (candidateId, updateData) => {
  try {
    if (!candidateId) return false;
    let payload = mapToDb(updateData);
    const { error } = await supabase.from(TABLE).update(payload).eq('id', candidateId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Error updating candidate data:', e);
    return false;
  }
};

export const deleteCandidates = async (ids) => {
  try {
    const { error } = await supabase.from(TABLE).delete().in('id', ids);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Error deleting candidates:', e);
    return false;
  }
};

export const subscribeToCandidates = (callback) => {
  getCandidates().then(data => callback(data));
  const sub = supabase
    .channel('public:candidates')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
      getCandidates().then(data => callback(data));
    })
    .subscribe();
  return () => supabase.removeChannel(sub);
};

export const subscribeToCandidate = (candidateId, callback) => {
  if (!candidateId) return () => {};
  getCandidateById(candidateId).then(data => data && callback(data));
  const sub = supabase
    .channel(`public:candidates:id=eq.${candidateId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `id=eq.${candidateId}` }, (payload) => {
      callback(mapToFrontend(payload.new));
    })
    .subscribe();
  return () => supabase.removeChannel(sub);
};
