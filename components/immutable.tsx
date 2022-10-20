import {
    ImmutableManage
} from '@bayzzer/tools'

import {
    object,
    SchemaOf,
    string
} from 'tools/validation'

export const Immutable = () => {
    interface State {
        layout: {
            theme: {
                current: string,
                list: string[]
            }
        },
        test: {
            value: string
        },
        other: {
            value: string
        },
        list: string[],
        pez: () => void
    }
    
    type User = {
        username: string
        password: string
        key: {
            values: string[]
        }
    }

    const _base: State = {
        layout: {
            theme: {
                current: "light",
                list: ["light", "dark"]
            }
        },
        test: {
            value: '--1'
        },
        other: {
            value: '--2'
        },
        list: [],
        pez: () => { console.log('pez') }
    }
    const immutable = new ImmutableManage().create

    const testImmutableOperation = () => {
        const newStateImmutable = immutable(_base, draft => {
            draft.list.push('test')
            draft.other.value = 'new test value'
        })
        //This operation is immutable
        //@ts-ignore
        newStateImmutable.pez = () => { console.log('pez new state') }
    }

    const testString = async () => {
        const schema: SchemaOf<User> = object({
            username: string().add((val) => val.length > 2, {
                message: "String can be more than 2 characters",
            }).convert(val => val.toUpperCase()),
            password: string().min(2).max(4, 'max 4').regex(/^[A-Z]*$/),
            key: object({
                values: string().array().max(2)
            })
        })

        var user: User = {
            username: 'u4',
            password: 'PA-SW',
            key: {
                values: ['rtr', 'trt', 'trt']
            }
        }

        var r = await schema.validate(user)
        console.log(r)
    }

    return (
        <>
            <button onClick={testImmutableOperation}>Immutable Operation</button>
            <button onClick={testString}>Test string</button>
        </>
    )
}