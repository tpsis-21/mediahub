
const pg = require('pg');
const { Client } = pg;

const connectionString = 'postgresql://postgres:fm1Ks4XmKL9AKG@db.jbclilwvvpbiuhdwuwow.supabase.co:5432/postgres';

(async () => {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query("SELECT id FROM app_users WHERE type = 'admin' AND is_active = true LIMIT 1");
    console.log(JSON.stringify(res.rows));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
})();
