# Database Normalization & Design Strategy

## 1. Relational Design Overview
The system follows a highly normalized structure (up to 3NF) to ensure data redundancy is minimized and data integrity is maintained.

### Entities & Relationships
- **Users**: Centralized user data.
- **Movies**: Catalog of films.
- **Theaters & Screens**: Hierarchical relationship (1 Theater -> Many Screens).
- **Shows**: The bridge between Movies, Screens, and Time.
- **Seats**: Physical layout of a screen.
- **Bookings**: Transactional record connecting Users to Shows.
- **Booking_Seats**: Junction table for Many-to-Many relationship (1 Booking -> Many Seats).
- **Payments**: Linked to Bookings for financial tracking.

## 2. Normalization Process

### First Normal Form (1NF)
- All tables have a primary key.
- No multi-valued attributes (e.g., instead of storing multiple seats in a comma-separated string in `bookings`, we use a separate `booking_seats` table).

### Second Normal Form (2NF)
- All non-key attributes are fully functional dependent on the primary key.
- Example: `Movie_Title` and `Duration` are moved to `movies` table rather than being repeated in `shows`.

### Third Normal Form (3NF)
- No transitive dependencies.
- Example: `Theater_Address` is in the `theaters` table. In the `screens` table, we only store `theater_id`. We don't store the address in `screens` or `shows`.

## 3. DBMS Concepts Applied
- **Referential Integrity**: Enforced via `FOREIGN KEY` with `ON DELETE CASCADE/SET NULL`.
- **Concurrency Control**: Handled via `START TRANSACTION` and `COMMIT/ROLLBACK` in booking procedures to prevent double-booking.
- **Data Integrity**: `CHECK` constraints for ratings and pricing.
- **Performance**: `INDEX` on frequently searched columns like `show_time` and `movie_id`.
