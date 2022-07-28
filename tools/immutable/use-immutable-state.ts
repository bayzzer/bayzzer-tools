import {
  freeze,
  Immutable,
  ImmutableManage,
  ImmutableState,
} from "@bayzzer/tools"
import {
  useState,
  useCallback
} from "react"

export function useImmutableState<S = any>(initialValue: S | (() => S)): ImmutableState<Immutable<S>>

export function useImmutableState(initialValue: any) {
  const immutable = new ImmutableManage().create
  const [val, updateValue] = useState(() =>
    freeze(
      typeof initialValue === "function" ? initialValue() : initialValue,
      true
    )
  );
  return [
    val,
    useCallback((updater: any) => {
      updateValue(immutable(val, updater))
    }, []),
  ]
}