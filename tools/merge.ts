import {isObject} from '@bayzzer/tools'

export const mergeDeep = <T>(target: T, ...sources: any): T => {
    if (!sources.length) return target
    const source = sources.shift()
    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                // @ts-ignore
                if (!target[key]) Object.assign(target, {
                    [key]: {}
                })
                // @ts-ignore
                mergeDeep(target[key], source[key]);
            } else {
                // @ts-ignore
                Object.assign(target, {
                    [key]: source[key]
                })
            }
        }
    }
    return mergeDeep(target, ...sources)
}