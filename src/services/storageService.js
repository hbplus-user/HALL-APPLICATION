import { supabase } from './supabase';

const BUCKET = 'proctoring';

// Helper to convert base64 data url to Blob
const dataUrlToBlob = async (dataUrl) => {
  const res = await fetch(dataUrl);
  return await res.blob();
};

export const uploadSnapshot = async (dataUrl, candidateId, reason) => {
  try {
    const blob = await dataUrlToBlob(dataUrl);
    const path = `snapshots/${candidateId}/${reason}_${Date.now()}.jpg`;
    
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg' });
      
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: publicUrl, path };
  } catch (e) {
    console.error('Error uploading snapshot:', e);
    return null;
  }
};

export const uploadRecording = async (blob, candidateId) => {
  try {
    const path = `recordings/${candidateId}/exam_${Date.now()}.webm`;
    
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'video/webm' });
      
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: publicUrl, path };
  } catch (e) {
    console.error('Error uploading recording:', e);
    return null;
  }
};

export const uploadScreenRecording = async (blob, candidateId) => {
  try {
    const path = `recordings/${candidateId}/screen-recording.webm`;
    
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'video/webm', upsert: true });
      
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: publicUrl, path };
  } catch (e) {
    console.error('Error uploading screen recording:', e);
    return null;
  }
};

export const uploadPdf = async (file, role) => {
  try {
    const path = `questions/${role}/${Date.now()}_${file.name}`;
    
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type });
      
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { downloadURL: publicUrl, path };
  } catch (e) {
    console.error('Error uploading PDF:', e);
    return null;
  }
};

export const uploadCandidatePhoto = async (dataUrl, candidateId) => {
  try {
    const blob = await dataUrlToBlob(dataUrl);
    const path = `photos/${candidateId}/photo.jpg`;
    
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: publicUrl, path };
  } catch (e) {
    console.error('Error uploading photo:', e);
    return null;
  }
};

export const deleteObjectByPath = async (path) => {
  if (!path) return false;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Error deleting object:', e);
    return false;
  }
};

export const deleteCandidateFiles = async (candidateId, recordingPath = null) => {
  if (!candidateId) return;
  try {
    // Delete all files inside candidate's 3 storage folders
    const folders = [
      `photos/${candidateId}`,
      `snapshots/${candidateId}`,
      `recordings/${candidateId}`,
    ];

    for (const folder of folders) {
      const { data: files, error: listError } = await supabase.storage.from(BUCKET).list(folder);
      if (listError) continue;

      if (files && files.length > 0) {
        const pathsToDelete = files.map(f => `${folder}/${f.name}`);
        const { error } = await supabase.storage.from(BUCKET).remove(pathsToDelete);
        if (error) console.warn(`Storage folder delete warning [${folder}]:`, error.message);
        else console.log(`Deleted ${pathsToDelete.length} file(s) from ${folder}`);
      }
    }

    // Also delete specific recording_path stored in the candidate's DB row
    if (recordingPath) {
      const { error } = await supabase.storage.from(BUCKET).remove([recordingPath]);
      if (error) console.warn('Storage recording delete warning:', error.message);
    }
  } catch (e) {
    console.error('Error deleting candidate files:', e);
  }
};
