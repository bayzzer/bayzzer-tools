import { 
	DRAFT_STATE, 
	ES5ArrayState, 
	ES5ObjectState, 
	ImmutableScope, 
	MapState, 
	ProxyArrayState, 
	ProxyObjectState,
	SetState
} from "@bayzzer/tools"

export type Objectish = AnyObject | AnyArray | AnyMap | AnySet
export type ObjectishNoSet = AnyObject | AnyArray | AnyMap

export type AnyObject = {[key: string]: any}
export type AnyArray = Array<any>
export type AnySet = Set<any>
export type AnyMap = Map<any, any>

export const enum Archtype {
	Object,
	Array,
	Map,
	Set
}

export interface ImmutableBaseState {
	parent_?: ImmutableType
	scope_: ImmutableScope
	modified_: boolean
	finalized_: boolean
	isManual_: boolean
}

export type ImmutableType =
	| ProxyObjectState
	| ProxyArrayState
	| ES5ObjectState
	| ES5ArrayState
	| MapState
	| SetState

export type Drafted<Base = any, T extends ImmutableType = ImmutableType> = {
	[DRAFT_STATE]: T
} & Base

type PrimitiveType = number | string | boolean

type AtomicObject = Function | Promise<any> | Date | RegExp

export type IfAvailable<T, Fallback = void> =
	// fallback if any
	true | false extends (T extends never
	? true
	: false)
		? Fallback // fallback if empty type
		: keyof T extends never
		? Fallback // original type
		: T

/**
 * These should also never be mapped but must be tested after regular Map and
 * Set
 */
type WeakReferences = IfAvailable<WeakMap<any, any>> | IfAvailable<WeakSet<any>>

export type WritableDraft<T> = {-readonly [K in keyof T]: Draft<T[K]>}

export type Draft<T> = T extends PrimitiveType
	? T
	: T extends AtomicObject
	? T
	: T extends IfAvailable<ReadonlyMap<infer K, infer V>> // Map extends ReadonlyMap
	? Map<Draft<K>, Draft<V>>
	: T extends IfAvailable<ReadonlySet<infer V>> // Set extends ReadonlySet
	? Set<Draft<V>>
	: T extends WeakReferences
	? T
	: T extends object
	? WritableDraft<T>
	: T

/** Convert a mutable type into a readonly type */
export type Immutable<T> = T extends PrimitiveType
	? T
	: T extends AtomicObject
	? T
	: T extends IfAvailable<ReadonlyMap<infer K, infer V>> // Map extends ReadonlyMap
	? ReadonlyMap<Immutable<K>, Immutable<V>>
	: T extends IfAvailable<ReadonlySet<infer V>> // Set extends ReadonlySet
	? ReadonlySet<Immutable<V>>
	: T extends WeakReferences
	? T
	: T extends object
	? {readonly [K in keyof T]: Immutable<T[K]>}
	: T