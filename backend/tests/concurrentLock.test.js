const { acquireSeatLocks, releaseSeatLocks } = require('../src/redis/seatLock');

describe('Concurrent Seat Locking Engine (Redis Distributed Locks)', () => {
  const showId = 999;
  const targetSeat = [50];

  afterAll(async () => {
    await releaseSeatLocks(showId, targetSeat);
  });

  it('should grant lock to only ONE user when 2 users select the same seat simultaneously', async () => {
    const userA = 'user_101';
    const userB = 'user_102';

    // Simulate simultaneous atomic lock acquisition
    const lockPromises = [
      acquireSeatLocks(showId, targetSeat, userA),
      acquireSeatLocks(showId, targetSeat, userB)
    ];

    const results = await Promise.all(lockPromises);

    const successCount = results.filter(r => r.success === true).length;
    const failureCount = results.filter(r => r.success === false).length;

    // Exactly 1 lock must succeed, and 1 must fail
    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);
  });
});
