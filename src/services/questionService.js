import { supabase } from './supabase';

const TABLE = 'question_packs';
const BUCKET = 'proctoring';

// Helper: delete a file from Supabase Storage by its path
const deleteStorageFile = async (storagePath) => {
  if (!storagePath) return; // manual questions have no PDF
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (error) {
      console.warn('Storage delete warning (non-fatal):', error.message);
    } else {
      console.log('Storage file deleted:', storagePath);
    }
  } catch (e) {
    console.warn('Storage delete failed (non-fatal):', e);
  }
};

export const getPacks = async () => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(p => ({
      ...p,
      subRole: p.sub_role,
      fileName: p.file_name,
      storagePath: p.storage_path,
      downloadUrl: p.download_url,
      isManual: p.is_manual,
    }));
  } catch (e) {
    console.error('Error getting packs:', e);
    return [];
  }
};

export const addPack = async (packData) => {
  try {
    const dbPayload = {
      role: packData.role,
      sub_role: packData.subRole,
      file_name: packData.fileName,
      storage_path: packData.storagePath,
      download_url: packData.downloadUrl,
      questions: packData.questions,
      is_manual: packData.isManual || false,
      question_count: packData.questions ? packData.questions.length : 0,
    };

    const { data, error } = await supabase
      .from(TABLE)
      .insert([dbPayload])
      .select()
      .single();

    if (error) throw error;

    return {
      ...data,
      subRole: data.sub_role,
      fileName: data.file_name,
      storagePath: data.storage_path,
      downloadUrl: data.download_url,
      isManual: data.is_manual,
    };
  } catch (e) {
    console.error('Error adding pack:', e);
    return null;
  }
};

export const deletePack = async (packId) => {
  try {
    if (!packId) {
      console.error('deletePack called with empty packId');
      return false;
    }

    // Step 1: Fetch the pack first to get its storage_path before deleting
    const { data: pack, error: fetchError } = await supabase
      .from(TABLE)
      .select('id, storage_path')
      .eq('id', packId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.warn('deletePack: could not pre-fetch pack (continuing anyway):', fetchError.message);
    }

    // Step 2: Delete the row from the database
    const { data: deleted, error: deleteError } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', packId)
      .select('id');

    if (deleteError) throw deleteError;

    if (!deleted || deleted.length === 0) {
      console.error('deletePack: no rows deleted — ID not found:', packId);
      return false;
    }

    // Step 3: Delete the PDF from Supabase Storage (runs after DB delete)
    // storage_path looks like: "questions/fitness/1234567890_filename.pdf"
    if (pack?.storage_path) {
      await deleteStorageFile(pack.storage_path);
    }

    return true;
  } catch (e) {
    console.error('Error deleting pack:', e);
    return false;
  }
};

export const getPackById = async (packId) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', packId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;

    return {
      ...data,
      subRole: data.sub_role,
      fileName: data.file_name,
      storagePath: data.storage_path,
      downloadUrl: data.download_url,
      isManual: data.is_manual,
    };
  } catch (e) {
    console.error('Error getting pack by ID:', e);
    return null;
  }
};

export const getPacksForCandidate = async (candidate) => {
  try {
    let query = supabase.from(TABLE).select('*');

    const role = (candidate.role || '').toLowerCase();
    const subRole = (candidate.subRole || '').toLowerCase();

    if (role === 'fitness' && subRole) {
      // Use ilike for case-insensitive sub_role match
      query = query.eq('role', role).ilike('sub_role', subRole);
    } else if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;
    if (error) throw error;

    console.log(`getPacksForCandidate [role=${role}, subRole=${subRole}]: found ${(data || []).length} pack(s)`);

    return (data || []).map(p => ({
      ...p,
      subRole: p.sub_role,
      fileName: p.file_name,
      storagePath: p.storage_path,
      downloadUrl: p.download_url,
      isManual: p.is_manual,
    }));
  } catch (e) {
    console.error('Error getting packs for candidate:', e);
    return [];
  }
};