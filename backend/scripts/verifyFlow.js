#!/usr/bin/env node
/**
 * End-to-end verification against a running backend.
 *
 * Walks the full acceptance scenario over real HTTP — admin creates a city,
 * theatre, screen, seat map, movie and show; a customer discovers it, holds
 * seats, pays, and receives a ticket — and asserts the concurrency and
 * idempotency guarantees along the way.
 *
 *   npm run verify              # against http://localhost:5000
 *   API_URL=... npm run verify
 */
const crypto = require('crypto');

const API = (process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');

let passed = 0;
let failed = 0;
const failures = [];

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};

const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ${c.green('PASS')}  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  ${c.red('FAIL')}  ${label}${detail ? c.dim(` — ${detail}`) : ''}`);
  }
};

const section = (title) => console.log(`\n${c.bold(title)}`);

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
};

const run = async () => {
  console.log(c.bold(`\nCineWave end-to-end verification -> ${API}\n`));

  // ---------------------------------------------------------------
  section('0. Service health');
  const health = await call('GET', '/health');
  check('backend is reachable and healthy', health.status === 200 && health.body?.status === 'ok',
    JSON.stringify(health.body));
  check('database is connected', health.body?.dependencies?.database === 'connected');
  if (health.status !== 200) {
    console.log(c.red('\nBackend is not healthy — aborting.\n'));
    process.exit(1);
  }

  // ---------------------------------------------------------------
  section('1. Authentication & authorisation');
  const adminLogin = await call('POST', '/api/auth/login', {
    body: { email: 'admin@cinewave.com', password: 'Admin@123' }
  });
  check('admin can sign in', adminLogin.status === 200 && !!adminLogin.body?.accessToken,
    JSON.stringify(adminLogin.body));
  const adminToken = adminLogin.body?.accessToken;
  check('admin has the Admin role', adminLogin.body?.user?.role === 'Admin');

  const badLogin = await call('POST', '/api/auth/login', {
    body: { email: 'admin@cinewave.com', password: 'WrongPassword1' }
  });
  check('wrong password is rejected with 401', badLogin.status === 401);

  const suffix = crypto.randomBytes(3).toString('hex');
  const custA = await call('POST', '/api/auth/register', {
    body: { full_name: 'Test Customer A', email: `custa.${suffix}@example.com`, password: 'Customer@123' }
  });
  check('customer can register', custA.status === 201 && !!custA.body?.accessToken,
    JSON.stringify(custA.body));
  const tokenA = custA.body?.accessToken;

  const custB = await call('POST', '/api/auth/register', {
    body: { full_name: 'Test Customer B', email: `custb.${suffix}@example.com`, password: 'Customer@123' }
  });
  const tokenB = custB.body?.accessToken;
  check('second customer can register', custB.status === 201 && !!tokenB);

  check('self-registration cannot grant Admin', custA.body?.user?.role === 'Customer');

  const escalate = await call('POST', '/api/auth/register', {
    body: {
      full_name: 'Sneaky', email: `sneak.${suffix}@example.com`,
      password: 'Customer@123', role: 'Admin'
    }
  });
  check('a role field in the register body is ignored',
    escalate.status === 201 && escalate.body?.user?.role === 'Customer',
    JSON.stringify(escalate.body?.user));

  const noAuth = await call('GET', '/api/admin/dashboard');
  check('admin dashboard rejects anonymous callers with 401', noAuth.status === 401);

  const asCustomer = await call('GET', '/api/admin/dashboard', { token: tokenA });
  check('admin dashboard rejects a customer with 403', asCustomer.status === 403,
    `got ${asCustomer.status}`);

  // ---------------------------------------------------------------
  section('2. Admin creates the full catalogue chain');
  const loc = await call('POST', '/api/admin/locations', {
    token: adminToken,
    body: { city: `Testville-${suffix}`, state: 'Telangana', country: 'India' }
  });
  check('create location', loc.status === 201, JSON.stringify(loc.body));
  const locationId = loc.body?.location?.location_id;

  const theatre = await call('POST', '/api/admin/theatres', {
    token: adminToken,
    body: {
      location_id: locationId,
      name: `CineWave Multiplex ${suffix}`,
      location: 'Test Nagar',
      address: '1 Test Road',
      contact_phone: '+91 40 1234 5678',
      facilities: ['Dolby Atmos', 'Parking']
    }
  });
  check('create theatre', theatre.status === 201, JSON.stringify(theatre.body));
  const theatreId = theatre.body?.theatre?.theater_id;

  const screen = await call('POST', '/api/admin/screens', {
    token: adminToken,
    body: { theater_id: theatreId, screen_number: 1, name: 'Audi 1', screen_type: 'Premium' }
  });
  check('create screen', screen.status === 201, JSON.stringify(screen.body));
  const screenId = screen.body?.screen?.screen_id;

  const layout = await call('POST', `/api/admin/screens/${screenId}/seats/generate`, {
    token: adminToken,
    body: {
      rows: [
        { seat_type: 'Platinum', count: 6 },
        { seat_type: 'Gold', count: 6 },
        { seat_type: 'Silver', count: 6 }
      ]
    }
  });
  check('generate seat layout (18 seats)', layout.status === 201 && layout.body?.totalSeats === 18,
    JSON.stringify(layout.body?.totalSeats));

  const screenAfter = await call('GET', `/api/admin/screens/${screenId}`, { token: adminToken });
  check('screens.total_seats is maintained by trigger', screenAfter.body?.screen?.total_seats === 18,
    `got ${screenAfter.body?.screen?.total_seats}`);

  const movie = await call('POST', '/api/admin/movies', {
    token: adminToken,
    body: {
      title: `Verification Feature ${suffix}`,
      description: 'A film that exists purely to be booked by a test.',
      genre: 'Drama', language: 'English', duration_minutes: 120,
      certificate: 'UA', release_date: '2026-08-01', rating: 8.1,
      director: 'Test Director', cast_list: 'A Actor, B Actor', status: 'NowShowing'
    }
  });
  check('create movie', movie.status === 201, JSON.stringify(movie.body));
  const movieId = movie.body?.movie?.movie_id;

  const showTime = new Date(Date.now() + 6 * 3600_000);
  const show = await call('POST', '/api/admin/shows', {
    token: adminToken,
    body: {
      movie_id: movieId, screen_id: screenId, theater_id: theatreId, location_id: locationId,
      show_time: showTime.toISOString(),
      base_price: 200,
      pricing: { Silver: 200, Gold: 260, Platinum: 320, Recliner: 500 }
    }
  });
  check('create show', show.status === 201, JSON.stringify(show.body));
  const showId = show.body?.show?.show_id;

  // ---------------------------------------------------------------
  section('3. Admin validation rules');
  const overlap = await call('POST', '/api/admin/shows', {
    token: adminToken,
    body: {
      movie_id: movieId, screen_id: screenId,
      show_time: new Date(showTime.getTime() + 30 * 60_000).toISOString(),
      base_price: 200
    }
  });
  check('overlapping show on the same screen is rejected (409)', overlap.status === 409,
    `got ${overlap.status}: ${overlap.body?.message}`);

  const wrongTheatre = await call('POST', '/api/admin/shows', {
    token: adminToken,
    body: {
      movie_id: movieId, screen_id: screenId, theater_id: 999999,
      show_time: new Date(Date.now() + 30 * 3600_000).toISOString(), base_price: 200
    }
  });
  check('screen/theatre mismatch is rejected', wrongTheatre.status === 400,
    `got ${wrongTheatre.status}`);

  const pastShow = await call('POST', '/api/admin/shows', {
    token: adminToken,
    body: {
      movie_id: movieId, screen_id: screenId,
      show_time: new Date(Date.now() - 3600_000).toISOString(), base_price: 200
    }
  });
  check('a show in the past is rejected', pastShow.status === 400, `got ${pastShow.status}`);

  // ---------------------------------------------------------------
  section('4. Customer discovery');
  const byLocation = await call('GET', `/api/movies?locationId=${locationId}`);
  check('movie is discoverable in its location',
    byLocation.body?.movies?.some((m) => m.movie_id === movieId),
    `${byLocation.body?.movies?.length} movies returned`);

  const otherLocations = await call('GET', '/api/locations');
  const elsewhere = otherLocations.body?.locations?.find((l) => l.location_id !== locationId);
  const byOther = await call('GET', `/api/movies?locationId=${elsewhere?.location_id}`);
  check('movie is NOT listed in an unrelated location',
    !byOther.body?.movies?.some((m) => m.movie_id === movieId));

  const detail = await call('GET', `/api/movies/${movieId}?locationId=${locationId}`);
  check('movie detail lists the theatre with its showtimes',
    detail.body?.theatres?.some((t) => t.theater_id === theatreId && t.shows.length > 0),
    JSON.stringify(detail.body?.theatres?.length));

  const searchRes = await call('GET', `/api/search?q=Verification`);
  check('global search finds the movie', searchRes.body?.movies?.some((m) => m.movie_id === movieId));

  // ---------------------------------------------------------------
  section('5. Seat map & server-side pricing');
  const seatMap = await call('GET', `/api/shows/${showId}/seats`);
  check('seat map returns all 18 seats', seatMap.body?.seatMap?.length === 18,
    `got ${seatMap.body?.seatMap?.length}`);
  check('all seats start AVAILABLE',
    seatMap.body?.seatMap?.every((s) => s.status === 'AVAILABLE'));

  const platinum = seatMap.body?.seatMap?.find((s) => s.seat_type === 'Platinum');
  const silver = seatMap.body?.seatMap?.find((s) => s.seat_type === 'Silver');
  check('per-category pricing is applied', platinum?.price === 320 && silver?.price === 200,
    `platinum=${platinum?.price} silver=${silver?.price}`);

  // ---------------------------------------------------------------
  section('6. Redis seat locking under contention');
  const targetSeat = seatMap.body.seatMap[0];
  const secondSeat = seatMap.body.seatMap[1];

  const lockA = await call('POST', '/api/bookings/lock-seats', {
    token: tokenA,
    body: { showId, seatIds: [targetSeat.seat_id, secondSeat.seat_id] }
  });
  check('customer A acquires the lock', lockA.status === 200 && lockA.body?.success,
    JSON.stringify(lockA.body?.message));
  check('hold TTL comes from the server, not the client',
    lockA.body?.hold?.expiresInSeconds > 0 && lockA.body?.hold?.expiresInSeconds <= 600,
    `${lockA.body?.hold?.expiresInSeconds}s`);

  const expectedSeatTotal = targetSeat.price + secondSeat.price;
  check('server-computed subtotal matches the seat prices',
    lockA.body?.summary?.seatAmount === expectedSeatTotal,
    `${lockA.body?.summary?.seatAmount} vs ${expectedSeatTotal}`);

  const lockB = await call('POST', '/api/bookings/lock-seats', {
    token: tokenB,
    body: { showId, seatIds: [targetSeat.seat_id] }
  });
  check('customer B is refused the same seat (409)', lockB.status === 409,
    `got ${lockB.status}: ${lockB.body?.message}`);

  const mapForB = await call('GET', `/api/shows/${showId}/seats`, { token: tokenB });
  check('B sees the seat as LOCKED',
    mapForB.body?.seatMap?.find((s) => s.seat_id === targetSeat.seat_id)?.status === 'LOCKED');

  const mapForA = await call('GET', `/api/shows/${showId}/seats`, { token: tokenA });
  check('A sees the same seat as HELD_BY_ME',
    mapForA.body?.seatMap?.find((s) => s.seat_id === targetSeat.seat_id)?.status === 'HELD_BY_ME');

  // ---------------------------------------------------------------
  section('7. Booking creation');
  const bookingB = await call('POST', '/api/bookings', {
    token: tokenB,
    body: { showId, seatIds: [targetSeat.seat_id] }
  });
  check('B cannot book a seat it never held (409)', bookingB.status === 409,
    `got ${bookingB.status}: ${bookingB.body?.message}`);

  const bookingA = await call('POST', '/api/bookings', {
    token: tokenA,
    body: { showId, seatIds: [targetSeat.seat_id, secondSeat.seat_id] }
  });
  check('A creates a pending booking', bookingA.status === 201, JSON.stringify(bookingA.body));
  const bookingId = bookingA.body?.booking?.bookingId;
  const bookingRef = bookingA.body?.booking?.bookingRef;
  check('booking reference is CW-formatted', /^CW-\d{4}-\d{6}$/.test(bookingRef || ''), bookingRef);

  const expectedTotal = Math.round((expectedSeatTotal + 40 + (expectedSeatTotal + 40) * 0.18) * 100) / 100;
  check('total = seats + convenience fee + 18% GST',
    bookingA.body?.booking?.summary?.totalAmount === expectedTotal,
    `${bookingA.body?.booking?.summary?.totalAmount} vs ${expectedTotal}`);

  // ---------------------------------------------------------------
  section('8. Payment & webhook');
  const initiate = await call('POST', '/api/payments/initiate', {
    token: tokenA, body: { bookingId, paymentMethod: 'UPI' }
  });
  check('payment session opens', initiate.status === 200, JSON.stringify(initiate.body));
  check('checkout session leaks no signing material',
    !JSON.stringify(initiate.body).toLowerCase().includes('signature'),
    JSON.stringify(initiate.body?.checkoutSession));

  const forged = await fetch(`${API}/api/webhooks/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': 'deadbeef' },
    body: JSON.stringify({
      eventId: `evt_forged_${suffix}`, eventType: 'payment.captured',
      data: { bookingId, idempotencyKey: `idem_forged_${suffix}`, status: 'SUCCESS' }
    })
  });
  check('webhook with a bad signature is rejected (401)', forged.status === 401, `got ${forged.status}`);

  const unsigned = await fetch(`${API}/api/webhooks/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: `evt_unsigned_${suffix}`, eventType: 'payment.captured',
      data: { bookingId, idempotencyKey: `idem_unsigned_${suffix}`, status: 'SUCCESS' }
    })
  });
  check('webhook with NO signature is rejected (401)', unsigned.status === 401, `got ${unsigned.status}`);

  const pay = await call('POST', '/api/payments/confirm', {
    token: tokenA,
    body: { bookingId, orderId: initiate.body?.checkoutSession?.orderId, paymentMethod: 'UPI', outcome: 'success' }
  });
  check('payment confirms the booking', pay.status === 200 && pay.body?.status === 'Confirmed',
    JSON.stringify(pay.body));

  const payAgain = await call('POST', '/api/payments/confirm', {
    token: tokenA, body: { bookingId, paymentMethod: 'UPI', outcome: 'success' }
  });
  check('paying twice is a harmless no-op', payAgain.status === 200,
    JSON.stringify(payAgain.body));

  const payments = await call('GET', `/api/payments/booking/${bookingId}`, { token: tokenA });
  const successful = payments.body?.payments?.filter((p) => p.payment_status === 'Success') || [];
  check('exactly one successful payment row exists', successful.length === 1,
    `found ${successful.length}`);

  // ---------------------------------------------------------------
  section('9. Post-booking state');
  const mapAfter = await call('GET', `/api/shows/${showId}/seats`);
  const bookedSeat = mapAfter.body?.seatMap?.find((s) => s.seat_id === targetSeat.seat_id);
  check('the paid seat is now BOOKED', bookedSeat?.status === 'BOOKED', bookedSeat?.status);
  check('available count dropped by two',
    mapAfter.body?.availableSeats === 16, `got ${mapAfter.body?.availableSeats}`);

  const relock = await call('POST', '/api/bookings/lock-seats', {
    token: tokenB, body: { showId, seatIds: [targetSeat.seat_id] }
  });
  check('a booked seat can never be locked again (409)', relock.status === 409, `got ${relock.status}`);

  const ticket = await call('GET', `/api/bookings/${bookingId}/ticket`, { token: tokenA });
  check('digital ticket is issued', ticket.status === 200 && !!ticket.body?.ticket?.qrPayload,
    JSON.stringify(ticket.body?.message));
  check('ticket lists both seats', ticket.body?.ticket?.seats?.length === 2);

  const ticketAsB = await call('GET', `/api/bookings/${bookingId}/ticket`, { token: tokenB });
  check("another customer cannot read A's ticket (403)", ticketAsB.status === 403, `got ${ticketAsB.status}`);

  const mine = await call('GET', '/api/bookings/my', { token: tokenA });
  check('booking appears in My Bookings',
    mine.body?.bookings?.some((b) => b.booking_id === bookingId));
  check('booking is grouped as upcoming',
    mine.body?.grouped?.upcoming?.some((b) => b.booking_id === bookingId));

  // ---------------------------------------------------------------
  section('10. Cancellation returns seats to the pool');
  const thirdSeat = mapAfter.body.seatMap.find((s) => s.status === 'AVAILABLE');
  await call('POST', '/api/bookings/lock-seats', {
    token: tokenB, body: { showId, seatIds: [thirdSeat.seat_id] }
  });
  const bookingB2 = await call('POST', '/api/bookings', {
    token: tokenB, body: { showId, seatIds: [thirdSeat.seat_id] }
  });
  const bookingB2Id = bookingB2.body?.booking?.bookingId;
  check('B books a different seat', bookingB2.status === 201);

  const cancel = await call('POST', `/api/bookings/${bookingB2Id}/cancel`, { token: tokenB });
  check('B can cancel their booking', cancel.status === 200, JSON.stringify(cancel.body));

  const mapAfterCancel = await call('GET', `/api/shows/${showId}/seats`);
  check('the cancelled seat is available again',
    mapAfterCancel.body?.seatMap?.find((s) => s.seat_id === thirdSeat.seat_id)?.status === 'AVAILABLE');

  const cancelOther = await call('POST', `/api/bookings/${bookingId}/cancel`, { token: tokenB });
  check("a customer cannot cancel someone else's booking (403)", cancelOther.status === 403,
    `got ${cancelOther.status}`);

  // ---------------------------------------------------------------
  section('11. Input validation & error contract');
  const badBody = await call('POST', '/api/bookings/lock-seats', {
    token: tokenA, body: { showId: 'not-a-number', seatIds: [] }
  });
  check('invalid payload is rejected with 400', badBody.status === 400, `got ${badBody.status}`);
  check('error responses carry {success:false, message}',
    badBody.body?.success === false && typeof badBody.body?.message === 'string');

  const tooMany = await call('POST', '/api/bookings/lock-seats', {
    token: tokenA, body: { showId, seatIds: Array.from({ length: 15 }, (_, i) => i + 1) }
  });
  check('over-large seat selection is rejected', tooMany.status === 400, `got ${tooMany.status}`);

  const missing = await call('GET', '/api/movies/99999999');
  check('unknown movie returns 404', missing.status === 404, `got ${missing.status}`);
  check('404 body exposes no stack trace', !missing.body?.stack);

  const injection = await call('GET', "/api/movies?search=' OR 1=1 --");
  check('SQL injection attempt is handled safely', injection.status === 200,
    `got ${injection.status}`);

  // ---------------------------------------------------------------
  section('12. Admin analytics reflect real data');
  const dash = await call('GET', '/api/admin/dashboard', { token: adminToken });
  check('dashboard loads', dash.status === 200);
  check('total revenue is greater than zero', Number(dash.body?.kpis?.totalRevenue) > 0,
    `${dash.body?.kpis?.totalRevenue}`);
  check('booking count is non-zero', Number(dash.body?.kpis?.totalBookings) > 0);
  check('the new booking shows in Recent Bookings',
    dash.body?.recentBookings?.some((b) => b.booking_ref === bookingRef));

  const analytics = await call('GET', '/api/admin/analytics', { token: adminToken });
  check('analytics endpoint returns every dataset',
    ['revenueByMovie', 'revenueByTheatre', 'revenueByLocation', 'occupancy',
      'dailyTrend', 'peakHours', 'seatCategories', 'paymentOutcomes']
      .every((k) => Array.isArray(analytics.body?.[k])));
  check('payment success rate is reported',
    typeof analytics.body?.paymentSuccessRate === 'number');

  const adminBookings = await call('GET', `/api/admin/bookings?search=${bookingRef}`, { token: adminToken });
  check('admin can find the booking', adminBookings.body?.bookings?.length >= 1);

  const webhookLogs = await call('GET', '/api/admin/webhook-logs', { token: adminToken });
  check('webhook ledger recorded the payment event',
    webhookLogs.body?.logs?.some((l) => l.status === 'PROCESSED'));

  // ---------------------------------------------------------------
  section('13. Cleanup');
  // The run creates a whole catalogue chain and two accounts. Left behind,
  // they show up in the admin dashboard and skew its revenue figures, so the
  // script removes what it can. Anything with a paid booking against it is
  // deactivated rather than deleted -- the same rule the API applies to a
  // human admin, and a useful check that those endpoints behave.
  const cleanup = [
    ['show', `/api/admin/shows/${showId}`],
    ['movie', `/api/admin/movies/${movieId}`],
    ['screen', `/api/admin/screens/${screenId}`],
    ['theatre', `/api/admin/theatres/${theatreId}`],
    ['location', `/api/admin/locations/${locationId}`]
  ];

  let cleaned = 0;
  for (const [label, path] of cleanup) {
    // eslint-disable-next-line no-await-in-loop
    const res = await call('DELETE', path, { token: adminToken });
    if (res.status === 200) cleaned += 1;
    else console.log(`  ${c.dim(`could not remove test ${label}: ${res.body?.message}`)}`);
  }
  check('test fixtures removed or deactivated', cleaned === cleanup.length,
    `${cleaned}/${cleanup.length}`);

  for (const token of [tokenA, tokenB]) {
    // eslint-disable-next-line no-await-in-loop
    await call('POST', '/api/auth/logout', { token });
  }

  console.log(c.dim(
    `  note: test customer accounts (custa/custb/sneak.${suffix}@example.com) remain — ` +
    'accounts are never hard-deleted so their bookings stay auditable.'
  ));

  // ---------------------------------------------------------------
  console.log(`\n${c.bold('─'.repeat(60))}`);
  console.log(`${c.bold('Result:')} ${c.green(`${passed} passed`)}, ${failed ? c.red(`${failed} failed`) : '0 failed'}`);
  if (failed) {
    console.log(c.red('\nFailed checks:'));
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log('');
  process.exit(failed ? 1 : 0);
};

run().catch((err) => {
  console.error(c.red(`\nVerification crashed: ${err.stack}\n`));
  process.exit(1);
});
