import { ImmutableManage } from "./core"
export { useImmutableState } from './use-immutable-state'
export { useImmutableReducer } from './use-immutable-reducer'

import {
	//Draft,
	Immutable,
	ImmutableProduce,
	ImmutableDispatch
	//IProduceWithPatches 
} from "@bayzzer/tools"

const immutableManage = new ImmutableManage()

export const immutable: ImmutableProduce = immutableManage.immutable

// /**
//  * Like `produce`, but `produceWithPatches` always returns a tuple
//  * [nextState, patches, inversePatches] (instead of just the next state)
//  */
// export const produceWithPatches: IProduceWithPatches = immutableManage.produceWithPatches.bind(
// 	immutableManage
// )

// /**
//  * Pass true to automatically freeze all copies created by Immer.
//  *
//  * Always freeze by default, even in production mode
//  */
// export const setAutoFreeze = immutableManage.setAutoFreeze.bind(immutableManage)

// /**
//  * Pass true to use the ES2015 `Proxy` class when creating drafts, which is
//  * always faster than using ES5 proxies.
//  *
//  * By default, feature detection is used, so calling this is rarely necessary.
//  */
// export const setUseProxies = immutableManage.setUseProxies.bind(immutableManage)

// /**
//  * Apply an array of Immer patches to the first argument.
//  *
//  * This function is a producer, which means copy-on-write is in effect.
//  */
// export const applyPatches = immutableManage.applyPatches.bind(immutableManage)

// /**
//  * Create an Immer draft from the given base state, which may be a draft itself.
//  * The draft can be modified until you finalize it with the `finishDraft` function.
//  */
// export const createDraft = immutableManage.createDraft.bind(immutableManage)

// /**
//  * Finalize an Immer draft from a `createDraft` call, returning the base state
//  * (if no changes were made) or a modified copy. The draft must *not* be
//  * mutated afterwards.
//  *
//  * Pass a function as the 2nd argument to generate Immer patches based on the
//  * changes that were made.
//  */
// export const finishDraft = immutableManage.finishDraft.bind(immutableManage)

// /**
//  * This function is actually a no-op, but can be used to cast an immutable type
//  * to an draft type and make TypeScript happy
//  *
//  * @param value
//  */
// export function castDraft<T>(value: T): Draft<T> {
// 	return value as any
// }

// /**
//  * This function is actually a no-op, but can be used to cast a mutable type
//  * to an immutable type and make TypeScript happy
//  * @param value
//  */
// export function castImmutable<T>(value: T): Immutable<T> {
// 	return value as any
// }

export { 
	ImmutableManage, 
	Immutable, 
	ImmutableDispatch 
}

// export {enableES5} from "./plugins/es5"
// export {enablePatches} from "./plugins/patches"
// export {enableMapSet} from "./plugins/mapset"
// export {enableAllPlugins} from "./plugins/all"
