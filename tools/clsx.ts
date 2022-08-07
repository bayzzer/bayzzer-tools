export const clsx = (cls?: string) => {
    return cls ? cls
        .replace(/null|undefined|false|true/g, '')
        .replace(/\s+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .join(' ')
        : ''
}