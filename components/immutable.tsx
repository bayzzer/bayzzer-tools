import {
    ImmutableManage
} from '@bayzzer/tools'
import { z } from 'tools/validation'
//import { object, string } from 'tools/validation'

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

    // const fullNameValidation = (fullName: string) => {
    //     var regexp = /^[a-z]{3,} [a-z]{3,}$/i
    //     const valid = regexp.test(fullName);
    //     return valid
    // }

    const testString = async () => {
        // const t = string().min(4).max(50).test('testt EFF', 'TEXTO ERROR', fullNameValidation).required()
        // var x = await t.validate('test ERR')
        //console.log(x)
        //ObjectSchema<User>
        // const objectSchema = object({
        //     username: string().min(4).max(50).required("*"),
        //     password: string().min(5).required('#')
        // })

        // const obj: User = {
        //     username: 'ertyrty',
        //     password: 'trttrt'
        // }

        // var z = await objectSchema.validate(obj)
        // console.log(z)
        const schema: z.ValidateType<User> = z.object({
            username: z.string().min(2, 'min 5'),
            password: z.string().min(2, 'min 5')
        })

        var user = {
            username: 'us'
        }

        var r = schema.parse(user)
        console.log(r)
    }

    return (
        <>
            <button onClick={testImmutableOperation}>Immutable Operation</button>
            <button onClick={testString}>Test string</button>
        </>
    )
}