import { 
	enableES5, 
	enableMapSet, 
	enablePatches
} from "@bayzzer/tools"


export function enableAllPlugins() {
	enableES5()
	enableMapSet()
	enablePatches()
}
