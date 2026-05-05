import { supabase } from './supabase';

const TABLE = 'candidates';

const mapToFrontend = (c) => {
  if (!c) return null;
  // Unify photo: prefer 'photo' column (set by PhotoCapturePage), fall back to photo_url
  const resolvedPhoto = c.photo || c.photo_url || null;
  return {
    ...c,
    subRole: c.sub_role,
    tokenId: c.token_id,
    photo: resolvedPhoto,        // profile pic (used everywhere in admin UI)
    photoUrl: resolvedPhoto,     // alias for backwards compat
    currentQuestionIndex: c.current_question_index ?? 0,
    totalQuestions: c.total_questions ?? 0,
    examStartTime: c.exam_start_time_ms ?? c.exam_start_time,
    examEndTime: c.exam_end_time,
    disqualificationReason: c.disqualification_reason,
    warningCount: c.warning_count ?? 0,
    phoneDetections: c.phone_detections ?? 0,
    speakingViolations: c.speaking_violations ?? 0,
    tabSwitches: c.tab_switches ?? 0,
    recordingUrl: c.recording_url,
    recordingPath: c.recording_path,
    warningTimestamps: c.warning_timestamps ?? [],
    proctoringSnapshots: c.proctoring_snapshots ?? [],
    examResults: c.exam_results ?? null,
    selectedAnswer: c.selected_answer,
    assignedPacks: c.assigned_packs ?? [],
    riskScore: c.risk_score ?? 0,
  };
};

const mapToDb = (c) => {
  const p = {};
  if (c.email !== undefined) p.email = c.email;
  if (c.name !== undefined) p.name = c.name;
  if (c.role !== undefined) p.role = c.role;
  if (c.subRole !== undefined) p.sub_role = c.subRole;
  if (c.status !== undefined) p.status = c.status;
  if (c.tokenId !== undefined) p.token_id = c.tokenId;
  if (c.token_id !== undefined) p.token_id = c.token_id;
  if (c.photo !== undefined) p.photo = c.photo;
  if (c.photoUrl !== undefined) p.photo_url = c.photoUrl;
  if (c.score !== undefined) p.score = c.score;

  // Live monitoring
  if (c.currentQuestionIndex !== undefined) p.current_question_index = c.currentQuestionIndex;
  if (c.current_question_index !== undefined) p.current_question_index = c.current_question_index;
  if (c.totalQuestions !== undefined) p.total_questions = c.totalQuestions;
  if (c.total_questions !== undefined) p.total_questions = c.total_questions;
  if (c.selectedAnswer !== undefined) p.selected_answer = c.selectedAnswer;

  // Start time: store numeric ms separately so elapsed timer works
  if (c.examStartTime !== undefined) {
    if (typeof c.examStartTime === 'number') p.exam_start_time_ms = c.examStartTime;
    else p.exam_start_time = c.examStartTime;
  }
  if (c.exam_start_time !== undefined) p.exam_start_time = c.exam_start_time;
  if (c.examEndTime !== undefined) p.exam_end_time = c.examEndTime;
  if (c.exam_end_time !== undefined) p.exam_end_time = c.exam_end_time;

  if (c.disqualificationReason !== undefined) p.disqualification_reason = c.disqualificationReason;

  // Violation counters
  if (c.warningCount !== undefined) p.warning_count = c.warningCount;
  if (c.warning_count !== undefined) p.warning_count = c.warning_count;
  if (c.phoneDetections !== undefined) p.phone_detections = c.phoneDetections;
  if (c.phone_detections !== undefined) p.phone_detections = c.phone_detections;
  if (c.speakingViolations !== undefined) p.speaking_violations = c.speakingViolations;
  if (c.speaking_violations !== undefined) p.speaking_violations = c.speaking_violations;
  if (c.tabSwitches !== undefined) p.tab_switches = c.tabSwitches;
  if (c.tab_switches !== undefined) p.tab_switches = c.tab_switches;

  // Recording
  if (c.recordingUrl !== undefined) p.recording_url = c.recordingUrl;
  if (c.recording_url !== undefined) p.recording_url = c.recording_url;
  if (c.recordingPath !== undefined) p.recording_path = c.recordingPath;
  if (c.recording_path !== undefined) p.recording_path = c.recording_path;

  // JSONB arrays
  if (c.warningTimestamps !== undefined) p.warning_timestamps = c.warningTimestamps;
  if (c.warning_timestamps !== undefined) p.warning_timestamps = c.warning_timestamps;
  if (c.proctoringSnapshots !== undefined) p.proctoring_snapshots = c.proctoringSnapshots;
  if (c.proctoring_snapshots !== undefined) p.proctoring_snapshots = c.proctoring_snapshots;

  // Full exam results JSONB — { questions: [...], answers: [...] }
  if (c.examResults !== undefined) p.exam_results = c.examResults;
  if (c.exam_results !== undefined) p.exam_results = c.exam_results;

  // Misc
  if (c.deviceFingerprint !== undefined) p.device_fingerprint = c.deviceFingerprint;
  if (c.adminCommand !== undefined) p.admin_command = c.adminCommand;
  if (c.admin_command !== undefined) p.admin_command = c.admin_command;
  if (c.cursorStatus !== undefined) p.cursor_status = c.cursorStatus;
  if (c.assignedPacks !== undefined) p.assigned_packs = c.assignedPacks;
  if (c.riskScore !== undefined) p.risk_score = c.riskScore;

  return p;
};

export const getCandidates = async () => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('exam_start_time', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapToFrontend);
  } catch (e) {
    console.error('getCandidates:', e);
    return [];
  }
};

export const findCandidateByEmail = async (email) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('email', email)
      .order('exam_start_time', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return mapToFrontend(data);
  } catch (e) {
    console.error('findCandidateByEmail:', e);
    return null;
  }
};

export const findCandidateByToken = async (email, tokenId) => {
  // First try: look up by email + token_id (requires token_id column)
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('email', email)
      .eq('token_id', tokenId)
      .in('status', ['pending', 'in-progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!error && data) return mapToFrontend(data);
  } catch (_) { /* column may not exist yet */ }

  // Fallback: look up by email + status (works without token_id column)
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('email', email)
      .in('status', ['pending', 'in-progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== 'PGRST116') return null;
    return mapToFrontend(data);
  } catch (e) {
    return null;
  }
};


export const getCandidateById = async (id) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return mapToFrontend(data);
  } catch (e) {
    console.error('getCandidateById:', e);
    return null;
  }
};

export const setCandidateData = async (candidateId, candidateData) => {
  try {
    const payload = mapToDb(candidateData);

    // If we have a valid UUID candidateId, try UPDATE first, then INSERT
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const hasUUID = candidateId && uuidRegex.test(candidateId);

    if (hasUUID) {
      // Try to update existing row first
      const { data: updated, error: updateError } = await supabase
        .from(TABLE)
        .update(payload)
        .eq('id', candidateId)
        .select()
        .single();

      if (!updateError && updated) return mapToFrontend(updated);

      // Row doesn't exist yet — insert it
      payload.id = candidateId;
      const { data: inserted, error: insertError } = await supabase
        .from(TABLE)
        .insert(payload)
        .select()
        .single();

      if (insertError) throw insertError;
      return mapToFrontend(inserted);
    }

    // No UUID — plain insert (new candidate from login)
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return mapToFrontend(data);
  } catch (e) {
    console.error('setCandidateData:', e);
    return null;
  }
};

export const updateCandidateData = async (candidateId, updateData) => {
  try {
    if (!candidateId) return false;
    const payload = mapToDb(updateData);
    const { error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', candidateId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('updateCandidateData:', e);
    return false;
  }
};

export const deleteCandidates = async (ids) => {
  try {
    const { deleteCandidateFiles } = await import('./storageService');

    // For each candidate: fetch their data first (recording_path), then delete files, then DB row
    for (const id of ids) {
      // Fetch candidate to get any specific file paths saved in the DB
      let recordingPath = null;
      try {
        const { data } = await supabase.from(TABLE).select('recording_path').eq('id', id).single();
        recordingPath = data?.recording_path || null;
      } catch (_) { /* non-fatal */ }

      await deleteCandidateFiles(id, recordingPath);
    }

    const { error } = await supabase.from(TABLE).delete().in('id', ids);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('deleteCandidates:', e);
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
  if (!candidateId) return () => { };
  getCandidateById(candidateId).then(data => data && callback(data));
  const sub = supabase
    .channel(`public:candidates:id=eq.${candidateId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `id=eq.${candidateId}` },
      (payload) => { callback(mapToFrontend(payload.new)); }
    )
    .subscribe();
  return () => supabase.removeChannel(sub);
};