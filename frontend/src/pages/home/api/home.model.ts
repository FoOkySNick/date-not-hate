export type OrganizerMode = 'self' | 'partner';
export type DateItem = { id:string; title:string; startsAt:string|null; eventDate:string|null; isAllDay:boolean; organizerMode:OrganizerMode; createdBy:string; organizerComment:string|null; status:'planned'|'completed'|'cancelled'; typeTitle:string; emoji:string; photos:{id:string;filename:string}[] };
export type Space = { id:string; name:string; members:{id:string;name:string;email:string;role:string}[]; dateTypes:{id:string;title:string;emoji:string;enabled:boolean}[] };
export type Session = { user:{id:string;name:string;email:string}; space:{id:string;name:string}; token:string };
export type Notification = { id:string; body:string; createdAt:string; readAt:string|null };
export type PushConfig = { enabled:boolean; publicKey?:string };
