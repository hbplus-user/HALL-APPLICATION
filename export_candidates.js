import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env file manually
const envPath = './.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    envVars[key] = value;
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseAnonKey = envVars.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runExport() {
  console.log("Fetching all candidates raw data...");
  const { data, error } = await supabase.from('candidates').select('*');
  if (error) {
    console.error("Fetch error:", error);
    return;
  }
  
  console.log("Candidates count:", data.length);
  if (data.length > 0) {
    console.log("First candidate keys:", Object.keys(data[0]));
    console.log("First candidate exam_start_time:", data[0].exam_start_time, "exam_start_time_ms:", data[0].exam_start_time_ms);
  }
  
  fs.writeFileSync('candidates_raw.json', JSON.stringify(data, null, 2), 'utf8');
  console.log("Successfully wrote candidates_raw.json");
}

runExport();
