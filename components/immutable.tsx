import {
    ImmutableManage
} from '@bayzzer/tools'
import { validate } from 'tools/validation'
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
        const schema: validate.SchemaOf<User> = validate.object({
            username: validate.string().min(2),
            password: validate.string().min(2).max(4, 'max 4'),
            key: validate.object({
                values: validate.string().array().min(2)
            })
        })

        var user: User = {
            username: 'us',
            password: '***7',
            key: {
                values: ['rtr','trt']
            }
        }

        var r = schema.parse(user)
        console.log(r)

        // var a = validate.string()
        // validate.number()
        // validate.bigint()
        // validate.boolean()
        // validate.date()

        // // empty types
        // validate.undefined()
        // validate.null()
        // validate.void() // accepts undefined

        // // catch-all types
        // // allows any value
        // validate.any()
        // validate.unknown()

        // // never type
        // // allows no values
        // validate.never()

        // const tuna = validate.literal("tuna")
        // // retrieve literal value
        // tuna.value; // "tuna"

        // type UserType = validate.infer<typeof schema>

        // validate.string().max(5);
        // validate.string().min(5);
        // validate.string().length(5);
        // validate.string().email();
        // validate.string().url();
        // validate.string().uuid();
        // validate.string().cuid();
        // validate.string().regex(/$[0-6]/)
        // validate.string().startsWith('wewe')
        // validate.string().endsWith('err');

        // // trim whitespace
        // validate.string().trim();

        // // deprecated, equivalent to .min(1)
        // validate.string().nonempty();

        // // optional custom error message
        // validate.string().nonempty({ message: "Can't be empty" });

        // const name = validate.string({
        //     required_error: "Name is required",
        //     invalid_type_error: "Name must be a string",
        // })

        // validate.string().min(5, { message: "Must be 5 or more characters long" });

        // validate.number().gt(5);
        // validate.number().gte(5); // alias .min(5)
        // validate.number().lt(5);
        // validate.number().lte(5); // alias .max(5)

        // validate.number().int(); // value must be an integer

        // validate.number().positive(); //     > 0
        // validate.number().nonnegative(); //  >= 0
        // validate.number().negative(); //     < 0
        // validate.number().nonpositive(); //  <= 0

        // validate.number().multipleOf(5); // Evenly divisible by 5. Alias .step(5)

        // const dateSchema = validate.preprocess((arg) => {
        //     if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
        // }, validate.date())
        // type DateSchema = validate.infer<typeof dateSchema>;
        // // type DateSchema = Date

        // dateSchema.safeParse(new Date("1/12/22")); // success: true
        // dateSchema.safeParse("2022-01-12T00:00:00.000Z"); // success: true

        // const FishEnum = validate.enum(["Salmon", "Tuna", "Trout"])
        // type FishEnum = validate.infer<typeof FishEnum>;
        // const f = FishEnum.parse('salmon')
        // // 'Salmon' | 'Tuna' | 'Trout'



    }

    return (
        <>
            <button onClick={testImmutableOperation}>Immutable Operation</button>
            <button onClick={testString}>Test string</button>
        </>
    )
}