export namespace util {

  export function assertNever(_x: never): never {
    throw new Error();
  }

  export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
  export type OmitKeys<T, K extends string> = Pick<T, Exclude<keyof T, K>>

  export const arrayToEnum = <T extends string, U extends [T, ...T[]]>(
    items: U
  ): { [k in U[number]]: k } => {
    const obj: any = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj as any;
  }

  export const objectKeys: ObjectConstructor["keys"] =
    typeof Object.keys === "function" // eslint-disable-line ban/ban
      ? (obj: any) => Object.keys(obj) // eslint-disable-line ban/ban
      : (object: any) => {
        const keys = [];
        for (const key in object) {
          if (Object.prototype.hasOwnProperty.call(object, key)) {
            keys.push(key);
          }
        }
        return keys;
      }  
}

export const ValidationEnum = util.arrayToEnum([
  "string",
  "array",
  "object",
  "unknown"
]);

export type ValidationType = keyof typeof ValidationEnum

export const getValidationType = (data: any): ValidationType => {
  const t = typeof data

  switch (t) {
    case "string":
      return ValidationEnum.string

    case "object":
      if (Array.isArray(data)) {
        return ValidationEnum.array
      }
      return ValidationEnum.object

    default:
      return ValidationEnum.unknown
  }
};
