import { 	
	DRAFT_STATE,
	freeze,
	latest,
	has,
	isDraftable,
	is,
	shallowCopy,
	getCurrentScope
} from '@bayzzer/tools'

import {
	ObjectState,
	Drafted,
	ImmutableState,	
	ImmutableScope
} from '@types'

export function createDraft<T extends ObjectState>(
	value: T
): Drafted<T, ImmutableState<T>> {	
	
	const draft: Drafted<T> = createProxy(value)
	const scope = getCurrentScope()
	scope.drafts.push(draft)
	return draft
}

export function processScope<T>(scope: ImmutableScope) {

	const baseDraft = scope.drafts![0]
	const state: ImmutableState<T> = baseDraft[DRAFT_STATE]
	if (!state.finalized_) {		
		const result = state.copy_		
		freeze(result, false)		
	}

	return state.copy_
}

export function createProxy<T extends ObjectState>(
	base: T
): Drafted<T, ImmutableState<T>> {
	
	const isArray = Array.isArray(base)
	const state: ImmutableState<T> = {
		scope_:  getCurrentScope()!,
		modified_: false,
		finalized_: false,
		base_: base,
		draft_: null as any,
		copy_: null as any,
	}
	
	let target: T = state as any
	let traps: ProxyHandler<object | Array<any>> = objectTraps
	if (isArray) {
		target = [state] as any
		traps = arrayTraps
	}

	const {proxy} = Proxy.revocable(target, traps)
	state.draft_ = proxy as any
	return proxy as any
}

export const objectTraps: ProxyHandler<ImmutableState<any>> = {
	get(state, prop) {
		if (prop === DRAFT_STATE) return state

		const source = latest(state)
		if (!has(source, prop)) {
			return readPropFromProto(state, source, prop)
		}
		const value = source[prop]
		if (state.finalized_ || !isDraftable(value)) {
			return value
		}
		
		return value
	},
	has(state, prop) {
		return prop in latest(state)
	},
	ownKeys(state) {
		return Reflect.ownKeys(latest(state))
	},
	set(
		state: ImmutableState<any>,
		prop: string /* strictly not, but helps TS */,
		value
	) {
		const desc = getDescriptorFromProto(latest(state), prop)
		if (desc?.set) {
			desc.set.call(state.draft_, value)
			return true
		}
		if (!state.modified_) {
			const current = peek(latest(state), prop)		
			const currentState: ImmutableState<any> = current?.[DRAFT_STATE]
			if (currentState && currentState.base_ === value) {
				state.copy_![prop] = value
				return true
			}
			if (is(value, current) && (value !== undefined || has(state.base_, prop)))
				return true
			prepareCopy(state)
			markChanged(state)
		}

		if (
			state.copy_![prop] === value &&
			typeof value !== "number" &&
			(value !== undefined || prop in state.copy_)
		)
			return true

		// @ts-ignore
		state.copy_![prop] = value
		return true
	},
	deleteProperty(state, prop: string) {
		if (peek(state.base_, prop) !== undefined || prop in state.base_) {
			prepareCopy(state)
			markChanged(state)
		} else {
			// if an originally not assigned property was deleted
			//delete state.assigned_[prop]
		}
		// @ts-ignore
		if (state.copy_) delete state.copy_[prop]
		return true
	},

	getOwnPropertyDescriptor(state, prop) {
		const owner = latest(state)
		const desc = Reflect.getOwnPropertyDescriptor(owner, prop)
		if (!desc) return desc
		return {
			writable: true,
			enumerable: desc.enumerable,
			value: owner[prop]
		}
	},
	getPrototypeOf(state) {
		return Object.getPrototypeOf(state.base_)
	}
}

const arrayTraps: ProxyHandler<[ImmutableState<any>]> = {}



arrayTraps.deleteProperty = function(state, prop) {
	// @ts-ignore
	return arrayTraps.set!.call(this, state, prop, undefined)
}

arrayTraps.set = function(state, prop, value) {
	return objectTraps.set!.call(this, state[0], prop, value, state[0])
}

function peek(draft: Drafted<any>, prop: PropertyKey) {
	const state = draft[DRAFT_STATE]
	const source = state ? latest(state) : draft
	return source[prop]
}

function readPropFromProto(state: ImmutableState<any>, source: any, prop: PropertyKey) {
	const desc = getDescriptorFromProto(source, prop)
	return desc
		? `value` in desc
			? desc.value
			: desc.get?.call(state.draft_)
		: undefined
}

function getDescriptorFromProto(
	source: any,
	prop: PropertyKey
): PropertyDescriptor | undefined {
	if (!(prop in source)) return undefined
	let proto = Object.getPrototypeOf(source)
	while (proto) {
		const desc = Object.getOwnPropertyDescriptor(proto, prop)
		if (desc) return desc
		proto = Object.getPrototypeOf(proto)
	}
	return undefined
}

export function markChanged(state: ImmutableState<any>) {
	if (!state.modified_) {
		state.modified_ = true
	}
}

export function prepareCopy(state: {base_: any; copy_: any}) {
	if (!state.copy_) {
		state.copy_ = shallowCopy(state.base_)
	}
}
