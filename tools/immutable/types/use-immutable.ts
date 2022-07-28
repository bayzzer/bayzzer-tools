import { 
    Draft, 
    NOTHING 
} from "@bayzzer/tools"

export type ImmutableReducer<S = any, A = any> = (
    draftState: Draft<S>,
    action: A
  ) => void | (S extends undefined ? typeof NOTHING : S)
  
  export type DraftFunction<S> = (draft: Draft<S>) => void
  export type ImmutableDispatch<S> = (arg: S | DraftFunction<S>) => void
  export type ImmutableState<S> = [S, ImmutableDispatch<S>]