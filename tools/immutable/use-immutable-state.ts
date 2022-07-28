import { immutable } from './exportable'
import {
  freeze,
  Immutable,
  ImmutableState,
} from "@bayzzer/tools"
import {
  useState,
  useCallback
} from "react"

export function useImmutableState<S = any>(initialValue: S | (() => S)): ImmutableState<Immutable<S>>

export function useImmutableState(initialValue: any) {
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