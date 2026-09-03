import { BehaviorSubject } from 'rxjs';
import { homeApi } from './api/home.api-service';
import { DateItem, Notification, PushConfig, Session, Space } from './api/home.model';
const stored = localStorage.getItem('dnh-session');
const restoredSession = stored ? JSON.parse(stored) : null;
if (restoredSession && !restoredSession.token) localStorage.removeItem('dnh-session');
export class HomeService {
  readonly session$ = new BehaviorSubject<Session | null>(restoredSession?.token ? restoredSession : null);
  readonly space$ = new BehaviorSubject<Space | null>(null);
  readonly dates$ = new BehaviorSubject<DateItem[]>([]);
  readonly notifications$ = new BehaviorSubject<Notification[]>([]);
  readonly error$ = new BehaviorSubject<string | null>(null);
  private save(session: Session) { localStorage.setItem('dnh-session', JSON.stringify(session)); this.session$.next(session); }
  async register(data: {name:string;email:string;password:string;spaceName:string}) { const result=await homeApi.register(data); if (!('token' in result)) { this.error$.next('Подтвердите email по ссылке из письма или консоли API.'); return; } this.save(result); await this.refresh(); }
  async login(data: {email:string;password:string}) { this.save(await homeApi.login(data)); await this.refresh(); }
  async acceptInvite(token: string, data: {name:string;email:string;password:string}) { this.save(await homeApi.acceptInvite(token, data)); await this.refresh(); }
  async refresh() { const session=this.session$.value; if (!session?.token) return; try { const [space, dates, notifications] = await Promise.all([homeApi.space(session.space.id, session.token), homeApi.dates(session.space.id, session.token), homeApi.notifications(session.user.id, session.token)]); this.space$.next(space); this.dates$.next(dates); this.notifications$.next(notifications); } catch (e) { this.error$.next(e instanceof Error ? e.message : 'Что-то пошло не так'); } }
  async createDate(data: object) { const session=this.session$.value!; const created=await homeApi.createDate(session.space.id,session.token,data); this.dates$.next([...this.dates$.value,created]); void this.refresh(); }
  async claimIdea(id:string,data:object) { const session=this.session$.value!; await homeApi.claimIdea(session.space.id,id,session.token,data); await this.refresh(); }
  async sendOrganizerComment(id:string,data:{startsAt:string;comment:string}) { const session=this.session$.value!; await homeApi.organizerComment(id,session.token,data); await this.refresh(); }
  async complete(id: string) { const session=this.session$.value!; await homeApi.status(id,session.token,'completed'); await this.refresh(); }
  async setType(typeId:string, enabled:boolean) { const session=this.session$.value!; await homeApi.setType(session.space.id,typeId,enabled,session.token); await this.refresh(); }
  async deleteType(typeId:string) { const session=this.session$.value!; await homeApi.deleteType(session.space.id,typeId,session.token); await this.refresh(); }
  async addType(title:string,emoji:string) { const session=this.session$.value!; await homeApi.addType(session.space.id,title,emoji,session.token); await this.refresh(); }
  async sendInvite(email:string,role:'admin'|'member') { const session=this.session$.value!; await homeApi.sendInvite(session.space.id,email,role,session.token); }
  async pushConfig():Promise<PushConfig> { return homeApi.pushConfig(this.session$.value!.token); }
  async subscribePush(subscription:PushSubscriptionJSON) { await homeApi.subscribePush(this.session$.value!.token,subscription); }
  async unsubscribePush(endpoint:string) { await homeApi.unsubscribePush(this.session$.value!.token,endpoint); }
  async readNotification(id:string) { const session=this.session$.value!; await homeApi.readNotification(id,session.token); await this.refresh(); }
  logout() { localStorage.removeItem('dnh-session'); this.session$.next(null); this.space$.next(null); this.dates$.next([]); this.notifications$.next([]); }
}
export const homeService = new HomeService();
