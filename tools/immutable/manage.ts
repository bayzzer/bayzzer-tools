import { 
	enterScope,
	createDraft,
	processScope
} from '@bayzzer/tools'

export class ManageState {

	produce = <T>(state: T, dispatch: any) => {
				
		const scope = enterScope(this)
		const draft = createDraft(state)	
		dispatch(draft)
		return processScope<T>(scope)		
	}
}