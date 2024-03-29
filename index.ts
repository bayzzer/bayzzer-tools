import { ImmutableManage } from '@bayzzer/tools'
export * from './commons/types'
export * from './tools/immutable/types'
export {
    freeze,
    mergeDeep,
    isObject,
    parseJSON,
    clsx
} from '@bayzzer/tools'

const immutable = new ImmutableManage().create

export {
    ImmutableManage,
    immutable
}

export * from './tools/validation'