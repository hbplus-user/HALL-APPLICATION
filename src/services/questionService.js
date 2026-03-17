import { supabase } from './supabase';

const TABLE = 'question_packs';

export const getPacks = async () => {
  try {
    const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
    console.log("getPacks raw data:", data);
    if (error) throw error;
    
    // Map snake_case to camelCase for the frontend
    const mapped = (data || []).map(p => ({
      ...p,
      subRole: p.sub_role,
      fileName: p.file_name,
      storagePath: p.storage_path,
      downloadUrl: p.download_url,
      isManual: p.is_manual
    }));
    console.log("getPacks mapped frontend array:", mapped);
    return mapped;
  } catch (e) {
    console.error('Error getting packs:', e);
    return [];
  }
};

export const addPack = async (packData) => {
  try {
    console.log("addPack received:", packData);
    // Convert camelCase from frontend into snake_case for DB
    const dbPayload = {
      role: packData.role,
      sub_role: packData.subRole,
      file_name: packData.fileName,
      storage_path: packData.storagePath,
      download_url: packData.downloadUrl,
      questions: packData.questions,
      is_manual: packData.isManual || false,
      question_count: packData.questions ? packData.questions.length : 0
    };
    
    console.log("addPack mapped payload:", dbPayload);

    const { data, error } = await supabase.from(TABLE).insert([dbPayload]).select().single();
    if (error) throw error;
    
    console.log("addPack returned from DB:", data);
    
    return {
      ...data,
      subRole: data.sub_role,
      fileName: data.file_name,
      storagePath: data.storage_path,
      downloadUrl: data.download_url,
      isManual: data.is_manual
    };
  } catch (e) {
    console.error('Error adding pack:', e);
    return null;
  }
};

export const deletePack = async (packId) => {
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', packId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Error deleting pack:', e);
    return false;
  }
};

export const getPackById = async (packId) => {
  try {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', packId).single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;
    
    return {
      ...data,
      subRole: data.sub_role,
      fileName: data.file_name,
      storagePath: data.storage_path,
      downloadUrl: data.download_url,
      isManual: data.is_manual
    };
  } catch (e) {
    console.error('Error getting pack by ID:', e);
    return null;
  }
};

export const getPacksForCandidate = async (candidate) => {
  try {
    let query = supabase.from(TABLE).select('*');
    
    if (candidate.role === 'fitness' && candidate.subRole) {
      query = query.eq('role', 'fitness').eq('sub_role', candidate.subRole);
    } else {
      query = query.eq('role', candidate.role);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    return (data || []).map(p => ({
      ...p,
      subRole: p.sub_role,
      fileName: p.file_name,
      storagePath: p.storage_path,
      downloadUrl: p.download_url,
      isManual: p.is_manual
    }));
  } catch (e) {
    console.error('Error getting packs for candidate:', e);
    return [];
  }
};
