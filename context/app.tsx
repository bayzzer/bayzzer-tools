import { APP_STATE, produce } from '@context'
import { IAppContext, IContextProvider } from '@types'
import { useReducer, createContext, useCallback, useContext, FC } from 'react'

const AppContext = createContext<IAppContext>({
    state: APP_STATE,
    dispatch: () => null
})

export const useAppContext = () => useContext(AppContext)

export const AppContextProvider: FC<IContextProvider> = ({
    children
}) => {        

    const [state, dispatchState] = useReducer(produce, APP_STATE)
    const dispatch = useCallback(dispatchState, [])

    return (
        <AppContext.Provider value={{ dispatch, state }}>
            {
                children
            }
        </AppContext.Provider>
    )
}
