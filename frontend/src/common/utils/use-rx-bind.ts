import { useEffect, useState } from 'react';
import { BehaviorSubject } from 'rxjs';
export const useRxBind = <T,>(stream: BehaviorSubject<T>) => {
  const [value, setValue] = useState(stream.value);
  useEffect(() => { const subscription = stream.subscribe(setValue); return () => subscription.unsubscribe(); }, [stream]);
  return value;
};
