/**
 * emailService.js — Using Supabase Edge Functions
 */
import { supabase } from './supabase';

const BASE_URL = window.location.origin;

function buildExamLink(email, token) {
  const url = new URL(`${BASE_URL}/`);
  url.searchParams.set('email', email);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function sendTokenEmail(tokenData) {
  const params = {
    email:          tokenData.email,
    token:          tokenData.token,
    exam_link:      buildExamLink(tokenData.email, tokenData.token),
    expiry:         tokenData.expiryHours ? `${tokenData.expiryHours} hours` : '24 hours',
    role:           tokenData.role || 'Candidate',
  };

  console.log('[Supabase Email] Sending to:', tokenData.email);

  try {
    const { data, error } = await supabase.functions.invoke('send-invite', {
      body: params,
    });

    if (error) {
      console.error('[Supabase Email] Function Error:', error);
      throw error;
    }

    console.log('[Supabase Email] Success:', data);
    return data;
  } catch (err) {
    console.error('[Supabase Email] Catch Error:', err);
    throw err;
  }
}

export async function sendTokenEmails(tokens) {
  let sent = 0;
  const failed = [];

  for (const t of tokens) {
    try {
      await sendTokenEmail(t);
      sent++;
    } catch (err) {
      console.error(`[Supabase Email] Failed for ${t.email}:`, err);
      failed.push(t.email);
    }
  }
  return { sent, failed };
}
