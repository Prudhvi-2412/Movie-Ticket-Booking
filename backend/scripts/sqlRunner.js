const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const config = require('../src/config/env');

/**
 * Where the .sql files live. Defaults to the repo layout; the Docker image
 * copies them next to the app and sets SQL_ROOT, so the runner works in both
 * without a path that silently resolves to nothing in one of them.
 */
const SQL_ROOT = process.env.SQL_ROOT
  ? path.resolve(process.env.SQL_ROOT)
  : path.resolve(__dirname, '../../MovieBookingSystem');

/**
 * Files are applied in this order. Views come before routines because
 * UpdateDynamicPrice and GetScreenStatus read from theater_occupancy.
 * Ad-hoc report scripts (Analytics/reports.sql, advanced_analytics.sql) are
 * deliberately excluded -- they are SELECT-only reference queries, not DDL.
 */
const MIGRATION_FILES = [
  'Schema/tables.sql',
  'Analytics/views.sql',
  'Logic/functions.sql',
  'Logic/procedures.sql',
  'Logic/triggers.sql',
  'Automation/background_tasks.sql'
];

/**
 * Split a script into executable statements.
 *
 * The mysql protocol has no concept of DELIMITER -- it is a mysql-client
 * directive. Stored routines contain semicolons inside their bodies, so the
 * script declares a different terminator around them and we have to honour
 * it here or every CREATE PROCEDURE would be truncated at its first `;`.
 */
const splitStatements = (sql) => {
  const statements = [];
  let delimiter = ';';
  let buffer = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const rest = sql.slice(i);

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      else continue;
    }
    if (inBlockComment) {
      if (rest.startsWith('*/')) { inBlockComment = false; i += 1; }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (rest.startsWith('--') && (sql[i + 2] === ' ' || sql[i + 2] === '\t' || sql[i + 2] === '\n')) {
        inLineComment = true;
        continue;
      }
      if (char === '#') { inLineComment = true; continue; }
      if (rest.startsWith('/*')) { inBlockComment = true; i += 1; continue; }

      // A DELIMITER directive is only valid at the start of a line.
      if (/^delimiter[ \t]/i.test(rest) && (buffer === '' || buffer.endsWith('\n'))) {
        const newline = rest.indexOf('\n');
        const line = newline === -1 ? rest : rest.slice(0, newline);
        delimiter = line.split(/[ \t]+/)[1].trim();
        i += line.length;
        continue;
      }

      if (rest.startsWith(delimiter)) {
        const statement = buffer.trim();
        if (statement) statements.push(statement);
        buffer = '';
        i += delimiter.length - 1;
        continue;
      }
    }

    if (char === "'" && !inDouble && !inBacktick && sql[i - 1] !== '\\') inSingle = !inSingle;
    else if (char === '"' && !inSingle && !inBacktick && sql[i - 1] !== '\\') inDouble = !inDouble;
    else if (char === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;

    buffer += char;
  }

  const tail = buffer.trim();
  if (tail) statements.push(tail);
  return statements;
};

const createConnection = async ({ withDatabase = true } = {}) => {
  const connection = await mysql.createConnection({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: withDatabase ? config.DB_NAME : undefined,
    multipleStatements: false,
    // Match the runtime pool so seeded timestamps line up with NOW().
    timezone: 'Z'
  });
  await connection.query("SET time_zone = '+00:00'");
  return connection;
};

const waitForDatabase = async ({ retries = 30, delayMs = 2000 } = {}) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const conn = await createConnection({ withDatabase: false });
      await conn.end();
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      // eslint-disable-next-line no-console
      console.log(`  waiting for MySQL at ${config.DB_HOST}:${config.DB_PORT} (${attempt}/${retries})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

const runFile = async (connection, relativePath, log = console.log) => {
  const absolute = path.join(SQL_ROOT, relativePath);
  const sql = fs.readFileSync(absolute, 'utf8');
  const statements = splitStatements(sql);

  for (const statement of statements) {
    try {
      await connection.query(statement);
    } catch (err) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 160);
      throw new Error(`${relativePath}: ${err.message}\n  -> ${preview}`);
    }
  }

  log(`  applied ${relativePath} (${statements.length} statements)`);
  return crypto.createHash('sha256').update(sql).digest('hex');
};

module.exports = {
  SQL_ROOT,
  MIGRATION_FILES,
  splitStatements,
  createConnection,
  waitForDatabase,
  runFile
};
