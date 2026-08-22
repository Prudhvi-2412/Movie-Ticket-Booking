const db = require('../config/db');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const { recordAudit } = require('../services/auditService');

const rowLabel = (index) => {
  // A..Z, then AA, AB... so layouts past 26 rows still generate cleanly.
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
};

/** Groups a flat seat list into rows for rendering. */
const toLayout = (seats) => {
  const rows = new Map();
  for (const seat of seats) {
    if (!rows.has(seat.seat_row)) rows.set(seat.seat_row, []);
    rows.get(seat.seat_row).push(seat);
  }
  return [...rows.entries()].map(([row, rowSeats]) => ({
    row,
    seat_type: rowSeats[0].seat_type,
    seats: rowSeats.sort((a, b) => a.seat_number - b.seat_number)
  }));
};

/** GET /api/admin/screens/:screenId/seats */
const getSeatMap = asyncHandler(async (req, res) => {
  const { screenId } = req.params;

  const screens = await db.query(
    `SELECT sc.screen_id, sc.screen_number, sc.name, sc.screen_type, sc.total_seats,
            t.name AS theater_name
       FROM screens sc JOIN theaters t ON t.theater_id = sc.theater_id
      WHERE sc.screen_id = ?`,
    [screenId]
  );
  if (screens.length === 0) throw ApiError.notFound('Screen not found.');

  const seats = await db.query(
    `SELECT seat_id, seat_row, seat_number, seat_type, is_active
       FROM seats WHERE screen_id = ? ORDER BY seat_row, seat_number`,
    [screenId]
  );

  res.json({ success: true, screen: screens[0], totalSeats: seats.length, layout: toLayout(seats), seats });
});

/**
 * POST /api/admin/screens/:screenId/seats/generate
 *
 * Builds a whole seat map in one shot from a row plan, which is how an admin
 * actually thinks about an auditorium. `rows` is an array like
 *   [{ seat_type: 'Recliner', count: 8 }, { seat_type: 'Gold', count: 12 }]
 * applied front-to-back; row letters are assigned automatically.
 *
 * Refuses to run when the screen already has bookings — regenerating a
 * layout deletes seat rows, and seats referenced by a sold ticket must not
 * disappear underneath it.
 */
const generateSeatLayout = asyncHandler(async (req, res) => {
  const { screenId } = req.params;
  const { rows, replace = true } = req.body;

  const screens = await db.query('SELECT * FROM screens WHERE screen_id = ?', [screenId]);
  if (screens.length === 0) throw ApiError.notFound('Screen not found.');

  const [{ booked }] = await db.query(
    `SELECT COUNT(*) AS booked
       FROM booking_seats bs JOIN seats s ON s.seat_id = bs.seat_id
      WHERE s.screen_id = ?`,
    [screenId]
  );
  if (replace && Number(booked) > 0) {
    throw ApiError.conflict(
      'This screen already has tickets sold against its seat map, so the layout cannot be regenerated. ' +
      'Create a new screen instead.'
    );
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (replace) {
      await connection.query('DELETE FROM seats WHERE screen_id = ?', [screenId]);
    }

    const values = [];
    let rowIndex = 0;
    for (const row of rows) {
      const label = row.row || rowLabel(rowIndex);
      for (let seatNumber = 1; seatNumber <= row.count; seatNumber += 1) {
        values.push([screenId, label, seatNumber, row.seat_type]);
      }
      rowIndex += 1;
    }

    if (values.length === 0) throw ApiError.badRequest('At least one row is required.');

    await connection.query(
      `INSERT INTO seats (screen_id, seat_row, seat_number, seat_type) VALUES ?
       ON DUPLICATE KEY UPDATE seat_type = VALUES(seat_type), is_active = TRUE`,
      [values]
    );

    await connection.commit();

    await recordAudit(req.user.userId, 'GENERATE_LAYOUT', 'SCREEN', screenId, { seats: values.length });

    const seats = await db.query(
      `SELECT seat_id, seat_row, seat_number, seat_type, is_active
         FROM seats WHERE screen_id = ? ORDER BY seat_row, seat_number`,
      [screenId]
    );

    res.status(201).json({
      success: true,
      message: `${values.length} seats configured.`,
      totalSeats: seats.length,
      layout: toLayout(seats)
    });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
});

/** PUT /api/admin/seats/:id — change one seat's category or availability. */
const updateSeat = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { seat_type, is_active } = req.body;

  const existing = await db.query('SELECT * FROM seats WHERE seat_id = ?', [id]);
  if (existing.length === 0) throw ApiError.notFound('Seat not found.');

  await db.query(
    `UPDATE seats SET seat_type = COALESCE(?, seat_type), is_active = COALESCE(?, is_active)
      WHERE seat_id = ?`,
    [seat_type ?? null, is_active ?? null, id]
  );

  const rows = await db.query('SELECT * FROM seats WHERE seat_id = ?', [id]);
  res.json({ success: true, message: 'Seat updated.', seat: rows[0] });
});

/** PUT /api/admin/screens/:screenId/seats/bulk — retype a whole row at once. */
const bulkUpdateSeats = asyncHandler(async (req, res) => {
  const { screenId } = req.params;
  const { seat_ids, seat_type, is_active } = req.body;

  const placeholders = seat_ids.map(() => '?').join(',');
  const result = await db.query(
    `UPDATE seats
        SET seat_type = COALESCE(?, seat_type), is_active = COALESCE(?, is_active)
      WHERE screen_id = ? AND seat_id IN (${placeholders})`,
    [seat_type ?? null, is_active ?? null, screenId, ...seat_ids]
  );

  await recordAudit(req.user.userId, 'BULK_UPDATE', 'SEATS', screenId, { count: result.affectedRows, seat_type });
  res.json({ success: true, message: `${result.affectedRows} seat(s) updated.`, updated: result.affectedRows });
});

module.exports = { getSeatMap, generateSeatLayout, updateSeat, bulkUpdateSeats, rowLabel, toLayout };
