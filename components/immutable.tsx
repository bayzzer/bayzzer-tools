import {
    ImmutableManage,
    useImmutableReducer,
    useImmutableState
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

    const [state, dispatch] = useImmutableReducer(immutable, _base)

    const testImmutableOperation = () => {
        const newStateImmutable = immutable(_base, draft => {
            draft.list.push('test')
            draft.other.value = 'new test value'
        })
        //This operation is immutable
        //@ts-ignore
        newStateImmutable.pez = () => { console.log('pez new state') }
    }
    const [todos, setTodos] = useImmutableState(_base)

    const testImmutableFromUseState = () => {
        //Immutable operation
        //@ts-ignore
        todos.list.push('test state immutable')
    }

    const mutableUseState = () => {
        //Mutable operation
        setTodos(draft => {
            draft.test.value = `${Math.random()}`
        })
    }

    const immutableUseReducer = () => {
        //Immutable operation
        //@ts-ignore
        state.test.value = `value ${Math.random()}`
    }

    const mutableUseReducer = () => {
        dispatch((draft) => {
            draft.layout.theme.current = `theme ${Math.random()}`
            //draft.layout.theme.list.push(`${Math.random()}`)
            draft.test.value = `${Math.random()}`
            draft.pez = () => { console.log('pez update', Math.random()) }
            draft.list.push('new item')
        })
    }

    return (
        <>
            <span>From useReducer</span>
            <div style={{ display: 'grid' }}>
                <button onClick={immutableUseReducer}>Immutable useReducer</button>
                <button onClick={mutableUseReducer}>Mutable useReducer</button>
            </div>
            <pre style={{ color: '#ce7ad3' }}>
                <code>{JSON.stringify(state, null, 2)}</code>
            </pre>

            <span>From useState</span>
            <div style={{ display: 'grid' }}>
                <button onClick={testImmutableFromUseState}>Immutable useState</button>
                <button onClick={mutableUseState}>Mutable useState</button>
            </div>
            <pre style={{ color: '#ce7ad3' }}>
                <code>{JSON.stringify(todos, null, 2)}</code>
            </pre>
            <button onClick={testImmutableOperation}>Immutable Operation</button>
        </>
    )
}