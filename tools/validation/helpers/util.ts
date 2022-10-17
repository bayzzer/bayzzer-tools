export namespace util {
 
  export function assertNever(_x: never): never {
    throw new Error();
  }

  export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
  export type OmitKeys<T, K extends string> = Pick<T, Exclude<keyof T, K>>;
  export type MakePartial<T, K extends keyof T> = Omit<T, K> &
    Partial<Pick<T, K>>;

  export const arrayToEnum = <T extends string, U extends [T, ...T[]]>(
    items: U
  ): { [k in U[number]]: k } => {
    const obj: any = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj as any;
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
        } 

  export function joinValues<T extends any[]>(
    array: T,
    separator = " | "
  ): string {
    return array
      .map((val) => (typeof val === "string" ? `'${val}'` : val))
      .join(separator);
  }

  export const jsonStringifyReplacer = (_: string, value: any): any => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
}

export const ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set",
]);

export type ZodParsedType = keyof typeof ZodParsedType;

export const getParsedType = (data: any): ZodParsedType => {
  const t = typeof data;

  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;

    case "string":
      return ZodParsedType.string;

    case "number":
      return isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;

    case "boolean":
      return ZodParsedType.boolean;

    case "function":
      return ZodParsedType.function;

    case "bigint":
      return ZodParsedType.bigint;

    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (
        data.then &&
        typeof data.then === "function" &&
        data.catch &&
        typeof data.catch === "function"
      ) {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;

    default:
      return ZodParsedType.unknown;
  }
};
