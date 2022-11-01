export namespace util {
 
  export function assertNever(_x: never): never {
    throw new Error();
  }

  export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
  export type OmitKeys<T, K extends string> = Pick<T, Exclude<keyof T, K>>;  

  export const arrayToEnum = <T extends string, U extends [T, ...T[]]>(
    items: U
  ): { [k in U[number]]: k } => {
    const obj: any = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj as any;
  };

  export const objectValues = (obj: any) => {
    return objectKeys(obj).map(function (e) {
      return obj[e];
    });
  };

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
      };

  export const jsonStringifyReplacer = (_: string, value: any): any => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
}

export const ValidatedType = util.arrayToEnum([
  "string",
  "array",
  "object",
  "unknown",
]);

export type ValidatedType = keyof typeof ValidatedType;

export const getValidatedType = (data: any): ValidatedType => {
  const t = typeof data;

  switch (t) {

    case "string":
      return ValidatedType.string;

    case "object":
      if (Array.isArray(data)) {
        return ValidatedType.array;
      }
      return ValidatedType.object;

    default:
      return ValidatedType.unknown;
  }
};
