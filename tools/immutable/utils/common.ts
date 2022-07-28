/** Returns true if the given value is an Immer draft */
import { 
	AnyMap,
	AnyObject,
	AnySet,
	Archtype,
	DRAFTABLE,
	Drafted,
	DRAFT_STATE, 
	hasMap, 
	hasSet, 
	ImmutableType, 
	Objectish
} from "@bayzzer/tools"

/*#__PURE__*/
export function isDraft(value: any): boolean {
	return !!value && !!value[DRAFT_STATE]
}

/** Returns true if the given value can be drafted by Immer */
/*#__PURE__*/
export function isDraftable<T>(value: T): boolean {
	if (!value) return false
	return (
		isPlainObject(value) ||
		Array.isArray(value) ||
		// @ts-ignore
		!!value[DRAFTABLE] ||
		// @ts-ignore
		!!value.constructor[DRAFTABLE] ||
		isMap(value) ||
		isSet(value)
	)
}

const objectCtorString = Object.prototype.constructor.toString()
/*#__PURE__*/
export function isPlainObject(value: any): boolean {
	if (!value || typeof value !== "object") return false
	const proto = Object.getPrototypeOf(value)
	if (proto === null) {
		return true
	}
	const Ctor =
		Object.hasOwnProperty.call(proto, "constructor") && proto.constructor

	if (Ctor === Object) return true

	return (
		typeof Ctor == "function" &&
		Function.toString.call(Ctor) === objectCtorString
	)
}

/** Get the underlying object that is represented by the given draft */
/*#__PURE__*/
export function originalState<T>(value: T): T | undefined
export function originalState(value: Drafted<any>): any {
	return value[DRAFT_STATE].base_
}

/*#__PURE__*/
export const ownKeys: (target: AnyObject) => PropertyKey[] =
	typeof Reflect !== "undefined" && Reflect.ownKeys
		? Reflect.ownKeys
		: typeof Object.getOwnPropertySymbols !== "undefined"
		? obj =>
				Object.getOwnPropertyNames(obj).concat(
					Object.getOwnPropertySymbols(obj) as any
				)
		: /* istanbul ignore next */ Object.getOwnPropertyNames

export const getOwnPropertyDescriptors =
	Object.getOwnPropertyDescriptors ||
	function getOwnPropertyDescriptors(target: any) {
		// Polyfill needed for Hermes and IE, see https://github.com/facebook/hermes/issues/274
		const res: any = {}
		ownKeys(target).forEach(key => {
			res[key] = Object.getOwnPropertyDescriptor(target, key)
		})
		return res
	}

export function eachProperty<T extends Objectish>(
	obj: T,
	iter: (key: string | number, value: any, source: T) => void,
	enumerableOnly?: boolean
): void

export function eachProperty(obj: any, iter: any, enumerableOnly = false) {
	if (getArchtype(obj) === Archtype.Object) {
		(enumerableOnly ? Object.keys : ownKeys)(obj).forEach(key => {
			if (!enumerableOnly || typeof key !== "symbol") iter(key, obj[key], obj)
		})
	} else {
		obj && obj.forEach((entry: any, index: any) => iter(index, entry, obj))
	}
}

/*#__PURE__*/
export function getArchtype(thing: any): Archtype {
	/* istanbul ignore next */
	const state: undefined | ImmutableType = thing[DRAFT_STATE]
	return state
		? state.type_ > 3
			? state.type_ - 4 // cause Object and Array map back from 4 and 5
			: (state.type_ as any) // others are the same
		: Array.isArray(thing)
		? Archtype.Array
		: isMap(thing)
		? Archtype.Map
		: isSet(thing)
		? Archtype.Set
		: Archtype.Object
}

/*#__PURE__*/
export function hasProperty(thing: any, prop: PropertyKey): boolean {
	return getArchtype(thing) === Archtype.Map
		? thing.has(prop)
		: Object.prototype.hasOwnProperty.call(thing, prop)
}

/*#__PURE__*/
export function getProperty(thing: AnyMap | AnyObject, prop: PropertyKey): any {
	// @ts-ignore
	return getArchtype(thing) === Archtype.Map ? thing.get(prop) : thing[prop]
}

/*#__PURE__*/
export function setProperty(thing: any, propOrOldValue: PropertyKey, value: any) {
	const t = getArchtype(thing)
	if (t === Archtype.Map) thing.set(propOrOldValue, value)
	else if (t === Archtype.Set) {
		thing.delete(propOrOldValue)
		thing.add(value)
	} else thing[propOrOldValue] = value
}

/*#__PURE__*/
export function isEqual(x: any, y: any): boolean {
	// From: https://github.com/facebook/fbjs/blob/c69904a511b900266935168223063dd8772dfc40/packages/fbjs/src/core/shallowEqual.js
	if (x === y) {
		return x !== 0 || 1 / x === 1 / y
	} else {
		return x !== x && y !== y
	}
}

/*#__PURE__*/
export function isMap(target: any): target is AnyMap {
	return hasMap && target instanceof Map
}

/*#__PURE__*/
export function isSet(target: any): target is AnySet {
	return hasSet && target instanceof Set
}
/*#__PURE__*/
export function latest(state: ImmutableType): any {
	return state.copy_ || state.base_
}

/*#__PURE__*/
export function shallowCopy(base: any) {
	if (Array.isArray(base)) return Array.prototype.slice.call(base)
	const descriptors = getOwnPropertyDescriptors(base)
	delete descriptors[DRAFT_STATE as any]
	let keys = ownKeys(descriptors)
	for (let i = 0; i < keys.length; i++) {
		const key: any = keys[i]
		const desc = descriptors[key]
		if (desc.writable === false) {
			desc.writable = true
			desc.configurable = true
		}
		// like object.assign, we will read any _own_, get/set accessors. This helps in dealing
		// with libraries that trap values, like mobx or vue
		// unlike object.assign, non-enumerables will be copied as well
		if (desc.get || desc.set)
			descriptors[key] = {
				configurable: true,
				writable: true, // could live with !!desc.set as well here...
				enumerable: desc.enumerable,
				value: base[key]
			}
	}
	return Object.create(Object.getPrototypeOf(base), descriptors)
}

/**
 * Freezes draftable objects. Returns the original object.
 * By default freezes shallowly, but if the second argument is `true` it will freeze recursively.
 *
 * @param obj
 * @param deep
 */
export function freeze<T>(obj: T, deep?: boolean): T
export function freeze<T>(obj: any, deep: boolean = false): T {
	if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj)) return obj
	Object.freeze(obj)
	if (deep) eachProperty(obj, (key, value) => freeze(value, true), true)
	return obj
}

export function isFrozen(obj: any): boolean {
	if (obj == null || typeof obj !== "object") return true
	return Object.isFrozen(obj)
}
