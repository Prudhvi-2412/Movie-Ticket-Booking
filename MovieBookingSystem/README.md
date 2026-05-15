# Movie Ticket Booking System (MySQL DBMS Project)

A professional, industry-grade relational database system for managing movie ticket reservations. This project focuses purely on DBMS concepts using MySQL.

## 🚀 Key Features
- **Scalable Relational Design**: 9 normalized tables handling Users, Movies, Theaters, Shows, and Bookings.
- **ACID Transactions**: Stored procedures with explicit `START TRANSACTION` and `ROLLBACK` to prevent race conditions (e.g., double-booking of seats).
- **Automated Workflows**: Triggers for logging system events and validating data integrity.
- **Advanced Analytics**: Pre-computed Views for revenue, occupancy, and customer behavior.
- **Optimized Performance**: Strategic indexing on high-traffic columns.

## 📁 Project Structure
The project is organized into a modular directory structure for better maintainability:

- **Schema/**: Core database and table definitions (`tables.sql`).
- **Data/**: Sample data insertion scripts (`insert_data.sql`).
- **Logic/**: Business logic layer (`procedures.sql`, `functions.sql`, `triggers.sql`).
- **Automation/**: Background maintenance tasks (`background_tasks.sql`).
- **Analytics/**: Reporting and advanced querying (`views.sql`, `reports.sql`, `advanced_analytics.sql`).
- **Docs/**: Technical documentation, ER diagrams, and interview preparation guides.

## 🛠️ DBMS Concepts Demonstrated
1. **Normalization**: Adherence to 1NF, 2NF, and 3NF.
2. **Referential Integrity**: Robust use of Foreign Keys and Cascading actions.
3. **Complex Joins**: Multi-table relationships for reporting.
4. **Data Consistency**: Check constraints and ENUM types.
5. **Procedural SQL**: Using Stored Procedures and Triggers for backend logic.

## 📖 How to Run
1. Create the database: `CREATE DATABASE MovieBookingDB;`
2. Run `tables.sql` to build the structure.
3. Run `insert_data.sql` to populate sample data.
4. Run `procedures.sql`, `triggers.sql`, and `views.sql` to enable advanced features.
5. Execute queries in `reports.sql` to see the system in action.

## 🎯 Assumptions
- One booking can contain multiple seats.
- Payments are processed after the booking record is created in 'Pending' status.
- Once a booking is cancelled, a trigger could be added to auto-refund (implemented via procedure).
