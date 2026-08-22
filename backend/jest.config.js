/**
 * The suite is integration-level: it runs against real MySQL and Redis
 * because the behaviour under test is the interaction between them.
 *
 *   docker compose up -d mysql redis
 *   npm run db:setup
 *   npm test
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Fixtures build a whole location -> show chain over HTTP, and one test
  // deliberately waits for a lock TTL to lapse.
  testTimeout: 20_000,
  // Shared datastores mean parallel workers would contend; --runInBand in the
  // npm script keeps them serial.
  maxWorkers: 1,
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/kafka.js'
  ]
};
