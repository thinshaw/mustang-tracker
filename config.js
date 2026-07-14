// Supabase connection for Mustang Tracker.
//
// The anon key is PUBLIC BY DESIGN — it ships to every browser that loads this
// page, and Supabase expects that. It is not a secret and does not need hiding.
// What actually protects Traci's students is row-level security: every table
// requires auth.uid() to match classes.owner_id, so this key alone reads
// nothing. (Verified: an anonymous insert is rejected with 42501.)
//
// The service_role key is the opposite — it bypasses RLS entirely. It must
// NEVER appear in this file, in this repo, or in the browser.
export const SUPABASE_URL = 'https://habffloatnxdcqooture.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhYmZmbG9hdG54ZGNxb290dXJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDkwNDEsImV4cCI6MjA5OTYyNTA0MX0.HpDKn3TgIb3d0OAx4CNK_isNbXK4obUwt1gtP_mJeCY';
