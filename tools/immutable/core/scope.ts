import { 
	Drafted,
	DRAFT_STATE,
	getPlugin,
	ImmutableManage,
	ImmutableScope, 
	ImmutableType, 
	PatchListener,
	ProxyType
} from "@bayzzer/tools"



let currentScope: ImmutableScope | undefined

export function getCurrentScope() {
	return currentScope!
}

function createScope(
	parent_: ImmutableScope | undefined,
	immutable_: ImmutableManage
): ImmutableScope {
	return {
		drafts_: [],
		parent_,
		immutable_: immutable_,
		// Whenever the modified draft contains a draft from another scope, we
		// need to prevent auto-freezing so the unowned draft can be finalized.
		canAutoFreeze_: true,
		unfinalizedDrafts_: 0
	}
}

export function usePatchesInScope(
	scope: ImmutableScope,
	patchListener?: PatchListener
) {
	if (patchListener) {
		getPlugin("Patches") // assert we have the plugin
		scope.patches_ = []
		scope.inversePatches_ = []
		scope.patchListener_ = patchListener
	}
}

export function revokeScope(scope: ImmutableScope) {
	leaveScope(scope)
	scope.drafts_.forEach(revokeDraft)
	// @ts-ignore
	scope.drafts_ = null
}

export function leaveScope(scope: ImmutableScope) {
	if (scope === currentScope) {
		currentScope = scope.parent_
	}
}

export function enterScope(immer: ImmutableManage) {
	return (currentScope = createScope(currentScope, immer))
}

function revokeDraft(draft: Drafted) {
	const state: ImmutableType = draft[DRAFT_STATE]
	if (
		state.type_ === ProxyType.ProxyObject ||
		state.type_ === ProxyType.ProxyArray
	)
		state.revoke_()
	else state.revoked_ = true
}
