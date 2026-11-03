# Yoga Asana Learning Application — Scope

## 1. Purpose of This Document

This document defines the complete Phase 1 scope for a browser-based Yoga Asana Learning Application.

This `scope.MD` will be given to Muse in the following sequence:

1. **POC Phase** — Validate critical technical assumptions. All POC code must reside only inside a `POC/` folder.
2. **POC Approval Gate** — After the POC, Muse must produce a POC report and **STOP**. No design or application code may begin until the project owner explicitly approves the POC report.
3. **Design Phase** — After POC approval, Muse will create `design.MD` covering technology stack, architecture, data model, APIs, storage, real-time device synchronisation, TTS, and security.
4. **UI Design Phase** — After `design.MD` approval, Muse will create `uidesign.MD` with wireframes and static web pages. These will be iterated and approved before final application development begins.

**No assumptions should be made where this scope states that a decision belongs to the design phase.**

---

## 2. Project Overview

The application allows users to learn and practise yoga asanas.

There are two types of libraries:

- **Public Library** — Available to all logged-in users. Asanas are created directly by admins, or submitted by users and approved by admins.
- **Personal Library** — Private to each user. Contains asanas created by that user that have not been moved to the Public Library.

Users select an asana, follow step-by-step coaching using one to three devices, capture their pose from multiple angles, and receive AI-generated pose correction feedback.

### Core Principles

- Login is mandatory for all functionality.
- Asana creation is AI-generated only. Users cannot manually edit asana instructions. This prevents faulty or inappropriate poses from being created through manual editing.
- **C16 (2026-11-03, owner-approved) — admin-only exception:** while *creating* an asana (before Accept), an **admin** may edit a step's text and duration, add, delete and reorder steps (2–12 steps, from settings), and regenerate one step's image with an optional adjustment instruction. Edited text must pass the AI intent check; an edited step's image becomes *stale* and the asana cannot be saved until every image is fresh. Regular users remain fully locked (server-enforced). Not extended to published asanas or pending submissions.
- Once an asana's step images are generated and accepted, those stored images are reused forever. They are **never recreated during practice sessions**.
- User camera photos are **never stored**, for privacy.
- Only text results and annotated character images are stored in Practice History.

---

## 3. Phase 1 — In Scope

- Email + OTP registration and login
- Admin and normal user roles
- Public and Personal asana libraries
- AI asana creation using `muse-wonder-1.0` and `muse-image-1.0`
- Character selection for asana generation
- Admin character management
- Reference PDF upload and batch parsing
- AI feedback/correction loop for asanas (maximum 3 attempts by default)
- Publishing workflow: user submission → admin approval/rejection
- Favourites — multiple named lists
- Multi-device coaching sessions (maximum 3 devices)
- Synchronised multi-angle photo capture
- AI pose validation and correction
- Practice History with calendar view
- Health disclaimer and safety cautions
- Admin Panel for configurable limits and public asana management
- English language only
- Browser-based access on laptop and mobile. No native apps in Phase 1.

## 4. Phase 1 — Out of Scope

- Native mobile applications
- Languages other than English
- Manual editing of asana steps, instructions, or metadata
- User administration by admins (no creating/promoting/deleting users)
- Hard delete of any asana — only enable/disable is allowed
- Copying a public asana into a personal library
- Pose scoring or grading — feedback is only correct/incorrect per step with correction text
- Storing user camera photos
- Auto-playing an entire favourites list as a sequence
- Editing and resubmitting a rejected asana
- Requesting a specific number of steps, or regenerating an asana outside the feedback loop

---

## 5. Users, Roles and Authentication

### 5.1 Registration

During registration, the user provides:

- First name
- Last name
- Email ID
- Age
- ZIP code

Registration is verified by an OTP sent to the user's email.

**Registration OTP rule:**
- A maximum of **3 OTP requests per email address, for a lifetime**.
- If all 3 are exhausted without completing registration, that email is **permanently blocked. There is no recovery or alternate process.**

### 5.2 Login

- Login is by email + OTP only. There is no password.
- Login is mandatory. Nothing in the application can be browsed or practised without logging in.

**Login OTP rules:**
- Maximum **3 failed OTP attempts** → the account is locked for **6 hours**.
- If 3 failed OTP attempts happen a **second time** after the lockout, the account is **permanently blocked. There is no recovery.**

### 5.3 Admins

- Admin email IDs are configured in an application **config file**.
- Any user whose email is in that config is an Admin.
- Admins also log in using email OTP. There is no separate admin login.
- There is no user administration: admins cannot create, promote, disable, or delete users.

### 5.4 Device Limit

- A user may be logged in on a maximum of **3 devices** at the same time.
- If a 4th device attempts to log in, login is **refused** with a message stating that the user is already logged in on 3 devices and must log out from one existing device first.

---

## 6. Asana Data

Every asana stores:

- Asana name
- Character used for generation
- Step-by-step instructions (one text file per step)
- One character-based image per step
- Difficulty *(AI-generated)*
- Body part *(AI-generated)*
- Category *(AI-generated)*
- Benefits *(AI-generated)*
- Contraindications / cautions *(AI-generated)*
- Duration per step *(AI-generated)*
- Creator information and library status (public / personal / pending / rejected / disabled)

Difficulty, body part, and category are used for **search and filtering** in the libraries.

Users cannot edit any of this metadata.

### File Structure

The storage structure must follow the existing `chakrasana` example under the public folder:

- One folder per asana
- One image per step
- One instruction `.txt` file per step

Example pattern:
/asanas/<asana-name>/ step-1.png step-1.txt step-2.png step-2.txt ..


The exact mapping of this file structure to the database/object storage will be decided in `design.MD`.

---

## 7. Characters

- Characters are stored in a `characters/` folder, organised into sub-folders.
- Character images inside the **`default` folder are always proposed/shown first** during asana creation.
- The user selects one character while creating an asana.
- The selected character appears in **every generated step image** for that asana.
- The same stored character images are shown as the reference during coaching.

### Character Management

- Only **admins** can add characters.
- Admins can:
  - Upload a new character folder
  - Add character images to an existing folder

---

## 8. Reference Library (PDFs)

- Reference material is based on books such as *Common Yoga Protocol English, 2018 (Government of India)*, stored under a `reference/` folder.
- Each PDF must reside in **its own folder** inside `reference/`, together with its extracted content.
- Admins can upload new reference PDFs in the future.

### Parsing

- On upload, the application extracts text and images from the PDF, organised **per asana**, and stores them separately in that PDF's folder.
- Parsing may take a long time. **Design hint:** parsing must run as a background/batch job after upload, not block the admin.
- Each PDF must have a visible processing status, e.g.: `Processing / Ready / Failed`.

The extracted reference content is used for:
1. Checking whether an asana exists in a reference book during creation (for normal users).
2. Validating user feedback for alignment with the reference book.

---

## 9. Asana Creation Flow

The creation process is identical for admins and normal users.

1. User enters the asana name and selects a character (default folder characters shown first).
2. **Reference check (normal users only):**
   - If the asana is **not found in any reference PDF**, a normal user **cannot create it**. Creation is blocked and the user is notified.
   - **Admins are exempt** from this restriction and may create asanas not present in any reference book.
3. **Duplicate check:**
   - A user cannot create a personal asana whose name already exists in the Public Library.
4. The application calls **`muse-wonder-1.0`** to generate step-by-step instructions to reach the final pose. The model splits the asana into one or more steps depending on its complexity, and also returns difficulty, body part, category, benefits, contraindications/cautions, and duration per step.
5. The generated steps are shown to the user.
6. The application calls **`muse-image-1.0`** with the step instructions and the selected character, generating **one image per step** featuring that character.
7. The user reviews the result and may use the feedback loop (Section 10), within the allowed limit.
8. Once accepted:
   - Asanas created by an **admin** go directly into the **Public Library**.
   - Asanas created by a **user** go into their **Personal Library**.

### Important Rules

- Users cannot choose the number of steps.
- Users cannot manually edit any instruction text.
- Users cannot regenerate an asana except through the feedback loop.
- Once accepted and stored, step images are **never generated again**. Practice sessions always display the stored images.

---

## 10. Feedback / Correction Loop

A user or admin may give feedback on a generated asana's pose/instructions. This is the **only** way an asana can be modified.

### Validation Sequence

Every feedback submission passes through these checks in order:

1. **Intent check:** The feedback is sent to `muse-wonder-1.0`. Each line is extracted and its intent is checked. Every line must be only a correction request about the asana pose. If any line is anything else, the feedback is **rejected with the reason given by the model**.
2. **Reference existence check:** If the asana is not found in any reference PDF, the user is notified that only yoga poses in reference books can be altered, and the feedback is rejected.
   - **Admins are exempt from this check** (and check 3) for asanas they created outside the reference books. The intent check (check 1) applies to everyone, including admins.
3. **Alignment check:** The requested change is validated against the reference book instructions. If it is not aligned with the reference book, the feedback is **rejected**.
4. **Regeneration:** If all checks pass, `muse-wonder-1.0` regenerates the instructions and `muse-image-1.0` regenerates **all step images** — not just the affected step — so that the character and style remain consistent across steps. The new version replaces the old version. No old version is kept.

### Feedback Rules

- Maximum **3 feedbacks per asana** (default; admin-configurable — see Section 15).
- **Rejected feedback also counts** toward the limit of 3.
- Each feedback submission is completely standalone. Previous feedback text and previous model responses are **never** sent with the next feedback submission. There is no conversation memory in this loop.
- The same feedback loop and limits apply to admins and users (except the admin reference exemption above).

---

## 11. Libraries and Publishing Workflow

### 11.1 Public Library

- Visible to all logged-in users.
- Supports search and filters using difficulty, body part, and category.
- Asanas contributed by a user and approved display: **"Submitted by [user's first name]"**.
- Admins can **enable or disable** any public asana. There is no hard delete.
- A disabled public asana is hidden and cannot be practised.

### 11.2 Personal Library

- Visible only to its owner.
- Users can **disable** their personal asanas. There is **no permanent delete**.
- Disable is **reversible** — a user can re-enable their own disabled asana.
- A disabled asana cannot be practised, cannot be submitted for publication, and is hidden from favourites.
- Users cannot edit personal asanas except through the feedback loop (Section 10).
- Users cannot copy a public asana into their personal library.

### 11.3 Publishing Workflow

1. A user submits a personal asana for publication.
2. While it is **pending approval**, the user can still practise it, disable it, or **withdraw the submission**.
3. An admin approves or rejects it. A rejection must include a **rejection reason**, which the user can view in the application.
4. **If approved:** the asana moves to the Public Library, disappears from the user's Personal Library, and is credited as "Submitted by [first name]". The original creator can no longer edit it.
5. **If rejected:** the asana stays in the user's Personal Library with the rejection reason visible.
6. A rejected asana **cannot be edited and cannot be resubmitted**. To try again, the user disables it and creates a new asana from the beginning. This is intentional, to avoid edit complexity.

---

## 12. Favourites

- Users can create **multiple named favourite lists**.
- A list can contain asanas from both the Public and Personal libraries.
- Lists can be renamed and deleted. Deleting a list never deletes any asana.
- The same asana cannot be added twice to the same list.
- A disabled asana is hidden from favourites.
- Practising from a favourites list means picking **one asana at a time** from the list. There is no auto-play sequence of a whole list in Phase 1.

---

## 13. Coaching / Practice Session

### 13.1 Devices

- A session supports a maximum of **3 devices** for the same logged-in user (consistent with the login device limit).
- The user taps **"Make this device Primary"** on any one device. That device becomes the Primary, and all other connected devices **automatically become Secondary (camera-only)** devices.
- A session can run with the **Primary device alone**.
- **Primary device:** has audio (TTS announcements) and also captures photos.
- **Secondary devices:** camera only, no audio.
- All devices must be synchronised in real time.
- If any device disconnects mid-session, the **Primary device announces that a device has gone offline**.

### 13.2 Coaching Screen (Complex Screen)

Every device displays:

- Its own live camera feed
- The live camera feeds of the other connected devices
- The current step's **stored** character reference image (never regenerated)
- The list of all steps for the asana, with the **current step highlighted**

This screen will be designed in detail in `uidesign.MD` (wireframes → static pages → iteration → approval) after `design.MD`.

### 13.3 Per-Step Coaching and Capture Script

For **each step**, the following sequence runs exactly:

1. All devices show the stored step image, all live camera feeds, and highlight the current step.
2. The Primary device speaks: **"Step N"**, then reads that step's instruction aloud using TTS.
3. The Primary announces: **"Get ready — 1, 2, 3"** (1-second gap between counts).
4. On "3", **all connected devices capture one synchronised photo at the same moment**. One synchronised set = one photo per device (one per angle).
5. The user holds the pose. The capture repeats **3 times in total per step**, with an announcement before **every** capture, and captures spaced **3 seconds apart** (the user holds the pose for 3 seconds between captures).
6. After the 3rd capture for the step, the Primary announces: **"Move to the next step"**, and the same loop repeats for the next step.
7. After the final step is completed, the Primary announces: **"Analyzing, please wait."**

### 13.4 Health Disclaimer

Before a practice session begins, the application must display a health disclaimer and cautions (for example: consult a doctor where appropriate, respect the asana's contraindications, stop if there is pain). This is mandatory.

---

## 14. Pose Validation and Results

### 14.1 Validation

- Validation happens **only after all steps are complete** (Phase 1 keeps this simple), but feedback is reported **per step**.
- For each step, the application sends to `muse-image-1.0`:
  - All **3 synchronised photo sets** captured for that step
  - The step's instruction text
  - The stored reference step image
- The model **picks the single best synchronised set** (because different angles are needed to validate different aspects of a pose), validates the pose using **all angles in that set**, and the other 2 sets are **discarded**.
- **User photos are never stored** — not during the session, not after validation.

### 14.2 Results

For each step, the user receives:

- Whether the step was correct or incorrect
- Correction text explaining what was wrong, if anything
- An **annotated image**: the stored character step image marked with **red circles/arrows** highlighting the errors. The annotation is applied to the **character image, not the user's photo**, for privacy.
- **No score or grade** is given.

Results are **spoken by the Primary device (TTS) and displayed**.

### 14.3 Repeating

- If the user wants to retry, they **redo all steps from the beginning**. There is no redo of a single step in Phase 1.
- The user may instead end the session and pick another asana.

---

## 15. Practice History

Practice History is **in scope for Phase 1**.

### 15.1 What Is Stored Per Session

- Date and time of the session
- Asana practised
- Per-step result: correct / incorrect
- Per-step correction text (what was wrong)
- The **annotated character image** for each step (stored — there is no privacy issue, since it is the character image, not a user photo)

User camera photos are **never** stored in history or anywhere else.

### 15.2 History Screen — Calendar View

- When the user opens Practice History, the **current month's calendar** is shown by default.
- Days on which the user practised are **marked** on the calendar.
- The user can **change the month** and select any date.
- When a day is selected, **all sessions from that day are listed** (there may be multiple sessions in one day).
- Selecting a session shows its full detail: asana, time, per-step correct/incorrect results, correction text, and annotated character images.

---

## 16. Admin Panel

Admins will have an Admin Panel providing:

- Approve / reject publication submissions (with mandatory rejection reason)
- Enable / disable public asanas
- Upload character folders and character images
- Upload reference PDFs and view their parsing status
- **Configurable limits/settings**, including at minimum:
  - Maximum feedbacks per asana (default: 3)
  - Registration OTP request limit (default: 3, lifetime)
  - Login failed-OTP attempt limit (default: 3) and lockout duration (default: 6 hours)
  - Maximum simultaneous devices per user (default: 3)

Changing a limit in the Admin Panel changes the application's behaviour without code changes. The scope defaults above apply until an admin changes them.

Admin emails themselves remain managed in the application config file, not in the Admin Panel.

---

## 17. Safety and Privacy Summary

- A health disclaimer must be shown before practice.
- Asana contraindications/cautions must be generated and displayed with each asana.
- User camera photos are captured only for validation and are **never stored**.
- Only session text results and annotated **character** images are stored.
- Manual creation/editing of pose instructions is not allowed anywhere, to prevent faulty or inappropriate poses.
- Feedback is intent-checked line by line, so the feedback channel cannot be misused for unrelated or inappropriate content.

---

## 18. POC Requirements (First Step for Muse)

Before creating `design.MD`, Muse must build a POC **only inside a `POC/` folder** to validate that the following are technically possible with the real APIs available to the project owner (`muse-wonder-1.0` and `muse-image-1.0` — real API keys exist and will be provided):

| # | POC Item |
|---|----------|
| a | `muse-wonder-1.0` generating step-by-step asana instructions plus metadata (difficulty, body part, category, benefits, contraindications, duration per step) |
| b | `muse-image-1.0` generating consistent-character images, one per step, from step instructions + a selected character image |
| c | Reference PDF extraction: text and images, organised per asana, including expected parsing time (to confirm the batch-job design hint) |
| d | Feedback validation chain: line-by-line intent check → reference existence check → alignment check, using `muse-wonder-1.0` |
| e | Multi-device synchronised capture: up to 3 browser devices, primary selection, real-time sync, simultaneous capture, disconnect detection |
| f | Pose validation: sending multiple synchronised photo sets + instruction + reference image to `muse-image-1.0`, best-set selection, and receiving per-step feedback plus an annotated character image with red markings |
| g | Text-to-speech announcements on the primary device (candidate TTS approaches may be compared, final choice is a design-phase decision) |

### POC Rules

- All POC code stays inside `POC/`. No production application code.
- The POC ends with a **written POC report**: what worked, what did not, limitations discovered, and any scope/design risks.
- After delivering the POC report, Muse must **STOP and wait for explicit approval** from the project owner before creating `design.MD`.

---

## 19. Decisions Deferred to the Design Phase

The following will be decided in `design.MD`, not in this scope:

- Technology stack: frontend, backend, database, storage, hosting
- TTS technology choice
- OTP expiry time and resend behaviour within the limits defined in Section 5
- Real-time synchronisation technology for multi-device sessions
- Exact API request/response contracts for `muse-wonder-1.0` and `muse-image-1.0` (based on POC findings)
- How the asana folder/file structure maps to database records and file/object storage
- Reference PDF parsing pipeline and batch job implementation
- Data model, session management, and security implementation details

After `design.MD` is approved, `uidesign.MD` will be created for wireframes and static pages — especially the complex coaching screen (Section 13.2) — and iterated before final development.

---

## 20. Key Business Rules — Quick Reference

| Rule | Value / Behaviour |
|---|---|
| Login | Email + OTP only; mandatory for everything |
| Registration OTP | Max 3 requests per email, lifetime; then permanent block, no recovery |
| Login OTP | 3 failed attempts → 6-hour lock; second occurrence → permanent block, no recovery |
| Admin identification | Email listed in application config file |
| Devices per user | Max 3; 4th login refused with logout instruction message |
| Editing asanas | Never manual; only via AI feedback loop |
| Feedback limit | 3 per asana, including rejected feedback (admin-configurable) |
| Feedback memory | None — every submission is standalone |
| Non-reference asana creation | Admins only; blocked for normal users |
| Duplicate of public asana in personal library | Not allowed |
| Delete | No hard delete anywhere; only enable/disable (reversible) |
| Rejected submission | Stays in personal library with reason; cannot be edited or resubmitted |
| Approved submission | Moves to Public, leaves Personal, credited "Submitted by [first name]" |
| Step images during practice | Always the stored images; never regenerated |
| Captures per step | 3 synchronised sets, 3 seconds apart, announced before each capture |
| Validation timing | After all steps complete; reported per step; no score |
| Validation image | Annotated character image (red circles/arrows), never the user's photo |
| User photos | Never stored |
| History | Text results + annotated character images; calendar view by month/day/session |
| Redo | All steps from the beginning |
| Language / Platform | English only; browser-based on laptop and mobile |