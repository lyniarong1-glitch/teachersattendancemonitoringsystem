# Attendance Buddy

create a system using this code:

+-----------------------------------------------------------------------------------+
|                              STUDENT ASSISTANT MODULE                             |
|  [ Sign Up / Log In ] ──> [ Select Department ] ──> [ Select Teacher ]            |
|                                                               │                   |
|                                                               ▼                   |
|  [ Confirmation Screen ] <── [ Click Submit ] <── [ Input Room, Time, Status, ]   |
|                                                     [ Remarks                 ]   |
+-----------------------------------------------------------------------------------+
                                        │
                                        ▼ (Saves to Shared Database)
+-----------------------------------------------------------------------------------+
|                                     HR MODULE                                     |
|  [ Sign Up / Log In ] ──> [ View Master Attendance Table ]                        |
|                                     │                                             |
|          ┌──────────────────────────┼──────────────────────────┐                  |
|          ▼                          ▼                          ▼                  |
|  [ Search & Filter ]     [ Edit / Update Record ]    [ Export (PDF/Excel) / Print ]|
+-----------------------------------------------------------------------------------+




1.Sign Up & Authentication:Applies to both SA and HR roles.

Users register with personal details (Full Name, DOB, Address, Email, Credentials). Access rights are segregated by user role upon login.

2.Attendance Recording:Student Assistant task.

The SA selects a department (e.g., BSHM), chooses a teacher from the auto-populated list, and logs room location, arrival/departure times (30-min intervals), attendance status, and remarks.

3.Database Commit & Audit Logging:Automated system action.

Upon clicking Submit, the system attaches the exact timestamp and the logged-in SA's account ID to the record before pushing it to the HR database view.

4.HR Oversight & Reporting:Human Resources task.

HR monitors entries via the master table, searches or filters records by teacher or department, performs edits if errors exist (with automated edit timestamps), and exports reports to Excel/PDF or print layout.



2. Recommended Database Schema

To build this system, you will need a relational database (e.g., MySQL, PostgreSQL, or SQLite) structured with the following core entities:

users Table

Stores authentication and profile details for both Student Assistants and HR personnel.

user_id (Primary Key, Auto-increment)

full_name (VARCHAR)

birthdate (DATE)

address (TEXT)

email (VARCHAR, Unique)

username (VARCHAR, Unique)

password_hash (VARCHAR)

role (ENUM: 'Student Assistant', 'HR')

departments Table

department_id (Primary Key)

department_name (VARCHAR) — BSHM, BSBA, CELA, ITE, CBA, CRIM

teachers Table

teacher_id (Primary Key)

full_name (VARCHAR) — Pre-populated with Steven John Maeda, Jay Anne Lihayhay, etc.

department_id (Foreign Key referencing departments)

attendance_records Table

record_id (Primary Key)

teacher_id (Foreign Key referencing teachers)

department_id (Foreign Key referencing departments)

submitted_by_sa_id (Foreign Key referencing users)

room_assignment (VARCHAR) — e.g., A-201, HME Function Hall, etc.

time_arrival (TIME) — 7:00 AM to 9:00 PM (30-min intervals)

time_out (TIME)

attendance_status (ENUM: 'Present', 'Late', 'Absent')

remarks (VARCHAR) — On Leave, Seminar, No Class, Class Rescheduled, Other

date_submitted (DATE, Default: Current Date)

time_submitted (TIME, Default: Current Time)

last_edited_by_hr_id (Foreign Key referencing users, Nullable)

last_edited_timestamp (DATETIME, Nullable)

3. UI/UX Implementation Specifications

Step 5: Combo Box Controls (SA Module)

Time Dropdown (Arrival & Out): Pre-fill options programmatically in 30-minute increments from 07:00 to 21:00:

["07:00 AM", "07:30 AM", "08:00 AM", ..., "08:30 PM", "09:00 PM"]

Room Selection: Dropdown populated directly from the 43 provided room locations (A-201 through SA-406).

Step 11 & 12: Master Attendance View & Search (HR Module)

The HR main view should feature a data table displaying the following columns:

Teacher NameDepartmentRoomTime InTime OutStatusRemarksDate SubmittedTime SubmittedSubmitted By (SA)ActionsSteven John MaedaBSHMHME Function Hall08:00 AM10:00 AMPresentNone2026-07-3108:05 AMJane Doe (SA)[Edit]

Filter Bar: Include dynamic filters at the top of the table for Department (Dropdown) and Teacher Name (Search input field).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a2da94eb-c2f7-4e51-b282-ef726d54f255).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
