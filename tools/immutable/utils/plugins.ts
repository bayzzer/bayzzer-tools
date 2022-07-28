import { 
	AnyMap,
	AnySet,
	Drafted,
	ES5ArrayState,
	ES5ObjectState,
	ImmutableScope,
	ImmutableType, 
	Patch, 
	PatchPath 
} from "@bayzzer/tools"

/** Plugin utilities */
const plugins: {
	Patches?: {
		generatePatches_(
			state: ImmutableType,
			basePath: PatchPath,
			patches: Patch[],
			inversePatches: Patch[]
		): void
		generateReplacementPatches_(
			base: any,
			replacement: any,
			patches: Patch[],
			inversePatches: Patch[]
		): void
		applyPatches_<T>(draft: T, patches: Patch[]): T
	}
	ES5?: {
		willFinalizeES5_(scope: ImmutableScope, result: any, isReplaced: boolean): void
		createES5Proxy_<T>(
			base: T,
			parent?: ImmutableType
		): Drafted<T, ES5ObjectState | ES5ArrayState>
		hasChanges_(state: ES5ArrayState | ES5ObjectState): boolean
	}
	MapSet?: {
		proxyMap_<T extends AnyMap>(target: T, parent?: ImmutableType): T
		proxySet_<T extends AnySet>(target: T, parent?: ImmutableType): T
	}
} = {}

type Plugins = typeof plugins

export function getPlugin<K extends keyof Plugins>(
	pluginKey: K
): Exclude<Plugins[K], undefined> {
	const plugin = plugins[pluginKey]
	// @ts-ignore
	return plugin
}

export function loadPlugin<K extends keyof Plugins>(
	pluginKey: K,
	implementation: Plugins[K]
): void {
	if (!plugins[pluginKey]) plugins[pluginKey] = implementation
}
