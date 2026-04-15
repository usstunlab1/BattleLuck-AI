import { Client } from 'pg';

let pgClient = null;

async function getPgClient() {
  if (pgClient) return pgClient;
  const connectionString = process.env.PG_CONNECTION_URL;
  if (!connectionString) return null;
  try {
    const client = new Client({ connectionString });
    await client.connect();
    pgClient = client;
    return pgClient;
  } catch { return null; }
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS battle_stats (
      steam_id     TEXT        NOT NULL,
      mode_id      TEXT        NOT NULL,
      kills        INTEGER     NOT NULL DEFAULT 0,
      deaths       INTEGER     NOT NULL DEFAULT 0,
      score        INTEGER     NOT NULL DEFAULT 0,
      recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (steam_id, mode_id, recorded_at)
    )
  `);
}

export async function POST(steamId, modeId, kills = 0, deaths = 0, score = 0) {
  const recordedAt = new Date().toISOString();
  const client = await getPgClient();
  if (client) {
    await ensureSchema(client);
    await client.query(
      `INSERT INTO battle_stats (steam_id, mode_id, kills, deaths, score, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [steamId, modeId.toLowerCase(), kills, deaths, score, recordedAt],
    );
  }
  return { persisted: Boolean(client), steamId, modeId: modeId.toLowerCase(), kills, deaths, score, recordedAt };
}

export async function GET(steamId, modeId = '', limit = 50) {
  const client = await getPgClient();
  if (!client) return { steamId, modeId: modeId || null, totalKills: 0, totalDeaths: 0, totalScore: 0, sessions: 0, kdRatio: 0, persisted: false };
  await ensureSchema(client);
  const params = [steamId, Math.max(1, Math.min(500, limit))];
  let query = `SELECT SUM(kills) AS total_kills, SUM(deaths) AS total_deaths, SUM(score) AS total_score, COUNT(*) AS sessions FROM (SELECT kills, deaths, score FROM battle_stats WHERE steam_id = $1`;
  if (modeId) { query += ` AND mode_id = $3`; params.push(modeId.toLowerCase()); }
  query += ` ORDER BY recorded_at DESC LIMIT $2) sub`;
  const result = await client.query(query, params);
  const row = result.rows[0];
  const kills = parseInt(row.total_kills ?? '0', 10);
  const deaths = parseInt(row.total_deaths ?? '0', 10);
  return { steamId, modeId: modeId || null, totalKills: kills, totalDeaths: deaths, totalScore: parseInt(row.total_score ?? '0', 10), sessions: parseInt(row.sessions ?? '0', 10), kdRatio: Math.round((kills / Math.max(deaths, 1)) * 100) / 100, persisted: true };
}
