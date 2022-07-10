import { 
	ManageState
} from '@bayzzer/tools'
import { ImmutableScope } from '@types'

let currentScope: ImmutableScope | undefined

export function getCurrentScope() {
	return currentScope!
}

function createScope(
	manage: ManageState
): ImmutableScope {
	return {
		drafts: [],
		manage: manage
	}
}

export function enterScope(manage: ManageState) {
	return (currentScope = createScope(manage))
}
