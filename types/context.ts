import { Immutable } from 'index'
import { Dispatch } from 'react'

export interface IContextProvider{
    children?: React.ReactNode
}

export interface IAppState{
    test: {
        value: string
    }
    other: {
        value: string
    }
    list: Array<Person>
    pez: () => void
}

interface Person {
    name: string
    age: number
}

export interface IAppContext{
    state: Immutable<IAppState>
    dispatch: Dispatch<(draft: IAppState) => void>
}