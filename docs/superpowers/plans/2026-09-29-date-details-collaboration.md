# Date Details Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each partner manage up to three owned photos, let the date creator return a plan to the idea bank, generate calendars without preparation events, and show each partner's calendar-addition status.

**Architecture:** Add one normalized calendar-addition table and expose photo ownership plus calendar user IDs through the existing date list. Keep three mutation concerns in focused backend services—photo storage, calendar download tracking, and idea-bank moves—then connect them to authenticated Express routes and the existing React service/UI.

**Tech Stack:** TypeScript, Express, PostgreSQL, Multer, React 18, RxJS, Vitest, Testing Library, Docker Compose, Vite PWA.

**Spec:** `docs/superpowers/specs/2026-09-29-date-details-collaboration-design.md`

## Global Constraints

- A user may own at most three photos per date; another member's photos do not consume that allowance.
- Only `date_photos.uploaded_by` may delete a photo, and all authorization is enforced server-side.
- Only `dates.created_by` may move a planned date back to the idea bank.
- Moving a date clears timing, organizer comment, and all calendar-addition records while preserving title, type, creator, status, and photos.
- A calendar addition means the authenticated in-app calendar action returned an `.ics` file; email attachments never count.
- Generated `.ics` files contain exactly one `VEVENT` and no preparation event.
- No new runtime dependency is required.
- Publication waits for automated verification and the user's final review of the locally running interface.

## Review Focus

- Two simultaneous upload requests from one user must not exceed three photos; the photo service locks the date row before counting and inserting.
- Rejected or failed upload batches must clean every newly written file; photo-service tests exercise both a limit rejection and an insert failure.
- A user must not delete a photo by combining a valid date ID with another date's photo ID; deletion selects by both IDs and the test pins this condition.
- Repeated calendar downloads must remain one status record; the calendar-service test asserts `ON CONFLICT` idempotency.
- A stale client must not move an already completed or already-bank idea; the idea service returns `conflict` and leaves all fields untouched.

---

### Task 1: Persist collaboration metadata and return it with dates

**Files:**
- Modify: `backend/db/init.sql`
- Modify: `backend/src/index.ts:244-255`
- Modify: `backend/src/app/domains/dates/date.repository.ts:34-42`
- Modify: `backend/src/app/domains/dates/tests/date.repository.test.ts`
- Modify: `frontend/src/pages/home/api/home.model.ts`
- Modify: existing `DateItem` fixtures in `frontend/src/pages/home/page.test.tsx`

**Interfaces:**
- Produces: `DateItem.photos: Array<{ id: string; filename: string; uploadedBy: string }>`.
- Produces: `DateItem.calendarAddedBy: string[]`.
- Produces: PostgreSQL table `date_calendar_additions(date_id, user_id, added_at)` with primary key `(date_id, user_id)`.

- [ ] **Step 1: Write failing repository projection tests**

Add tests that call `DateRepository.list('space-1')` and assert its SQL contains both ownership and calendar aggregates:

```ts
it('lists photo owners and calendar additions for each date', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const repository = new DateRepository({ query } as never);

  await repository.list('space-1');

  const sql = query.mock.calls[0][0] as string;
  expect(sql).toContain("'uploadedBy', uploaded_by");
  expect(sql).toContain('date_calendar_additions');
  expect(sql).toContain('"calendarAddedBy"');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test -w backend -- src/app/domains/dates/tests/date.repository.test.ts`

Expected: FAIL because the current query omits `uploaded_by` and calendar additions.

- [ ] **Step 3: Add schema and compatibility migration**

Add the table after `date_photos` in `backend/db/init.sql`, and add the same statement to `start()` in `backend/src/index.ts`:

```sql
CREATE TABLE IF NOT EXISTS date_calendar_additions (
  date_id UUID NOT NULL REFERENCES dates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date_id, user_id)
);
```

Use `CREATE TABLE` without `IF NOT EXISTS` in the canonical initialization file because it runs only for a new database.

- [ ] **Step 4: Extend the date-list projection**

Change the photo lateral aggregate to build `uploadedBy`, add a second lateral aggregate for calendar users, and coalesce both arrays:

```sql
COALESCE(p.photos, '[]'::json) AS photos,
COALESCE(c.users, '[]'::json) AS "calendarAddedBy"
...
LEFT JOIN LATERAL (
  SELECT json_agg(json_build_object('id', id, 'filename', filename, 'uploadedBy', uploaded_by) ORDER BY created_at) photos
  FROM date_photos WHERE date_id=d.id
) p ON true
LEFT JOIN LATERAL (
  SELECT json_agg(user_id ORDER BY added_at) users
  FROM date_calendar_additions WHERE date_id=d.id
) c ON true
```

Update the frontend model:

```ts
export type DatePhoto = { id: string; filename: string; uploadedBy: string };
export type DateItem = {
  // existing date fields
  photos: DatePhoto[];
  calendarAddedBy: string[];
};
```

Add `calendarAddedBy: []` and `uploadedBy` to every typed date fixture so TypeScript keeps the contract honest.

- [ ] **Step 5: Run repository and frontend type checks**

Run: `npm run test -w backend -- src/app/domains/dates/tests/date.repository.test.ts && npm run build -w frontend`

Expected: PASS.

- [ ] **Step 6: Commit the data contract**

```bash
git add backend/db/init.sql backend/src/index.ts backend/src/app/domains/dates/date.repository.ts backend/src/app/domains/dates/tests/date.repository.test.ts frontend/src/pages/home/api/home.model.ts frontend/src/pages/home/page.test.tsx
git commit -m "feat: expose date collaboration metadata"
```

### Task 2: Generate one-event calendars and track downloads

**Files:**
- Create: `backend/src/app/domains/dates/date-calendar.service.ts`
- Create: `backend/src/app/domains/dates/tests/date-calendar.service.test.ts`
- Modify: `backend/src/app/calendar.ts`
- Modify: `backend/src/app/tests/calendar.test.ts`
- Modify: `backend/src/index.ts:145-235`

**Interfaces:**
- Produces: `DateCalendarService.download(dateId: string, userId: string): Promise<string>` returning `.ics` text after recording the authenticated action.
- Consumes: `buildCalendar(date)` with no preparation flag.
- Produces: `POST /api/dates/:dateId/calendar.ics`, returning `text/calendar` or a `400` Russian error when no date is scheduled.

- [ ] **Step 1: Write failing calendar-content and service tests**

Extend the timed-event test so it counts one event and rejects the old preparation UID:

```ts
const legacyCall = buildCalendar as unknown as (date: object, includePreparation: boolean) => string;
const ics = legacyCall({ id: 'date-1', title: 'Прогулка', startsAt: '2026-09-01T15:00:00.000Z' }, true);
expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
expect(ics).not.toContain('UID:date-1-preparation');
```

Create service tests with a mocked database:

```ts
it('records one idempotent calendar addition after generating the file', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [{ title: 'Кино', starts_at: '2026-10-01T15:00:00.000Z', event_date: null, is_all_day: false, organizer_comment: null, ics_sequence: 0 }] })
    .mockResolvedValueOnce({ rows: [] });
  const service = new DateCalendarService({ query } as never);

  const result = await service.download('date-1', 'user-1');

  expect(result).toContain('UID:date-1');
  expect(query.mock.calls[1][0]).toContain('ON CONFLICT (date_id,user_id) DO NOTHING');
  expect(query.mock.calls[1][1]).toEqual(['date-1', 'user-1']);
});

it('does not record an addition when no date can be generated', async () => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ title: 'Идея', starts_at: null, event_date: null, is_all_day: false }] });
  const service = new DateCalendarService({ query } as never);

  await expect(service.download('date-1', 'user-1')).rejects.toThrow('У свидания нет даты.');
  expect(query).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test -w backend -- src/app/tests/calendar.test.ts src/app/domains/dates/tests/date-calendar.service.test.ts`

Expected: FAIL because the service does not exist and `buildCalendar` still accepts the preparation flag.

- [ ] **Step 3: Remove preparation-event generation**

Delete the `includePreparation` parameter, preparation date calculations, and preparation `VEVENT` branches from `buildCalendar`. Preserve event UID, sequence, timing, all-day transparency, escaping, and organizer description. Update every email call to pass only the date object.

- [ ] **Step 4: Implement calendar download tracking**

Implement `DateCalendarService` so it:

```ts
export class DateCalendarService {
  constructor(private readonly db: Pool) {}

  async download(dateId: string, userId: string) {
    const row = (await this.db.query(
      'SELECT title,starts_at,event_date,is_all_day,organizer_comment,ics_sequence FROM dates WHERE id=$1',
      [dateId]
    )).rows[0];
    if (!row) throw new Error('Свидание не найдено.');
    if (!row.starts_at && !row.event_date) throw new Error('У свидания нет даты.');
    const content = buildCalendar({ id: dateId, title: row.title, startsAt: row.starts_at, eventDate: row.event_date, isAllDay: row.is_all_day, organizerComment: row.organizer_comment, sequence: row.ics_sequence });
    await this.db.query(
      'INSERT INTO date_calendar_additions(date_id,user_id) VALUES($1,$2) ON CONFLICT (date_id,user_id) DO NOTHING',
      [dateId, userId]
    );
    return content;
  }
}
```

Instantiate it once in `index.ts`. Change the existing GET route to POST, call `download()`, map “нет даты” to `400` and “не найдено” to `404`, then return the attachment. Keep `requireAuth` and `requireDateMember` before the handler.

- [ ] **Step 5: Run calendar tests**

Run: `npm run test -w backend -- src/app/tests/calendar.test.ts src/app/domains/dates/tests/date-calendar.service.test.ts`

Expected: PASS, including the one-event and no-record-on-failure assertions.

- [ ] **Step 6: Commit calendar behavior**

```bash
git add backend/src/app/calendar.ts backend/src/app/tests/calendar.test.ts backend/src/app/domains/dates/date-calendar.service.ts backend/src/app/domains/dates/tests/date-calendar.service.test.ts backend/src/index.ts
git commit -m "feat: track calendar additions"
```

### Task 3: Enforce photo ownership and per-user limits

**Files:**
- Create: `backend/src/app/domains/dates/date-photo.service.ts`
- Create: `backend/src/app/domains/dates/tests/date-photo.service.test.ts`
- Modify: `backend/src/index.ts:207-224`

**Interfaces:**
- Produces: `DatePhotoService.add(dateId: string, userId: string, files: Array<{ filename: string }>): Promise<void>`.
- Produces: `DatePhotoService.remove(dateId: string, userId: string, photoId: string): Promise<'deleted' | 'not-found' | 'forbidden'>`.
- Produces: `PhotoLimitError` with Russian message `Каждый участник может добавить не больше трёх фото к одному свиданию.`.
- Produces: `DELETE /api/dates/:dateId/photos/:photoId` returning `204`, `403`, or `404`.

- [ ] **Step 1: Write failing service tests for the limit, cleanup, and ownership**

Use a mocked `PoolClient` with `connect`, `query`, `release`, and an injected `removeFile` function. Add these cases:

```ts
it('counts only the current user photos while holding a date lock', async () => {
  const { service, client } = setupPhotoService([
    { rows: [] },
    { rows: [{ count: 2 }] },
    { rows: [] },
    { rows: [] }
  ]);

  await service.add('date-1', 'user-1', [{ filename: 'third.jpg' }]);

  expect(client.query).toHaveBeenCalledWith('SELECT id FROM dates WHERE id=$1 FOR UPDATE', ['date-1']);
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('uploaded_by=$2'), ['date-1', 'user-1']);
});

it('rejects a fourth owned photo and removes the new upload', async () => {
  const removeFile = vi.fn().mockResolvedValue(undefined);
  const { service } = setupPhotoService([{ rows: [] }, { rows: [{ count: 3 }] }], removeFile);

  await expect(service.add('date-1', 'user-1', [{ filename: 'fourth.jpg' }])).rejects.toBeInstanceOf(PhotoLimitError);
  expect(removeFile).toHaveBeenCalledWith(expect.stringContaining('fourth.jpg'));
});

it('removes only a photo owned by the current user and date', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [{ uploaded_by: 'user-1', filename: 'mine.jpg' }] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [] });
  const removeFile = vi.fn().mockResolvedValue(undefined);
  const service = new DatePhotoService({ query } as never, '/photos', removeFile);

  await expect(service.remove('date-1', 'user-1', 'photo-1')).resolves.toBe('deleted');
  expect(query.mock.calls[0][1]).toEqual(['date-1', 'photo-1']);
  expect(removeFile).toHaveBeenCalledWith('/photos/mine.jpg');
});

it('rejects deletion by another member without touching the file', async () => {
  const query = vi.fn().mockResolvedValueOnce({ rows: [{ uploaded_by: 'user-2', filename: 'theirs.jpg' }] });
  const removeFile = vi.fn();
  const service = new DatePhotoService({ query } as never, '/photos', removeFile);

  await expect(service.remove('date-1', 'user-1', 'photo-2')).resolves.toBe('forbidden');
  expect(removeFile).not.toHaveBeenCalled();
});
```

Add an insert-failure test that asserts `ROLLBACK`, `release()`, and cleanup of every incoming filename.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test -w backend -- src/app/domains/dates/tests/date-photo.service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement transactional upload enforcement**

Create `DatePhotoService`. In `add()`:

```ts
const client = await this.db.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT id FROM dates WHERE id=$1 FOR UPDATE', [dateId]);
  const count = Number((await client.query(
    'SELECT count(*)::int AS count FROM date_photos WHERE date_id=$1 AND uploaded_by=$2',
    [dateId, userId]
  )).rows[0].count);
  if (count + files.length > 3) throw new PhotoLimitError();
  for (const file of files) await client.query(
    'INSERT INTO date_photos(date_id,filename,uploaded_by) VALUES($1,$2,$3)',
    [dateId, file.filename, userId]
  );
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  await Promise.allSettled(files.map(file => this.removeFile(join(this.directory, file.filename))));
  throw error;
} finally {
  client.release();
}
```

The injected default remover uses `node:fs/promises.unlink`. Use `node:path.join` so paths derive from the trusted upload directory and stored filename.

- [ ] **Step 4: Implement owner-only deletion and routes**

`remove()` selects `uploaded_by, filename` with both `date_id=$1` and `id=$2`, returns the explicit result union, deletes with `id/date_id/uploaded_by`, and removes the file. Treat `ENOENT` as already cleaned; log other unlink errors without exposing a filesystem path to the client.

Replace the route's global count/inserts with `photoService.add(...)`. Keep successful partner notifications after the service commits. Map `PhotoLimitError` to `400`.

Add the DELETE route with `requireAuth` and `requireDateMember`; map the service union to `204`, `403`, and `404`.

- [ ] **Step 5: Run photo tests and backend build**

Run: `npm run test -w backend -- src/app/domains/dates/tests/date-photo.service.test.ts && npm run build -w backend`

Expected: PASS.

- [ ] **Step 6: Commit photo behavior**

```bash
git add backend/src/app/domains/dates/date-photo.service.ts backend/src/app/domains/dates/tests/date-photo.service.test.ts backend/src/index.ts
git commit -m "feat: manage participant-owned date photos"
```

### Task 4: Move creator-owned plans back to the idea bank

**Files:**
- Create: `backend/src/app/domains/dates/date-idea.service.ts`
- Create: `backend/src/app/domains/dates/tests/date-idea.service.test.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Produces: `DateIdeaService.move(dateId: string, userId: string): Promise<{ kind: 'moved'; date: object } | { kind: 'not-found' | 'forbidden' | 'conflict' }>`.
- Produces: `PATCH /api/dates/:dateId/move-to-ideas`, returning updated JSON, `404`, `403`, or `409`.

- [ ] **Step 1: Write failing transaction and authorization tests**

```ts
it('clears scheduling, comments, and calendar additions for the creator', async () => {
  const { service, client } = setupIdeaService([
    { rows: [] },
    { rows: [{ id: 'date-1', created_by: 'user-1', status: 'planned', requested_window: null }] },
    { rows: [{ id: 'date-1', requestedWindow: 'idea', startsAt: null, organizerComment: null }] },
    { rows: [] },
    { rows: [] }
  ]);

  await expect(service.move('date-1', 'user-1')).resolves.toMatchObject({ kind: 'moved' });
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("requested_window='idea'"), ['date-1']);
  expect(client.query).toHaveBeenCalledWith('DELETE FROM date_calendar_additions WHERE date_id=$1', ['date-1']);
});

it.each([
  [{ rows: [] }, 'not-found'],
  [{ rows: [{ id: 'date-1', created_by: 'user-2', status: 'planned', requested_window: null }] }, 'forbidden'],
  [{ rows: [{ id: 'date-1', created_by: 'user-1', status: 'completed', requested_window: null }] }, 'conflict'],
  [{ rows: [{ id: 'date-1', created_by: 'user-1', status: 'planned', requested_window: 'idea' }] }, 'conflict']
] as const)('leaves invalid state unchanged', async (selection, expectedKind) => {
  const { service, client } = setupIdeaService([{ rows: [] }, selection, { rows: [] }]);
  await expect(service.move('date-1', 'user-1')).resolves.toEqual({ kind: expectedKind });
  expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE dates'), expect.anything());
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test -w backend -- src/app/domains/dates/tests/date-idea.service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the move transaction**

Lock the date with `SELECT ... FOR UPDATE`, classify missing/owner/state conditions, update the date, delete additions, and commit. The update must contain:

```sql
UPDATE dates
SET starts_at=NULL,
    event_date=NULL,
    is_all_day=false,
    requested_window='idea',
    organizer_comment=NULL,
    ics_sequence=ics_sequence+1
WHERE id=$1
RETURNING id,title,starts_at AS "startsAt",event_date AS "eventDate",
          is_all_day AS "isAllDay",organizer_mode AS "organizerMode",
          requested_window AS "requestedWindow",created_by AS "createdBy",
          organizer_comment AS "organizerComment",status
```

Rollback on errors and always release the client.

- [ ] **Step 4: Add the protected route**

Wire `PATCH /api/dates/:dateId/move-to-ideas` through `requireAuth` and `requireDateMember`. Map result kinds to `200`, `404`, `403` with `Только автор может переместить свидание в Банк идей.`, and `409` with `Это свидание нельзя переместить в Банк идей.`.

- [ ] **Step 5: Run service tests and backend build**

Run: `npm run test -w backend -- src/app/domains/dates/tests/date-idea.service.test.ts && npm run build -w backend`

Expected: PASS.

- [ ] **Step 6: Commit idea-bank behavior**

```bash
git add backend/src/app/domains/dates/date-idea.service.ts backend/src/app/domains/dates/tests/date-idea.service.test.ts backend/src/index.ts
git commit -m "feat: return creator plans to idea bank"
```

### Task 5: Add typed client actions

**Files:**
- Modify: `frontend/src/pages/home/api/home.api-service.ts`
- Modify: `frontend/src/pages/home/api/home.api-service.test.ts`
- Modify: `frontend/src/pages/home/page.service.ts`
- Modify: `frontend/src/pages/home/page.service.test.ts`

**Interfaces:**
- Produces: `homeApi.deletePhoto(dateId, photoId, token): Promise<void>`.
- Produces: `homeApi.moveToIdeas(dateId, token): Promise<DateItem>`.
- Changes: `homeApi.downloadCalendar` sends POST and still returns `Promise<Blob>`.
- Produces: `homeService.deletePhoto(dateId, photoId): Promise<void>` and `homeService.moveToIdeas(dateId): Promise<void>`, each refreshing current data after success.

- [ ] **Step 1: Write failing API request tests**

```ts
it('uses protected mutation methods for photo deletion and moving an idea', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);

  await homeApi.deletePhoto('date-1', 'photo-1', 'token-1');
  expect(fetchMock).toHaveBeenLastCalledWith('/api/dates/date-1/photos/photo-1', expect.objectContaining({
    method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer token-1' })
  }));

  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'date-1', requestedWindow: 'idea' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await homeApi.moveToIdeas('date-1', 'token-1');
  expect(fetchMock).toHaveBeenLastCalledWith('/api/dates/date-1/move-to-ideas', expect.objectContaining({ method: 'PATCH' }));
});

it('records a calendar action with POST', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob() }));
  await homeApi.downloadCalendar('date-1', 'token-1');
  expect(fetch).toHaveBeenCalledWith('/api/dates/date-1/calendar.ics', expect.objectContaining({ method: 'POST' }));
});
```

- [ ] **Step 2: Run API tests and verify RED**

Run: `npm run test -w frontend -- src/pages/home/api/home.api-service.test.ts`

Expected: FAIL because the mutation methods and POST method are absent.

- [ ] **Step 3: Implement API and service methods**

Add the methods with the shared authenticated request wrapper. In `HomeService`, capture the current session, await the API method, ignore a late result when the session changed, and call `refresh()` after success. Follow the existing stale-session guard used by `createDate()`.

- [ ] **Step 4: Add stale-session and refresh tests**

Test that successful deletion and move call `refresh()`, and a late response after logout neither restores dates nor refreshes the old account:

```ts
it('refreshes after deleting an owned photo', async () => {
  vi.spyOn(homeApi, 'deletePhoto').mockResolvedValue();
  const refresh = vi.spyOn(homeService, 'refresh').mockResolvedValue();
  await homeService.deletePhoto('date-1', 'photo-1');
  expect(refresh).toHaveBeenCalledOnce();
});
```

- [ ] **Step 5: Run client service tests**

Run: `npm run test -w frontend -- src/pages/home/api/home.api-service.test.ts src/pages/home/page.service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit client actions**

```bash
git add frontend/src/pages/home/api/home.api-service.ts frontend/src/pages/home/api/home.api-service.test.ts frontend/src/pages/home/page.service.ts frontend/src/pages/home/page.service.test.ts
git commit -m "feat: add date collaboration client actions"
```

### Task 6: Show owned-photo controls and creator-only idea move

**Files:**
- Modify: `frontend/src/pages/home/page.tsx:59-89`
- Modify: `frontend/src/pages/home/page.tsx:122-129`
- Modify: `frontend/src/pages/home/page.test.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `DateItem.photos[].uploadedBy`, `homeService.deletePhoto`, and `homeService.moveToIdeas`.
- Produces: `DateDetailsDialog` callback `onMovedToIdeas(): void`, used by `App` to close details and select the idea tab.

- [ ] **Step 1: Write failing ownership and limit UI tests**

Create a completed fixture with three partner photos and no current-user photos. Assert both history card and details still show “Добавить фото”. Then add three current-user photos and assert neither location shows it.

Add deletion visibility and confirmation tests:

```ts
it('offers deletion only for the current user photo', () => {
  setupCompletedDate([
    { id: 'mine', filename: 'mine.jpg', uploadedBy: 'user-1' },
    { id: 'theirs', filename: 'theirs.jpg', uploadedBy: 'partner-1' }
  ]);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Воспоминания' }));
  fireEvent.click(screen.getByRole('button', { name: 'Открыть детали: Ужин дома' }));
  expect(screen.getByRole('button', { name: 'Удалить фото mine.jpg' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Удалить фото theirs.jpg' })).toBeNull();
});
```

- [ ] **Step 2: Write failing move-control tests**

For a creator session, assert the details dialog shows `Переместить в Банк идей`; for the partner session, assert it does not. Stub `window.confirm` to `true`, spy on `homeService.moveToIdeas`, click, and assert the dialog closes and the “Банк идей” navigation button becomes active.

- [ ] **Step 3: Run date-detail tests and verify RED**

Run: `npm run test -w frontend -- src/pages/home/page.test.tsx`

Expected: FAIL because controls still use total photo count and the new actions do not exist.

- [ ] **Step 4: Implement per-user photo controls**

Calculate:

```ts
const ownPhotos = item.photos.filter(photo => photo.uploadedBy === session.user.id);
const canAddPhoto = ownPhotos.length < 3;
```

Use `canAddPhoto` in both the memory card and completed-details dialog. In details, wrap each photo preview in a positioned container and render an accessible delete button only for owned photos. Confirm with `window.confirm('Удалить это фото?')`; on approval, show a busy state for that photo, call the service, and keep the dialog open. Render a local error if deletion fails.

- [ ] **Step 5: Implement creator-only move control and tab transition**

Pass `onMovedToIdeas` from `App` to `DateDetailsDialog`. Show the button only for `status === 'planned'`, `requestedWindow !== 'idea'`, and `createdBy === session.user.id`. Confirm with `window.confirm('Переместить свидание в Банк идей? Дата и комментарий будут удалены.')`, call the service, then invoke the callback. In `App`, the callback sets tab to `ideas` and closes the selected date.

Style owned-photo controls, destructive buttons, errors, and narrow-screen wrapping without changing the established colors and typography.

- [ ] **Step 6: Run UI tests and build**

Run: `npm run test -w frontend -- src/pages/home/page.test.tsx && npm run build -w frontend`

Expected: PASS.

- [ ] **Step 7: Commit photo and idea UI**

```bash
git add frontend/src/pages/home/page.tsx frontend/src/pages/home/page.test.tsx frontend/src/styles.css
git commit -m "feat: manage photos and return plans from details"
```

### Task 7: Display both partners' calendar status

**Files:**
- Modify: `frontend/src/pages/home/page.tsx:64-89`
- Modify: `frontend/src/pages/home/page.test.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `DateItem.calendarAddedBy`, `homeService.space$`, and `homeApi.downloadCalendar`.
- Produces: member rows in the planned-date details and refreshes the date after a successful download.

- [ ] **Step 1: Write failing member-status UI test**

```ts
it('shows calendar status for both partners', () => {
  setupPlannedDate({ startsAt: '2026-10-03T16:00:00.000Z', calendarAddedBy: ['user-1'] }, [
    { id: 'user-1', name: 'Аня', email: 'anya@example.com', role: 'admin' },
    { id: 'partner-1', name: 'Игорь', email: 'igor@example.com', role: 'member' }
  ]);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Открыть детали: Кино' }));
  const calendar = screen.getByRole('region', { name: 'Добавление в календарь' });
  expect(within(calendar).getByText(/Аня.*Добавлено в календарь/)).toBeTruthy();
  expect(within(calendar).getByText(/Игорь.*Ещё не добавлено/)).toBeTruthy();
});
```

Add an async test that mocks a calendar blob, clicks `Добавить в календарь`, verifies `homeApi.downloadCalendar` and `homeService.refresh`, and confirms the temporary download link is clicked and revoked.

- [ ] **Step 2: Run date-detail tests and verify RED**

Run: `npm run test -w frontend -- src/pages/home/page.test.tsx`

Expected: FAIL because the dialog has no calendar status region or action.

- [ ] **Step 3: Implement calendar status and action in details**

Bind `homeService.space$` in `DateDetailsDialog`. When `item.startsAt || item.eventDate`, render a region labeled `Добавление в календарь`, map every `space.members` row, and check `item.calendarAddedBy.includes(member.id)`.

Add the calendar action to the details dialog with the clear label `Добавить в календарь`. After the blob download completes, call `homeService.refresh()` so the current user's row updates. Keep the compact `＋` card action for quick access, and route it through the same POST API and refresh behavior.

Use text plus a small colored marker so status does not rely on color alone.

- [ ] **Step 4: Run UI tests and frontend build**

Run: `npm run test -w frontend -- src/pages/home/page.test.tsx && npm run build -w frontend`

Expected: PASS.

- [ ] **Step 5: Commit calendar-status UI**

```bash
git add frontend/src/pages/home/page.tsx frontend/src/pages/home/page.test.tsx frontend/src/styles.css
git commit -m "feat: show partner calendar status"
```

### Task 8: Verify the complete workflow and prepare local user review

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Consumes: all server and client changes from Tasks 1–7.
- Produces: a locally running review build with representative creator, partner, planned-date, calendar-status, and six-photo states.

- [ ] **Step 1: Run formatting and diff checks**

Run: `git diff --check HEAD~7..HEAD && git status --short`

Expected: no whitespace errors and no generated `frontend/tsconfig.app.tsbuildinfo` change.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm test`

Expected: every backend and frontend test passes with zero failures.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: backend TypeScript and frontend Vite/PWA builds finish successfully.

- [ ] **Step 4: Start the local dependencies and application**

Run: `docker compose up -d && npm run dev`

Expected: PostgreSQL is healthy, API listens on `3001`, Vite listens on `5173`, and `http://localhost:5173` loads without proxy errors.

- [ ] **Step 5: Prepare representative review data**

Use the normal UI and authenticated API to ensure the local review account has:

- one planned date created by the signed-in user with an exact time;
- both member names visible, with only one calendar status marked;
- one completed date containing at least one owned and one partner-owned photo;
- the signed-in user below their three-photo allowance so “Добавить фото” is visible.

Do not modify production data for this review.

- [ ] **Step 6: Run independent code review before visual acceptance**

Run the requesting-code-review workflow against the complete branch. Address every Critical or Important finding, rerun the affected focused tests, and then rerun `npm test` and `npm run build`. Commit review fixes before opening the final interface for the user.

- [ ] **Step 7: Perform agent visual QA**

Open `http://localhost:5173` in the browser and inspect desktop and narrow layouts. Exercise photo preview/delete confirmation, per-user upload visibility, creator-only move confirmation, calendar status rows, and the calendar-download action. Fix any functional or visible defect, then rerun the affected tests plus `npm test` and `npm run build`.

- [ ] **Step 8: Request the user's final local interface review**

Leave the local application running and give the user the review URL plus a short checklist. Wait for explicit approval or requested changes before pushing or deploying.

- [ ] **Step 9: Publish only after approval**

After the user approves the locally running interface, push and deploy only when the user explicitly requests publication or confirms that the approved work should go live.
