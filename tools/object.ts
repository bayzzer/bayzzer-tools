export const isObject = <T>(item: T) => {
    return (item && typeof item === 'object' && !Array.isArray(item))
}
