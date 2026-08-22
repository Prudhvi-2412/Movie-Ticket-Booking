const {
  acquireSeatLocks, releaseSeatLocks, verifySeatLocks,
  getShowLockedSeatsMap, getRemainingLockSeconds
} = require('../src/redis/seatLock');

/**
 * The distributed lock itself, exercised directly.
 *
 * A synthetic show id is used so these never collide with real bookings; the
 * MySQL pre-check finds no rows for it and the tests exercise the Redis half.
 */
const SHOW_ID = 900_001;
const USER_A = 8001;
const USER_B = 8002;

describe('Redis seat locking', () => {
  afterEach(async () => {
    await releaseSeatLocks(SHOW_ID, [1, 2, 3, 4, 5, 6]);
  });

  it('grants a contested seat to exactly one of two simultaneous callers', async () => {
    const [a, b] = await Promise.all([
      acquireSeatLocks(SHOW_ID, [1], USER_A),
      acquireSeatLocks(SHOW_ID, [1], USER_B)
    ]);

    const succeeded = [a, b].filter((r) => r.success);
    expect(succeeded).toHaveLength(1);

    const failed = [a, b].find((r) => !r.success);
    expect(failed.reason).toBe('SEATS_TEMPORARILY_LOCKED');
    expect(failed.conflictSeats).toEqual([1]);
  });

  it('holds under a burst of concurrent contenders', async () => {
    // The regression this guards: the previous implementation dropped the NX
    // flag, so every caller "succeeded" and all ten believed they held seat 2.
    const attempts = Array.from({ length: 10 }, (_, i) =>
      acquireSeatLocks(SHOW_ID, [2], 9000 + i));

    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toHaveLength(9);
  });

  it('acquires a block of seats all-or-nothing', async () => {
    await acquireSeatLocks(SHOW_ID, [4], USER_B);

    // Seats 3 and 5 are free, 4 is not — none of the three may be taken.
    const result = await acquireSeatLocks(SHOW_ID, [3, 4, 5], USER_A);
    expect(result.success).toBe(false);

    const locks = await getShowLockedSeatsMap(SHOW_ID);
    expect(locks[3]).toBeUndefined();
    expect(locks[5]).toBeUndefined();
    expect(locks[4].lockedByUserId).toBe(USER_B);
  });

  it('lets the existing holder extend their own lock', async () => {
    const first = await acquireSeatLocks(SHOW_ID, [1, 2], USER_A);
    expect(first.success).toBe(true);

    // Going back to add a third seat must not fail on the two already held.
    const second = await acquireSeatLocks(SHOW_ID, [1, 2, 3], USER_A);
    expect(second.success).toBe(true);
    expect(second.seatIds).toEqual([1, 2, 3]);
  });

  it('verifies ownership of a held seat', async () => {
    await acquireSeatLocks(SHOW_ID, [1], USER_A);

    await expect(verifySeatLocks(SHOW_ID, [1], USER_A))
      .resolves.toMatchObject({ valid: true });

    const asOther = await verifySeatLocks(SHOW_ID, [1], USER_B);
    expect(asOther.valid).toBe(false);
    expect(asOther.missing[0]).toMatchObject({ seatId: 1, reason: 'HELD_BY_OTHER' });
  });

  it('reports an unheld seat as expired rather than owned', async () => {
    const result = await verifySeatLocks(SHOW_ID, [6], USER_A);
    expect(result.valid).toBe(false);
    expect(result.missing[0]).toMatchObject({ seatId: 6, reason: 'EXPIRED' });
  });

  it('refuses to release another user\'s lock', async () => {
    await acquireSeatLocks(SHOW_ID, [1], USER_A);

    const removed = await releaseSeatLocks(SHOW_ID, [1], USER_B);
    expect(removed).toBe(0);

    const locks = await getShowLockedSeatsMap(SHOW_ID);
    expect(locks[1].lockedByUserId).toBe(USER_A);
  });

  it('releases the holder\'s own lock and frees the seat', async () => {
    await acquireSeatLocks(SHOW_ID, [1], USER_A);
    expect(await releaseSeatLocks(SHOW_ID, [1], USER_A)).toBe(1);

    const afterRelease = await acquireSeatLocks(SHOW_ID, [1], USER_B);
    expect(afterRelease.success).toBe(true);
  });

  it('expires a hold when its TTL elapses, returning the seat to the pool', async () => {
    const held = await acquireSeatLocks(SHOW_ID, [5], USER_A, 1);
    expect(held.success).toBe(true);
    expect(await getRemainingLockSeconds(SHOW_ID, [5])).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 1600));

    expect(await getRemainingLockSeconds(SHOW_ID, [5])).toBe(0);

    // The abandoning user no longer holds it, and anyone else can take it.
    const stale = await verifySeatLocks(SHOW_ID, [5], USER_A);
    expect(stale.valid).toBe(false);

    const reacquired = await acquireSeatLocks(SHOW_ID, [5], USER_B);
    expect(reacquired.success).toBe(true);
  });

  it('reports remaining time as the shortest TTL across the block', async () => {
    await acquireSeatLocks(SHOW_ID, [1], USER_A, 60);
    await acquireSeatLocks(SHOW_ID, [2], USER_A, 5);

    const remaining = await getRemainingLockSeconds(SHOW_ID, [1, 2]);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(5);
  });
});
