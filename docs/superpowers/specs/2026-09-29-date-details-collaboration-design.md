# Date Details Collaboration Design

## Goal

Make date details reflect each partner's own actions and let the date creator safely return a plan to the idea bank. Each partner can manage their own photos, both partners can see who has added a scheduled date to a calendar, and generated calendars contain only the date itself.

## Scope

This change covers five connected behaviors:

1. A photo can be deleted only by the user who uploaded it.
2. Each space member can upload up to three photos to the same completed date. For a two-person space, the date can therefore contain up to six photos.
3. The creator of a planned date can return it to the idea bank from the date details dialog.
4. Generated calendar files no longer contain a separate preparation event.
5. Date details show whether each space member has pressed the in-app “Add to calendar” action.

The application treats a successful calendar-file response to an authenticated button press as “added to calendar.” It cannot observe whether the browser or operating system subsequently imported the file into an external calendar.

## Data Model

### Photo ownership

The existing `date_photos.uploaded_by` column remains the source of truth. Date-list responses add `uploadedBy` to every photo object. Existing rows and files are preserved.

The three-photo limit applies to `(date_id, uploaded_by)`, rather than to the date as a whole. A server-side transaction locks the date row while it counts and inserts a batch, so concurrent requests cannot take one user above the limit.

### Calendar additions

Add a `date_calendar_additions` table:

```sql
CREATE TABLE date_calendar_additions (
  date_id UUID NOT NULL REFERENCES dates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date_id, user_id)
);
```

Date-list responses expose calendar additions as `calendarAddedBy`, an array of user IDs. The client resolves IDs to names using the space members it already loads. Existing dates start with an empty array; no historical calendar use is inferred.

The server creates the table with `CREATE TABLE IF NOT EXISTS` during startup, matching the project's existing compatibility-migration approach. The canonical initialization SQL also contains the table for new installations.

## Server Behavior

### Upload photos

`POST /api/dates/:dateId/photos` keeps its existing authentication and date-membership checks.

Before inserting a batch, the server:

1. locks the date row;
2. counts photos for the current `userId` and `dateId`;
3. rejects the whole batch if `existing + incoming > 3`;
4. removes any newly written upload files when the request is rejected;
5. inserts every accepted row with the authenticated user as `uploaded_by`.

The error message explains that each participant may add at most three photos. Partner notification behavior remains unchanged for a successful batch.

### Delete a photo

Add `DELETE /api/dates/:dateId/photos/:photoId` behind authentication and date-membership checks.

The server selects the photo by both date and photo ID. It returns:

- `404` if the photo does not belong to that date or no longer exists;
- `403` if `uploaded_by` differs from the authenticated user;
- `204` after removing the database row and stored file.

The filename always comes from the database. Client-supplied paths are never accepted. If physical-file cleanup fails after the row has been removed, the request is logged as a server error for operational cleanup; no other user's row can be deleted.

Deleting a photo does not notify the partner.

### Return a plan to the idea bank

Add `PATCH /api/dates/:dateId/move-to-ideas` behind authentication and date-membership checks.

The update succeeds only when:

- the date exists;
- its status is `planned`;
- `created_by` equals the authenticated user;
- it is not already in the idea bank.

The server performs one transaction that:

- sets `starts_at` and `event_date` to `NULL`;
- sets `is_all_day` to `false`;
- sets `requested_window` to `idea`;
- sets `organizer_comment` to `NULL`;
- increments `ics_sequence`, so a future schedule has a newer calendar revision;
- deletes all calendar-addition rows for the date.

The title, type, creator, organizer mode, status, and photos remain unchanged. `claimIdea` will set the organizer mode again when a partner later takes the idea into work, as it does today.

The endpoint returns the updated date. A non-creator receives `403`; an invalid state receives `409`. Moving the plan does not attempt to remove an already imported event from an external calendar.

### Add to calendar

Replace the client's read-only download call with an explicit authenticated `POST /api/dates/:dateId/calendar.ics` action. The action:

1. checks date membership and that the date has an exact or all-day date;
2. upserts `(date_id, user_id)` without creating duplicates;
3. returns the `.ics` attachment.

Email attachments do not create calendar-addition records. Only the in-app button does. If calendar generation fails, no addition is recorded.

### Calendar contents

`buildCalendar` no longer accepts `includePreparation` and never emits the `UID:<dateId>-preparation` event. All call sites generate one `VEVENT`: the date itself. Existing UID, sequence, time, all-day, and organizer-comment behavior remains.

## Client Behavior

### Photos

The shared `DateItem` photo type becomes `{ id, filename, uploadedBy }`.

In completed-date details:

- all partner photos remain visible and can be previewed;
- the current user's photos show a compact delete action;
- partner photos have no delete action;
- “Add photo” remains visible while the current user has fewer than three photos, regardless of the total number of photos on the date;
- after upload or deletion, the date list refreshes so counts and controls update immediately;
- destructive deletion asks for a lightweight in-app confirmation before the request.

History cards use the same per-user count when deciding whether to show “Add photo.” Deletion is available in the details dialog, where ownership is clear.

### Move to idea bank

For a planned date, the details dialog shows “Move to idea bank” only when `item.createdBy === session.user.id`. The action asks for confirmation because it removes the current timing and organizer comment. On success, the client refreshes data, closes the dialog, and selects the “Idea bank” tab so the moved card is visible.

### Calendar status

For a planned date that has a calendar date, the details dialog contains a “Calendar” section listing every current space member by name. Each row shows either:

- “Added to calendar”; or
- “Not added yet.”

The existing calendar button downloads the file through the new POST action, then refreshes date data. Its successful click immediately changes the current user's row. The action remains repeatable so a user can download the file again, while the stored status remains one record.

## Error Handling and Consistency

- Authorization is enforced on the server even when the client hides an unavailable control.
- A failed upload batch leaves neither database rows nor newly uploaded files.
- A failed photo deletion keeps the client state unchanged and shows an error in the dialog.
- A failed move keeps the plan in its current tab and shows an error in the dialog.
- A failed calendar request does not mark the member as having added the date.
- Normal refresh and expired-session behavior continue to apply to all new authenticated requests.

## Validation

Automated coverage will include:

- date-list serialization of `uploadedBy` and `calendarAddedBy`;
- two users independently reaching three photos on one date;
- rejection and cleanup of a fourth photo for one user;
- successful deletion by the uploader and rejection for another member;
- move-to-ideas authorization, state validation, field cleanup, calendar-status cleanup, and response data;
- idempotent calendar-addition recording and no record on generation failure;
- `.ics` output containing exactly one event and no preparation UID;
- client photo controls based on the current user's count and ownership;
- creator-only move control and its post-success tab transition;
- member-by-member calendar status and refresh after download.

The full backend and frontend test suites and production build must pass. After automated verification, the application will run locally with representative two-member data for final browser review by the user before publication.
