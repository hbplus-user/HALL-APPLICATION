import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bielfxnrteltnsyvwqge.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZWxmeG5ydGVsdG5zeXZ3cWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NTE2NzMsImV4cCI6MjA4OTIyNzY3M30.NR0ZYlu2nA3aLxNhZjTslJFtTAIu1BS5eumG0q-kTuE'
);

async function test() {
  const useEmail = 'test@example.com';
  const payload = {
    email: useEmail,
    name: useEmail.split('@')[0],
    role: 'general',
    sub_role: null,
    status: 'pending',
    token_id: 'some-token-uuid-1234',
    // Do we have assigned_packs in DB? 
    // question_pack_ids
    // Let's just try inserting this minimal payload and see the error.
  };

  const { data, error } = await supabase
    .from('candidates')
    .upsert(payload, { onConflict: 'email' })
    .select()
    .single();

  if (error) {
    console.error('SUPABASE ERROR:', error);
  } else {
    console.log('SUCCESS:', data);
  }
}

test();
