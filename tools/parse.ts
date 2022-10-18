export const parseJSON = <T>(value: string | null): T | undefined => {
    try {
      return value === 'undefined' ? undefined : JSON.parse(value ?? '')
    } catch {
      console.warn('Parsing error on', { value })
      return undefined
    }
  }

  export const quotelessJSON = (obj: any) => {
    const json = JSON.stringify(obj, null, 2);
    return json.replace(/"([^"]+)":/g, "$1:")
  }