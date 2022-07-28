import { 
    AnyMap,
    AnyObject,
    AnySet,
    Drafted,
    ImmutableBaseState, 
    ImmutableType, 
    ProxyType
} from "@bayzzer/tools"

export type ES5State = ES5ArrayState | ES5ObjectState

interface ES5BaseState extends ImmutableBaseState {
	assigned_: {[key: string]: any}
	parent_?: ImmutableType
	revoked_: boolean
}

export interface ES5ObjectState extends ES5BaseState {
	type_: ProxyType.ES5Object
	draft_: Drafted<AnyObject, ES5ObjectState>
	base_: AnyObject
	copy_: AnyObject | null
}

export interface ES5ArrayState extends ES5BaseState {
	type_: ProxyType.ES5Array
	draft_: Drafted<AnyObject, ES5ArrayState>
	base_: any
	copy_: any
}

export interface MapState extends ImmutableBaseState {
	type_: ProxyType.Map
	copy_: AnyMap | undefined
	assigned_: Map<any, boolean> | undefined
	base_: AnyMap
	revoked_: boolean
	draft_: Drafted<AnyMap, MapState>
}

export interface SetState extends ImmutableBaseState {
	type_: ProxyType.Set
	copy_: AnySet | undefined
	base_: AnySet
	drafts_: Map<any, Drafted> // maps the original value to the draft value in the new set
	revoked_: boolean
	draft_: Drafted<AnySet, SetState>
}

