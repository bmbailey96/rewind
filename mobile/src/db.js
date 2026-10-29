import * as SQLite from 'expo-sqlite';
const { normalizeMovie, normalizeBackup } = require('./core');
const starter = require('../assets/starter-library.json');

let opening = null;
export function database() {
  if (!opening) opening = SQLite.openDatabaseAsync('rewind-native.db').then(async db => {
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    await db.execAsync(
      'CREATE TABLE IF NOT EXISTS films (' +
      'id TEXT PRIMARY KEY NOT NULL, tmdb_id INTEGER, media_type TEXT NOT NULL, ' +
      'title TEXT NOT NULL, year TEXT, poster_path TEXT, overview TEXT, ' +
      'genres_json TEXT NOT NULL DEFAULT "[]", rating REAL, pinned INTEGER NOT NULL DEFAULT 0, ' +
      'watched INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT "", ' +
      'source TEXT NOT NULL, letterboxd_url TEXT, availability_json TEXT, ' +
      'raw_json TEXT, modified_at INTEGER NOT NULL);' +
      'CREATE INDEX IF NOT EXISTS films_title_idx ON films(title);' +
      'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);'
    );
    const existing = await db.getFirstAsync('SELECT COUNT(*) AS count FROM films');
    if (!existing.count) {
      const rows = starter.films.map(f => normalizeMovie(f, 'starter')).filter(Boolean);
      await db.withTransactionAsync(async () => {
        for (const item of rows) await insert(db, item);
      });
      await db.runAsync('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
        ['starterVersion', starter.sourceDate]);
    }
    return db;
  }).catch(err => { opening = null; throw err; });
  return opening;
}
async function insert(db, item) {
  await db.runAsync(
    'INSERT OR IGNORE INTO films (id,tmdb_id,media_type,title,year,poster_path,overview,genres_json,' +
    'rating,pinned,watched,note,source,letterboxd_url,availability_json,raw_json,modified_at) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [item.id,item.tmdb_id,item.media_type,item.title,item.year,item.poster_path,item.overview,
      item.genres_json,item.rating,item.pinned,item.watched,item.note,item.source,item.letterboxd_url,
      item.availability_json,item.raw_json,item.modified_at]
  );
}
export async function allFilms() {
  const db = await database();
  return db.getAllAsync('SELECT * FROM films ORDER BY title COLLATE NOCASE');
}
export async function toggleFilm(id, field) {
  if (!['pinned', 'watched'].includes(field)) throw Error('Unknown film action');
  const db = await database();
  await db.runAsync('UPDATE films SET ' + field + ' = CASE WHEN ' + field +
    ' = 0 THEN 1 ELSE 0 END, modified_at = ? WHERE id = ?', [Date.now(), id]);
}
export async function updateNote(id, note) {
  const db = await database();
  await db.runAsync('UPDATE films SET note = ?, modified_at = ? WHERE id = ?',
    [String(note || '').slice(0, 1200), Date.now(), id]);
}
export async function importBackup(text) {
  if (text.length > 18 * 1024 * 1024) throw Error('This backup is too large to import safely.');
  const data = normalizeBackup(JSON.parse(text));
  if (!data.films.length) throw Error('This backup contains no recognizable movie or TV records.');
  const db = await database();
  // A user backup supersedes untouched, potentially outdated starter records.
  // Pinned, watched, or annotated starter films are never silently deleted.
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM films WHERE source = ? AND pinned = 0 AND watched = 0 AND note = ?', ['starter', '']);
    for (const item of data.films) {
      await insert(db, item);
      // The backup is authoritative for catalog data; keep any local pin,
      // watched mark and note that the user already edited in this app.
      await db.runAsync(
        'UPDATE films SET tmdb_id = COALESCE(?,tmdb_id), title = ?, year = ?, ' +
        'poster_path = COALESCE(?,poster_path), overview = CASE WHEN ? != "" THEN ? ELSE overview END, ' +
        'genres_json = ?, rating = COALESCE(?,rating), ' +
        'pinned = MAX(pinned,?), watched = MAX(watched,?), ' +
        'note = CASE WHEN note = "" THEN ? ELSE note END, ' +
        'letterboxd_url = COALESCE(?,letterboxd_url), availability_json = COALESCE(?,availability_json),' +
        'source = ?, raw_json = ?, modified_at = ? WHERE id = ?',
        [item.tmdb_id,item.title,item.year,item.poster_path,item.overview,item.overview,
         item.genres_json,item.rating,item.pinned,item.watched,item.note,item.letterboxd_url,
         item.availability_json,item.source,item.raw_json,Date.now(),item.id]
      );
    }
    await db.runAsync('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
      ['rentalBudget',JSON.stringify(data.settings.rentalBudget)]);
    await db.runAsync('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
      ['services',JSON.stringify(data.settings.services)]);
    await db.runAsync('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
      ['lastBackupImportedAt',String(Date.now())]);
  });
  return data.films.length;
}
export async function exportBackup() {
  const db = await database();
  const films = await allFilms();
  const budget = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', ['rentalBudget']);
  const services = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', ['services']);
  return JSON.stringify({
    format: 'rewind-native-v1', exportedAt: new Date().toISOString(),
    watchlist: films.map(f => ({
      ...JSON.parse(f.raw_json || '{}'),
      id: f.tmdb_id || f.id, mediaType: f.media_type, title: f.title, year: f.year,
      poster_path: f.poster_path, pinned: !!f.pinned, watched: !!f.watched,
      manualNote: f.note,
      availabilitySnapshot: f.availability_json ? JSON.parse(f.availability_json) : null
    })),
    services: services ? JSON.parse(services.value) : [],
    rentalBudget: budget ? JSON.parse(budget.value) : 7.99
  }, null, 2);
}
export async function stats() {
  const db = await database();
  const [all, source] = await Promise.all([
    db.getFirstAsync('SELECT COUNT(*) AS all_count, SUM(pinned) AS pins, SUM(watched) AS watched FROM films'),
    db.getFirstAsync('SELECT value FROM settings WHERE key = ?', ['lastBackupImportedAt'])
  ]);
  return { ...all, imported: !!source };
}
