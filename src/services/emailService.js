/**
 * emailService.js — EmailJS integration using the npm package (@emailjs/browser)
 *
 * Credentials:
 *   Service ID  : service_maneven
 *   Template ID : template_thpi8ze
 *   Public Key  : KZrWLmRAiJe1kffXn
 *
 * Template variables expected by EmailJS template:
 *   {{to_email}}       — candidate's email address
 *   {{candidate_name}} — part before @ in email
 *   {{token}}          — the exam access token
 *   {{exam_link}}      — URL to the login page
 *   {{expiry}}         — e.g. "24 hours"
 *   {{role}}           — assigned role
 */

import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID  = 'service_maneven';
const EMAILJS_TEMPLATE_ID = 'template_thpi8ze';
const EMAILJS_PUBLIC_KEY  = 'KZrWLmRAiJe1kffXn';

// Initialize once
emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

const BASE_URL = window.location.origin;

/**
 * Builds a magic-link URL: clicking it auto-logs the candidate in.
 * e.g. https://yourapp.com/?email=abc@hb.com&token=XYZ123AB
 */
function buildExamLink(email, token) {
  const url = new URL(`${BASE_URL}/`);
  url.searchParams.set('email', email);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Send a single token invitation email.
 */
export async function sendTokenEmail(tokenData) {
  const params = {
    to_email:       tokenData.email,
    candidate_name: tokenData.email.split('@')[0],
    token:          tokenData.token,
    exam_link:      buildExamLink(tokenData.email, tokenData.token),
    expiry:         tokenData.expiryHours ? `${tokenData.expiryHours} hours` : '24 hours',
    role:           tokenData.role || 'Candidate',
  };

  console.log('[EmailJS] Sending to:', tokenData.email, params);

  try {
    const result = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params);
    console.log('[EmailJS] Success:', result);
    return result;
  } catch (err) {
    console.error('[EmailJS] Error:', err);
    throw err;
  }
}

/**
 * Send token emails to multiple candidates.
 * @returns {{ sent: number, failed: string[] }}
 */
export async function sendTokenEmails(tokens) {
  let sent = 0;
  const failed = [];

  for (const t of tokens) {
    try {
      await sendTokenEmail(t);
      sent++;
    } catch (err) {
      console.error(`[EmailJS] Failed for ${t.email}:`, err);
      failed.push(t.email);
    }
  }
  return { sent, failed };
}
