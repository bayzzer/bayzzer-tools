import { 
	AnyObject, 
	Drafted, 
	ImmutableState, 
	ObjectState 
} from '@types'

const hasSymbol = typeof Symbol !== "undefined" && typeof Symbol("x") === "symbol"

export const DRAFT_STATE: unique symbol = hasSymbol
	? Symbol.for("state")
	: ("_$state" as any)

export function isDraft(value: any): boolean {
	return !!value && !!value[DRAFT_STATE]
}

export function isDraftable(value: any): boolean {
	if (!value) return false
	return (
		isPlainObject(value) ||
		Array.isArray(value) 
	)
}

const objectCtorString = Object.prototype.constructor.toString()

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

export function original<T>(value: T): T | undefined

export function original(value: Drafted<any>): any {
	return value[DRAFT_STATE].base_
}

export const ownKeys: (target: AnyObject) => PropertyKey[] =
	typeof Reflect !== "undefined" && Reflect.ownKeys
		? Reflect.ownKeys
		: typeof Object.getOwnPropertySymbols !== "undefined"
		? obj =>
				Object.getOwnPropertyNames(obj).concat(
					Object.getOwnPropertySymbols(obj) as any
				)
		: Object.getOwnPropertyNames

export const getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors || function getOwnPropertyDescriptors(target: any) 
{	
		const res: any = {}
		ownKeys(target).forEach(key => {
			res[key] = Object.getOwnPropertyDescriptor(target, key)
		})
		return res
}

export function each<T extends ObjectState>(
	obj: T,
	iter: (key: string | number, value: any, source: T) => void,
	enumerableOnly?: boolean
): void

export function each(obj: any, iter: any, enumerableOnly = false) {
	if(Array.isArray(obj)){
		obj.forEach((entry: any, index: any) => iter(index, entry, obj))
	}else{
		(enumerableOnly ? Object.keys : ownKeys)(obj).forEach(key => {
			if (!enumerableOnly || typeof key !== "symbol") iter(key, obj[key], obj)
		})
	}
}

export function has(thing: any, prop: PropertyKey): boolean {
	return Object.prototype.hasOwnProperty.call(thing, prop)
}

export function get(thing: AnyObject, prop: PropertyKey): any {
	// @ts-ignore
	return thing[prop]
}

export function set(thing: any, propOrOldValue: PropertyKey, value: any) {
	thing[propOrOldValue] = value
}

export function is(x: any, y: any): boolean {	
	if (x === y) {
		return x !== 0 || 1 / x === 1 / y
	} else {
		return x !== x && y !== y
	}
}

export function latest(state: ImmutableState<any>): any {
	return state.copy_ || state.base_
}

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

		if (desc.get || desc.set)
			descriptors[key] = {
				configurable: true,
				writable: true,
				enumerable: desc.enumerable,
				value: base[key]
			}
	}
	return Object.create(Object.getPrototypeOf(base), descriptors)
}

export function freeze<T>(obj: any, deep: boolean = false): T {
	if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj)) return obj	
	Object.freeze(obj)
	if (deep) each(obj, (key, value) => freeze(value, true), true)
	return obj
}

export function isFrozen(obj: any): boolean {
	if (obj == null || typeof obj !== "object") return true
	return Object.isFrozen(obj)
}
