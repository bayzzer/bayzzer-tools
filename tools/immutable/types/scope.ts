import { 
    ImmutableManage,
    Patch, 
    PatchListener 
} from "@bayzzer/tools"

export interface ImmutableScope {
	patches_?: Patch[]
	inversePatches_?: Patch[]
	canAutoFreeze_: boolean
	drafts_: any[]
	parent_?: ImmutableScope
	patchListener_?: PatchListener
	immutable_: ImmutableManage
	unfinalizedDrafts_: number
}