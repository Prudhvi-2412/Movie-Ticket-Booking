const db = require('../config/db');
const config = require('../config/env');
const { ApiError } = require('../utils/ApiError');

/**
 * Server-side pricing. This module is the only place an order total is
 * decided.
 *
 * The booking endpoint previously accepted `totalAmount` straight from the
 * request body and wrote it to the database, so a customer could post
 * `{ totalAmount: 1 }` and pay one rupee for any seats they liked. Nothing
 * the client sends about money is trusted now; the client is only ever told
 * what the total is.
 *
 * Category price comes from show_pricing, scaled by the show's clamped
 * demand multiplier, with a fallback ladder off base_price when an admin has
 * not configured a category.
 */
const TYPE_MULTIPLIER = { Silver: 1.0, Gold: 1.15, Platinum: 1.3, Recliner: 2.0 };

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** Effective per-seat-type prices for one show, keyed by seat type. */
const getShowPriceTable = async (showId) => {
  const shows = await db.query(
    'SELECT base_price, demand_multiplier FROM shows WHERE show_id = ?',
    [showId]
  );
  if (shows.length === 0) throw ApiError.notFound('Show not found.');

  const basePrice = Number(shows[0].base_price);
  const demand = Number(shows[0].demand_multiplier) || 1;

  const overrides = await db.query(
    'SELECT seat_type, price FROM show_pricing WHERE show_id = ?',
    [showId]
  );
  const overrideMap = new Map(overrides.map((r) => [r.seat_type, Number(r.price)]));

  const table = {};
  for (const [seatType, multiplier] of Object.entries(TYPE_MULTIPLIER)) {
    const configured = overrideMap.has(seatType) ? overrideMap.get(seatType) : basePrice * multiplier;
    table[seatType] = round2(configured * demand);
  }
  return { table, basePrice, demandMultiplier: demand };
};

/**
 * Prices a concrete set of seats.
 *
 * Seat types are read from the database by seat id — never taken from the
 * request — so relabelling a Platinum seat as Silver client-side changes
 * nothing.
 */
const priceSeats = async (showId, seatIds) => {
  const { table } = await getShowPriceTable(showId);

  const placeholders = seatIds.map(() => '?').join(',');
  const seats = await db.query(
    `SELECT s.seat_id, s.seat_row, s.seat_number, s.seat_type
       FROM seats s
       JOIN shows sh ON sh.screen_id = s.screen_id
      WHERE sh.show_id = ? AND s.seat_id IN (${placeholders}) AND s.is_active = TRUE`,
    [showId, ...seatIds]
  );

  if (seats.length !== seatIds.length) {
    throw ApiError.badRequest('One or more selected seats do not belong to this show.');
  }

  const lines = seats.map((seat) => ({
    seat_id: seat.seat_id,
    seat_row: seat.seat_row,
    seat_number: seat.seat_number,
    seat_type: seat.seat_type,
    label: `${seat.seat_row}${seat.seat_number}`,
    price: table[seat.seat_type] ?? table.Silver
  }));

  return { lines, priceTable: table };
};

/** Full order breakdown: subtotal, convenience fee, GST, total. */
const buildOrderSummary = (lines) => {
  const seatAmount = round2(lines.reduce((sum, l) => sum + l.price, 0));
  const convenienceFee = round2(lines.length * config.CONVENIENCE_FEE_PER_SEAT);
  const taxAmount = round2((seatAmount + convenienceFee) * config.GST_RATE);
  const totalAmount = round2(seatAmount + convenienceFee + taxAmount);

  return {
    seatCount: lines.length,
    seatAmount,
    convenienceFee,
    taxRate: config.GST_RATE,
    taxAmount,
    discountAmount: 0,
    totalAmount
  };
};

/** Convenience wrapper: price seats and summarise in one step. */
const quote = async (showId, seatIds) => {
  const { lines, priceTable } = await priceSeats(showId, seatIds);
  return { lines, priceTable, summary: buildOrderSummary(lines) };
};

module.exports = { getShowPriceTable, priceSeats, buildOrderSummary, quote, TYPE_MULTIPLIER, round2 };
