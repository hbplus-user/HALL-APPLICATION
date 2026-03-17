import { supabase } from './supabase';

const TABLE = 'tokens';

const mapToFrontend = (t) => {
  if (!t) return null;
  return {
    ...t,
    subRole: t.sub_role,
    assignedPacks: t.question_pack_ids || [],
    expiryHours: t.expiry_hours,
    createdAt: t.created_at,
    // Reconstruct expiryDate for the frontend
    expiryDate: t.created_at ? new Date(new Date(t.created_at).getTime() + (t.expiry_hours || 0) * 3600000).toISOString() : null
  };
};

const mapToDb = (t) => ({
  email: t.email,
  token: t.token,
  role: t.role,
  sub_role: t.subRole,
  question_pack_ids: t.assignedPacks || [],
  status: t.status || 'active',
  expiry_hours: t.expiryHours || 24
});

export const getTokens = async () => {
  try {
    const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
    console.log("Supabase getTokens raw data:", data, "error:", error);
    if (error) throw error;
    const mapped = (data || []).map(mapToFrontend);
    console.log("Supabase getTokens mapped front-end array:", mapped);
    return mapped;
  } catch (e) {
    console.error('Error fetching tokens:', e);
    return [];
  }
};

export const addToken = async (tokenData) => {
  try {
    const dbPayload = mapToDb(tokenData);
    const { data, error } = await supabase
      .from(TABLE)
      .insert([dbPayload])
      .select()
      .single();
    if (error) throw error;
    return mapToFrontend(data);
  } catch (e) {
    console.error('Error adding token:', e);
    return null;
  }
};

export const updateToken = async (id, fields) => {
  try {
    const { error } = await supabase
      .from(TABLE)
      .update(fields)
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Error updating token:', e);
    return false;
  }
};

export const deleteToken = async (id) => {
  try {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Error deleting token:', e);
    return false;
  }
};

export const findToken = async (email, tokenValue) => {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('email', email)
      .eq('token', tokenValue)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return mapToFrontend(data);
  } catch (e) {
    console.error('Error finding token:', e);
    return null;
  }
};

export const subscribeToTokens = (callback) => {
  getTokens().then(data => callback(data));

  const subscription = supabase
    .channel('public:tokens')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
      getTokens().then(data => callback(data));
    })
    .subscribe();

  return () => supabase.removeChannel(subscription);
};
