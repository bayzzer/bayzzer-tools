export const parseJSON = <T>(value: string | null): T | undefined => {
    try {
      return value === 'undefined' ? undefined : JSON.parse(value ?? '')
    } catch {
      console.warn('Parsing error on', { value })
      return undefined
    }
  }