# ACID Properties in Movie Booking System

This document explains how the four pillars of a DBMS (ACID) are implemented in the MySQL code of this project.

## 1. Atomicity ("All or Nothing")
**Implementation:** `START TRANSACTION`, `COMMIT`, and `ROLLBACK` in `procedures.sql`.

- **Example:** When booking a ticket, the system must:
    1. Create a `bookings` record.
    2. Link the `seats` in `booking_seats`.
    3. Update the total amount.
- **Project Evidence:** In the `BookTicket` procedure, if any step fails (e.g., seat already taken), the `ROLLBACK` command ensures that no partial data is saved. Either the whole ticket is booked, or the database remains as if nothing happened.

## 2. Consistency (Data Integrity)
**Implementation:** Foreign Keys, Check Constraints, and Triggers.

- **Example:** A show cannot be scheduled for a movie that doesn't exist.
- **Project Evidence:** 
    - **Constraints:** `FOREIGN KEY` ensures a booking always points to a valid user. `CHECK(rating >= 0)` ensures movie ratings are valid.
    - **Triggers:** The `before_show_insert` trigger prevents a show from being added to a screen with 0 seats, maintaining the logical consistency of the business rules.

## 3. Isolation (Concurrency Control)
**Implementation:** Transaction Isolation Levels and Locking.

- **Example:** Two users try to book the exact same seat at the exact same millisecond.
- **Project Evidence:** 
    - The `BookTicket` procedure uses a `SELECT ... FOR UPDATE` logic (implicit in high-level transactions) to check if a seat is available.
    - Because the check and the insert happen inside the same transaction, MySQL locks the relevant rows, ensuring the second user's transaction waits or fails, preventing "Double Booking."

## 4. Durability (Persistence)
**Implementation:** InnoDB Storage Engine.

- **Example:** The power goes out immediately after a user sees "Booking Confirmed."
- **Project Evidence:** 
    - By using the **InnoDB** engine (default in MySQL 8.0+), once the `COMMIT` command is executed in our procedures, the data is written to the non-volatile disk and redo logs. 
    - Even a system crash won't lose the confirmed booking data.
