const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv'); dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const file = path.join(__dirname, '..', 'server', 'data', 'tournaments.json');
if (!fs.existsSync(file)) {
  console.error('No tournaments.json found at', file);
  process.exit(1);
}
const raw = fs.readFileSync(file, 'utf8') || '[]';
const arr = JSON.parse(raw || '[]');

(async () => {
  try {
    for (const t of arr) {
      // Clean up missing fields
      const payload = {
        id: t.id,
        title: t.title,
        game: t.game,
        mode: t.mode,
        value: t.value,
        description: t.description || null,
        start_at: t.startAt ? new Date(t.startAt).toISOString() : null,
        checkin_minutes: t.checkinMinutes || null,
        capacity: t.capacity || null,
        official: !!t.official,
        prize: !!t.prize || false,
        prize_type: t.prizeType || null,
        prize_amount: t.prizeAmount || null,
        currency: t.currency || null,
        payout_status: t.payoutStatus || null,
        status: t.status || 'scheduled',
        winner_email: t.winnerEmail || null,
        starting_score: t.startingScore || null,
        creator_email: t.creatorEmail || null,
        creator_name: t.creatorName || null,
        created_at: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString()
      };
      await supabase.from('tournaments').upsert(payload, { onConflict: 'id' });
      console.log('Upserted tournament', t.id);
    }
    console.log('Migration complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed', err);
    process.exit(2);
  }
})();
