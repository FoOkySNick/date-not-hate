export type OrganizerMode = 'self' | 'partner';
export type DateStatus = 'planned' | 'completed' | 'cancelled';
export type RequestedWindow = 'today' | 'this_week' | 'this_month' | 'next_month' | 'idea';
export type PlannedWindow = Exclude<RequestedWindow, 'idea'>;

export interface DateInput {
  typeId: string;
  title: string;
  startsAt?: string | null;
  eventDate?: string | null;
  isAllDay?: boolean;
  organizerMode: OrganizerMode;
  requestedWindow?: RequestedWindow | null;
}
