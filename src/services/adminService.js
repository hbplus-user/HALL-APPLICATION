import { supabase } from './supabase';

export const createAdminAccount = async (email, password) => {
  try {
    if (!email.endsWith('@hbplus.fit')) {
      throw new Error('Only @hbplus.fit email domains are allowed.');
    }
    
    // In Supabase, creating an admin account via API from the client is usually not allowed 
    // without a service role key. We'll simply send an invitation via magic link or have them 
    // login via Google directly (which auto-adds them to admins).
    // For this migration, we'll just throw an error saying they must use Google Login.
    throw new Error('Please use the "Continue with Google" button to create an admin account or sign in.');
  } catch (e) {
    console.error('Error creating admin:', e);
    throw e;
  }
};

export const checkEmailExists = async (email) => {
  try {
    // In Supabase, checking if an email exists is difficult from the client side for security reasons.
    // We'll rely on our admins table.
    const { data } = await supabase.from('admins').select('id').eq('email', email).single();
    return !!data;
  } catch (e) {
    return false;
  }
};
