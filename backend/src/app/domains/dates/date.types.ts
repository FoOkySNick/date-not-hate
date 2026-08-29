export type OrganizerMode = 'self' | 'partner';
export type DateStatus = 'planned' | 'completed' | 'cancelled';

export interface DateInput {
  typeId: string;
  title: string;
  startsAt?: string | null;
  eventDate?: string | null;
  isAllDay?: boolean;
  organizerMode: OrganizerMode;
}
