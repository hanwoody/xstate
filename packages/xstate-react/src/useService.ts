import { useEffect, useMemo, useRef } from 'react';
import { EventObject, State, Interpreter, Typestate } from 'xstate';
import { useActor } from './useActor';
import { ActorRef, PayloadSender } from './types';
import useConstant from './useConstant';

export function fromService<TContext, TEvent extends EventObject>(
  service: Interpreter<TContext, any, TEvent>
): ActorRef<TEvent, State<TContext, TEvent>> {
  if (process.env.NODE_ENV !== 'production' && !('machine' in service)) {
    throw new Error(
      `Attempted to use an actor-like object instead of a service in the useService() hook. Please use the useActor() hook instead.`
    );
  }

  const { machine } = service as Interpreter<TContext, any, TEvent>;
  return {
    send: service.send.bind(service),
    subscribe: (cb) => service.subscribe((state) => cb(state)),
    stop: service.stop!,
    // TODO: remove compat lines in a new major, replace literal number with InterpreterStatus then as well
    current:
      ('status' in service ? service.status : (service as any)._status) !== 0
        ? service.state
        : machine.initialState,
    name: service.sessionId
  };
}

export function useService<
  TContext,
  TEvent extends EventObject,
  TTypestate extends Typestate<TContext> = { value: any; context: TContext }
>(
  service: Interpreter<TContext, any, TEvent, TTypestate>
): [State<TContext, TEvent, any, TTypestate>, PayloadSender<TEvent>] {
  const serviceActor = useMemo(() => fromService(service), [service]);

  // Using a ref ensures that the constant `sender` always sends the event
  // to the latest (possibly changed) `service.send` method.
  const senderRef = useRef(service.send);
  useEffect(() => {
    senderRef.current = service.send;
  }, [service.send]);
  const sender = useConstant(
    () =>
      ((event, payload) => {
        senderRef.current(event, payload);
      }) as PayloadSender<TEvent>
  );

  const [state] = useActor<TEvent, State<TContext, TEvent, any, TTypestate>>(
    serviceActor,
    (actor) => (actor as typeof serviceActor).current
  );

  return [state, sender];
}
