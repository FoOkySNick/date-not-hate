import { DateItem, Notification, PushConfig, Session, Space } from './home.model';
const json = async <T>(url:string, init?:RequestInit):Promise<T> => { const response=await fetch(url,{...init,headers:{'Content-Type':'application/json',...(init?.headers??{})}}); if(!response.ok) throw new Error((await response.json().catch(()=>({}))).message??'Ошибка сети'); return response.status===204?undefined as T:response.json(); };
const secured=(token:string)=>({Authorization:`Bearer ${token}`});
export const homeApi={
  register:(data:{name:string;email:string;password:string;spaceName:string})=>json<Session|{verificationPending:true}>('/api/auth/register',{method:'POST',body:JSON.stringify(data)}),
  login:(data:{email:string;password:string})=>json<Session>('/api/auth/login',{method:'POST',body:JSON.stringify(data)}),
  requestPasswordReset:(email:string)=>json<void>('/api/auth/password-reset/request',{method:'POST',body:JSON.stringify({email})}),
  confirmPasswordReset:(token:string,password:string)=>json<void>('/api/auth/password-reset/confirm',{method:'POST',body:JSON.stringify({token,password})}),
  confirmEmailVerification:(token:string)=>json<Session>('/api/auth/email-verification/confirm',{method:'POST',body:JSON.stringify({token})}),
  acceptInvite:(invite:string,data:{name:string;email:string;password:string})=>json<Session>(`/api/invites/${invite}/accept`,{method:'POST',body:JSON.stringify(data)}),
  sendInvite:(spaceId:string,email:string,role:'admin'|'member',token:string)=>json<void>(`/api/spaces/${spaceId}/invites`,{method:'POST',headers:secured(token),body:JSON.stringify({email,role})}),
  space:(id:string,token:string)=>json<Space>(`/api/spaces/${id}`,{headers:secured(token)}),
  dates:(id:string,token:string)=>json<DateItem[]>(`/api/spaces/${id}/dates`,{headers:secured(token)}),
  createDate:(spaceId:string,token:string,data:object)=>json<DateItem>(`/api/spaces/${spaceId}/dates`,{method:'POST',headers:secured(token),body:JSON.stringify(data)}),
  organizerComment:(id:string,token:string,comment:string)=>json<void>(`/api/dates/${id}/organizer-comment`,{method:'PATCH',headers:secured(token),body:JSON.stringify({comment})}),
  status:(id:string,token:string,status:string)=>json<void>(`/api/dates/${id}/status`,{method:'PATCH',headers:secured(token),body:JSON.stringify({status})}),
  upload:async(id:string,token:string,files:File[])=>{const form=new FormData();files.forEach(file=>form.append('photos',file));const response=await fetch(`/api/dates/${id}/photos`,{method:'POST',headers:secured(token),body:form});if(!response.ok)throw new Error('Не удалось загрузить фото');},
  notifications:(userId:string,token:string)=>json<Notification[]>(`/api/users/${userId}/notifications`,{headers:secured(token)}),
  readNotification:(id:string,token:string)=>json<void>(`/api/notifications/${id}/read`,{method:'PATCH',headers:secured(token)}),
  pushConfig:(token:string)=>json<PushConfig>('/api/push/config',{headers:secured(token)}),
  subscribePush:(token:string,subscription:PushSubscriptionJSON)=>json<void>('/api/push/subscriptions',{method:'POST',headers:secured(token),body:JSON.stringify(subscription)}),
  unsubscribePush:(token:string,endpoint:string)=>json<void>('/api/push/subscriptions',{method:'DELETE',headers:secured(token),body:JSON.stringify({endpoint})}),
  setType:(spaceId:string,typeId:string,enabled:boolean,token:string)=>json<void>(`/api/spaces/${spaceId}/types/${typeId}`,{method:'PATCH',headers:secured(token),body:JSON.stringify({enabled})}),
  addType:(spaceId:string,title:string,emoji:string,token:string)=>json<void>(`/api/spaces/${spaceId}/types`,{method:'POST',headers:secured(token),body:JSON.stringify({title,emoji})}),
  downloadCalendar:async(id:string,token:string)=>{const response=await fetch(`/api/dates/${id}/calendar.ics`,{headers:secured(token)});if(!response.ok)throw new Error((await response.text()).trim()||'Не удалось скачать событие календаря.');return response.blob();}
};
