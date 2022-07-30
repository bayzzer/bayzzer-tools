import {
    ImmutableManage
} from '@bayzzer/tools'

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
   

    

    

     

    return (
        <>                      
            <button onClick={testImmutableOperation}>Immutable Operation</button>
        </>
    )
}