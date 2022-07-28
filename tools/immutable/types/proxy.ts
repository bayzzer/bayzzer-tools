import { AnyArray, AnyObject, Drafted, ImmutableBaseState, ImmutableType } from "@bayzzer/tools"

export const enum ProxyType {
	ProxyObject,
	ProxyArray,
	Map,
	Set,
	ES5Object,
	ES5Array
}

export interface ProxyObjectState extends ProxyBaseState {
	type_: ProxyType.ProxyObject
	base_: any
	copy_: any
	draft_: Drafted<AnyObject, ProxyObjectState>
}

export interface ProxyArrayState extends ProxyBaseState {
	type_: ProxyType.ProxyArray
	base_: AnyArray
	copy_: AnyArray | null
	draft_: Drafted<AnyArray, ProxyArrayState>
}

export type ProxyState = ProxyObjectState | ProxyArrayState

export interface ProxyBaseState extends ImmutableBaseState {
	assigned_: {
		[property: string]: boolean
	}
	parent_?: ImmutableType
	revoke_(): void
}