# Date Details and Notification Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open every planned date in a detail dialog and let notifications and push open that exact dialog.

**Architecture:** Add an optional foreign key from notifications to dates and carry it through the API, frontend model, and push URLs. Replace the current comment-only control on cards with a detail dialog; the organiser submits exact start time and comment through a single endpoint, which updates the date and sends an `.ics` update.

**Tech Stack:** Express, PostgreSQL, TypeScript, React, RxJS, Vitest, Vite PWA/Workbox.

**Spec:** `docs/superpowers/specs/2026-09-02-date-details-and-notification-links-design.md`

## Global Constraints

- Do not change the date-creation form, approximate periods, or the future Idea Bank flow.
- A date dialog must open for every planned date, including dates without exact details.
- Only the organiser may save exact time and comment; non-organisers have read-only access.
- Generate and send `.ics` only after a precise `startsAt` value exists.
- Legacy notifications without `dateId` remain readable and do not deep-link.

---

### Task 1: Link Notifications to Dates

**Files:**
- Modify: `backend/db/init.sql:63-68`
- Modify: `backend/src/index.ts:190-223,242-247`
- Modify: `backend/src/app/domains/dates/date.repository.ts:52-61`
- Modify: `frontend/src/pages/home/api/home.model.ts:5`
- Test: `backend/src/app/domains/dates/tests/date.repository.test.ts`

**Interfaces:**
- Produces `Notification = { id; body; createdAt; readAt; dateId: string | null }`.
- Produces `DateRepository.notifyOtherMembers(spaceId, senderId, body, dateId?: string)`.

- [ ] **Step 1: Write failing repository tests for a linked notification**

```ts
it('records the related date when notifying the partner', async () => {
  await repository.notifyOtherMembers('space-1', 'author-1', 'Новые детали', 'date-1');
  expect(query).toHaveBeenCalledWith(expect.stringContaining('date_id'), ['space-1', 'author-1', 'Новые детали', 'date-1']);
});
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `npm test -w backend -- src/app/domains/dates/tests/date.repository.test.ts`

Expected: FAIL because `notifyOtherMembers` does not accept `dateId` and its insert has no `date_id`.

- [ ] **Step 3: Add schema migration and repository support**

```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS date_id UUID REFERENCES dates(id) ON DELETE SET NULL;
```

```ts
async notifyOtherMembers(spaceId: string, senderId: string, body: string, dateId?: string) {
  await this.db.query(
    `INSERT INTO notifications(user_id,body,date_id)
     SELECT user_id,$3,$4 FROM space_members WHERE space_id=$1 AND user_id <> $2`,
    [spaceId, senderId, body, dateId ?? null]
  );
  // Return the same recipients as today.
}
```

Add `date_id UUID REFERENCES dates(id) ON DELETE SET NULL` to the create-table definition and add the runtime `ALTER TABLE` next to the existing date-type migration. Return `date_id AS "dateId"` from `GET /api/users/:userId/notifications`.

- [ ] **Step 4: Attach date identifiers to existing date-related notifications**

```ts
await db.query('INSERT INTO notifications(user_id,body,date_id) VALUES($1,$2,$3)', [recipient.id, body, date.id]);
```

Apply this to the organiser-details and photo flows. Pass `item.id` from `datesController.create` to `notifyOtherMembers` so new-date notifications also deep-link.

- [ ] **Step 5: Run focused backend tests**

Run: `npm test -w backend -- src/app/domains/dates/tests/date.repository.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the linked-notification backend work**

```bash
git add backend/db/init.sql backend/src/index.ts backend/src/app/domains/dates/date.repository.ts backend/src/app/domains/dates/tests/date.repository.test.ts frontend/src/pages/home/api/home.model.ts
git commit -m "feat: link notifications to dates"
```

### Task 2: Save Exact Details as an Organiser

**Files:**
- Modify: `backend/src/index.ts:171-205`
- Modify: `backend/src/app/domains/dates/date.repository.ts:33-61`
- Modify: `frontend/src/pages/home/api/home.api-service.ts:15`
- Modify: `frontend/src/pages/home/page.service.ts:19`
- Test: `backend/src/app/domains/dates/tests/date.repository.test.ts`
- Test: `backend/src/app/tests/calendar.test.ts`

**Interfaces:**
- Consumes `PATCH /api/dates/:dateId/organizer-comment` body `{ startsAt: string; comment: string }`.
- Produces an updated `dates` row with `starts_at`, `event_date = NULL`, `is_all_day = false`, `organizer_comment`, and incremented `ics_sequence`.
- Sends linked notification and push URL `/?date=<dateId>` only to the other space member.

- [ ] **Step 1: Write a failing repository test for saving exact details**

```ts
it('stores an exact start time and comment for a date', async () => {
  await repository.saveOrganizerDetails('date-1', '2026-09-10T18:30:00.000Z', 'Будь у входа в 18:20.', 2);
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('SET starts_at=$1,event_date=NULL,is_all_day=false,organizer_comment=$2,ics_sequence=$3'),
    ['2026-09-10T18:30:00.000Z', 'Будь у входа в 18:20.', 2, 'date-1']
  );
});
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `npm test -w backend -- src/app/domains/dates/tests/date.repository.test.ts`

Expected: FAIL because `DateRepository.saveOrganizerDetails` does not exist.

- [ ] **Step 3: Add the repository method and make the organiser endpoint use it**

```ts
async saveOrganizerDetails(dateId: string, startsAt: string, comment: string, sequence: number) {
  await this.db.query(
    `UPDATE dates
     SET starts_at=$1,event_date=NULL,is_all_day=false,organizer_comment=$2,ics_sequence=$3
     WHERE id=$4`,
    [startsAt, comment, sequence, dateId]
  );
}
```

```ts
const parsedStart = typeof req.body.startsAt === 'string' ? new Date(req.body.startsAt) : null;
if (!parsedStart || Number.isNaN(parsedStart.valueOf())) return res.status(400).json({ message: 'Укажите точные дату и время.' });
const startsAt = parsedStart.toISOString();
await dateRepository.saveOrganizerDetails(String(req.params.dateId), startsAt, comment, sequence);
```

Keep the current organiser and membership checks. Build the `.ics` from the new `startsAt`, write the recipient notification with `date_id`, and use `url: '/?date=' + date.id` in `push.send`.

- [ ] **Step 4: Run the repository test to verify it passes**

Run: `npm test -w backend -- src/app/domains/dates/tests/date.repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Update the frontend client contract**

```ts
organizerComment:(id: string, token: string, data: { startsAt: string; comment: string }) =>
  json<void>(`/api/dates/${id}/organizer-comment`, { method: 'PATCH', headers: secured(token), body: JSON.stringify(data) })
```

Change `HomeService.sendOrganizerComment` to accept the same data and refresh afterwards.

- [ ] **Step 6: Run backend tests and build**

Run: `npm test -w backend && npm run build -w backend`

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit the organiser-details flow**

```bash
git add backend/src/index.ts backend/src/app/domains/dates/date.repository.ts backend/src/app/domains/dates/tests/date.repository.test.ts backend/src/app/tests/calendar.test.ts frontend/src/pages/home/api/home.api-service.ts frontend/src/pages/home/page.service.ts
git commit -m "feat: send exact date details to partner"
```

### Task 3: Detail Dialog and In-App Deep Links

**Files:**
- Modify: `frontend/src/pages/home/page.tsx:43-60,92-103`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/sw.js:17-22`
- Test: `frontend/src/pages/home/page.test.tsx`

**Interfaces:**
- Consumes `selectedDateId: string | null`, sourced from card click or `new URLSearchParams(location.search).get('date')`.
- Uses `homeService.sendOrganizerComment(date.id, { startsAt, comment })` for organiser saves.
- Uses `homeService.readNotification(notification.id)` before opening a linked date.

- [ ] **Step 1: Write failing UI tests for card and notification navigation**

```tsx
fireEvent.click(screen.getByRole('button', { name: /Кино/ }));
expect(screen.getByRole('dialog', { name: 'Детали свидания' })).toBeTruthy();

fireEvent.click(screen.getByRole('button', { name: /Партнёр добавил детали/ }));
expect(screen.getByText('Будь у входа')).toBeTruthy();
expect(homeService.readNotification).toHaveBeenCalledWith('notice-1');
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `npm test -w frontend -- src/pages/home/page.test.tsx`

Expected: FAIL because cards are not buttons, no dialog exists, and notifications only mark themselves read.

- [ ] **Step 3: Implement `DateDetailsDialog` and make cards open it**

```tsx
function DateDetailsDialog({ item, close }: { item: DateItem; close: () => void }) {
  const session = useRxBind(homeService.session$)!;
  const isOrganiser = item.organizerMode === 'self' ? item.createdBy === session.user.id : item.createdBy !== session.user.id;
  // Show a read-only empty state when item.startsAt is null.
  // Pre-fill local date, time and comment for organisers.
}
```

Make the card's main content a button with accessible name including its title. The dialog must always show type, title, date/time or «Точное время ещё не назначено», and comment or «Комментарий пока не добавлен». Only the organiser sees datetime inputs, comment field, and a submit button. On save, close the dialog after `homeService.sendOrganizerComment` resolves.

- [ ] **Step 4: Implement URL and notification navigation**

```tsx
const [selectedDateId, setSelectedDateId] = useState(() => new URLSearchParams(location.search).get('date'));
const selectedDate = dates.find(item => item.id === selectedDateId) ?? null;
```

On notification click, call `readNotification`, close the popover, set `selectedDateId` to `notification.dateId`, and use `history.replaceState({}, '', '?date=' + notification.dateId)`. On dialog close, remove `date` while preserving other search parameters. If a loaded URL has an unknown or completed date, leave the plans view visible and do not open a dialog.

Update `sw.js` to focus an existing tab only when its full URL equals the notification URL; otherwise open `/?date=<id>` so the deep link is not discarded.

- [ ] **Step 5: Style and verify the dialog on narrow screens**

```css
.date-details{max-width:560px}
.date-details__meta{display:grid;gap:8px}
@media (max-width:560px){.date-details{max-height:calc(100dvh - 24px);overflow:auto}}
```

Reuse the existing overlay and modal visual language. Keep the read-only state calm and distinct from the organiser form.

- [ ] **Step 6: Run focused frontend tests**

Run: `npm test -w frontend -- src/pages/home/page.test.tsx`

Expected: PASS.

- [ ] **Step 7: Run the full verification suite and production builds**

Run: `npm test && npm run build -w backend && npm run build -w frontend && git diff --check`

Expected: all tests and both builds PASS; no whitespace errors.

- [ ] **Step 8: Commit the dialog and deep-link interface**

```bash
git add frontend/src/pages/home/page.tsx frontend/src/pages/home/page.test.tsx frontend/src/styles.css frontend/src/sw.js
git commit -m "feat: open date details from notifications"
```
