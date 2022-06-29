import { 
	enterScope,
	createDraft,
	processScope
} from '@bayzzer/tools'

export class ImmutableManage {

	produce = <T>(state: T, dispatch: any) => {
				
		const scope = enterScope(this)
		const draft = createDraft(state)	
		console.log(state)	
		dispatch(draft)
		return processScope<T>(scope)		
	}
}