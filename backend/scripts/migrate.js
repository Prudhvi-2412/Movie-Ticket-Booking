#!/usr/bin/env node
/**
 * Applies the CineWave schema, views, routines and triggers.
 *
 * Safe to run repeatedly: tables use CREATE TABLE IF NOT EXISTS, views use
 * CREATE OR REPLACE, and routines/triggers are dropped before being
 * recreated. Every applied file is recorded in schema_migrations with a
 * checksum so drift is visible.
 *
 *   npm run db:migrate
 */
const config = require('../src/config/env');
const {
  MIGRATION_FILES,
  createConnection,
  waitForDatabase,
  runFile
} = require('./sqlRunner');

const log = (...args) => console.log(...args);

const migrate = async () => {
  log(`\nCineWave schema migration -> ${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`);

  await waitForDatabase();

  // The first file creates the database, so connect without selecting one.
  const bootstrap = await createConnection({ withDatabase: false });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.DB_NAME}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrap.end();

  const connection = await createConnection();
  try {
    for (const file of MIGRATION_FILES) {
      const checksum = await runFile(connection, file, log);
      await connection.query(
        `INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), applied_at = NOW()`,
        [file, checksum]
      );
    }
    log('\nMigration complete.\n');
  } finally {
    await connection.end();
  }
};

if (require.main === module) {
  migrate().catch((err) => {
    console.error(`\nMigration failed:\n  ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { migrate };
