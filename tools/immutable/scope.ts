import { 
	ImmutableManage
} from '@bayzzer/tools'
import { ImmutableScope } from '@types'

let currentScope: ImmutableScope | undefined

export function getCurrentScope() {
	return currentScope!
}

function createScope(
	manage: ImmutableManage
): ImmutableScope {
	return {
		drafts: [],
		manage: manage
	}
}

export function enterScope(manage: ImmutableManage) {
	return (currentScope = createScope(manage))
}
