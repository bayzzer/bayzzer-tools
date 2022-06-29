import {AppContextProvider} from '@context'

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  }
}

export const decorators = [
  (Story) => (
      <AppContextProvider>
          <Story />
      </AppContextProvider>
  ),
];