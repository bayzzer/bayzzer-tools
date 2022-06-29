import { IAppState } from "@types"

export const APP_STATE : IAppState = {
    test: {
        value: '--1'
    },
    other: {
        value: '--2'
    },
    list: [],
    pez: () => {console.log('pez')}
}