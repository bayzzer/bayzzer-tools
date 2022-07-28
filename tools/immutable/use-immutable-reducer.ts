import {
  Immutable,
  ImmutableDispatch,
  ImmutableReducer,
} from "@bayzzer/tools"
import {
  useReducer,
  useCallback
} from "react"

export function useImmutableReducer<S = any, A = any>(
  reducer: ImmutableReducer<S, A>,
  initialState: S,
  initialAction?: (initial: any) => S
): [Immutable<S>, ImmutableDispatch<S>]

export function useImmutableReducer(
  reducer: any,
  initialState: any
) {

  const [state, dispatchState] = useReducer(reducer, initialState)
  const dispatch = useCallback(dispatchState, [])
  return [state, dispatch]
}