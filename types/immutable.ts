import { DRAFT_STATE, ManageState } from '@bayzzer/tools'

export interface ImmutableScope {
	drafts: any[]
	manage: ManageState
}

export interface IProduce<T> {
	(
		state: T,
		dispatch: (draft: T) => void
	): T

	/** Promisified dormal producer */
	// <Base, D = Draft<Base>>(
	// 	base: Base,
	// 	//recipe: (draft: D) => Promise<ValidRecipeReturnType<D>>
	// ): Promise<Base>
}

export type ObjectState = AnyObject | AnyArray

export type AnyObject = {[key: string]: any}
export type AnyArray = Array<any>

export interface ImmutableState<T> {
	scope_: ImmutableScope
	modified_: boolean
	finalized_: boolean
	base_: T
	copy_: T
	draft_: T
}

export type Drafted<S, T extends ImmutableState<S> = ImmutableState<S>> = {
	[DRAFT_STATE]: T
} & S

export type Immutable<T> =
  T extends (infer R)[] ? ImmutableArray<R> :
  T extends Function ? T :
  T extends object ? ImmutableObject<T> :
  T

interface ImmutableArray<T> extends ReadonlyArray<Immutable<T>> {}

type ImmutableObject<T> = {
  readonly [P in keyof T]: Immutable<T[P]>
}
