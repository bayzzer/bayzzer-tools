import { util, ZodParsedType } from "./helpers/util";
import { SchemaOf, TypeOf } from "./types";

type AllKeys<T> = T extends any ? keyof T : never;

export type InferFlattenedErrors<
  T extends SchemaOf<any, any, any>,
  U = string
> = ToFlattenedError<TypeOf<T>, U>

export type ToFlattenedError<T, U = string> = {
  formErrors: U[]
  fieldErrors: {
    [P in AllKeys<T>]?: U[]
  }
}

export const ErrorCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
]);

export type ErrorCode = keyof typeof ErrorCode

export type ErrorBase = {
  path: (string | number)[]
  message?: string
}

export interface InvalidType extends ErrorBase {
  code: typeof ErrorCode.invalid_type;
  expected: ZodParsedType;
  received: ZodParsedType;
}

export interface InvalidLiteral extends ErrorBase {
  code: typeof ErrorCode.invalid_literal;
  expected: unknown;
}

export interface UnrecognizedKeys extends ErrorBase {
  code: typeof ErrorCode.unrecognized_keys;
  keys: string[];
}

export interface InvalidUnion extends ErrorBase {
  code: typeof ErrorCode.invalid_union;
  unionErrors: ValidateError[];
}


export interface InvalidEnum extends ErrorBase {
  received: string | number;
  code: typeof ErrorCode.invalid_enum_value;
  options: (string | number)[]
}

export interface InvalidArguments extends ErrorBase {
  code: typeof ErrorCode.invalid_arguments;
  argumentsError: ValidateError;
}

export interface InvalidReturnType extends ErrorBase {
  code: typeof ErrorCode.invalid_return_type;
  returnTypeError: ValidateError;
}

export interface InvalidDate extends ErrorBase {
  code: typeof ErrorCode.invalid_date;
}

export type StringValidation =
  | "email"
  | "url"
  | "uuid"
  | "regex"
  | "cuid"
  | { startsWith: string }
  | { endsWith: string }

export interface InvalidString extends ErrorBase {
  code: typeof ErrorCode.invalid_string;
  validation: StringValidation;
}

export interface InvalidTooSmall extends ErrorBase {
  code: typeof ErrorCode.too_small;
  minimum: number;
  inclusive: boolean;
  type: "array" | "string" | "number" | "set" | "date"
}

export interface InvalidTooBig extends ErrorBase {
  code: typeof ErrorCode.too_big
  maximum: number
  inclusive: boolean
  type: "array" | "string" | "number" | "set" | "date"
}

export interface InvalidIntersectionTypes extends ErrorBase {
  code: typeof ErrorCode.invalid_intersection_types;
}

export interface NotMultipleOf extends ErrorBase {
  code: typeof ErrorCode.not_multiple_of;
  multipleOf: number;
}

export interface CustomError extends ErrorBase {
  code: typeof ErrorCode.custom;
  params?: { [k: string]: any }
}

export type DenormalizedError = { [k: string]: DenormalizedError | string[] }

export type InvalidOptionalMessage =
  | InvalidType
  | InvalidLiteral
  | UnrecognizedKeys
  | InvalidUnion
  | InvalidEnum
  | InvalidArguments
  | InvalidReturnType
  | InvalidDate
  | InvalidString
  | InvalidTooSmall
  | InvalidTooBig
  | InvalidIntersectionTypes
  | NotMultipleOf
  | CustomError;

export type Issue = InvalidOptionalMessage & { message: string }

export const quotelessJson = (obj: any) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:")
}

export type FormattedError<T, U = string> = {
  _errors: U[]
} & (T extends [any, ...any[]]
  ? { [K in keyof T]?: FormattedError<T[K]> }
  : T extends any[]
  ? { [k: number]: FormattedError<T[number]> }
  : T extends object
  ? { [K in keyof T]?: FormattedError<T[K]> }
  : unknown)

export type InferFormattedError<
  T extends SchemaOf<any, any, any>,
  U = string
> = FormattedError<TypeOf<T>, U>

export class ValidateError<T = any> extends Error {
  issues: Issue[] = []

  get errors() {
    return this.issues
  }

  constructor(issues: Issue[]) {
    super();

    const actualProto = new.target.prototype
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto)
    } else {
      (this as any).__proto__ = actualProto
    }
    this.name = "ValidateError"
    this.issues = issues
  }

  format(): FormattedError<T>;
  format<U>(mapper: (issue: Issue) => U): FormattedError<T, U>;
  format(_mapper?: any) {
    const mapper: (issue: Issue) => any =
      _mapper ||
      function (issue: Issue) {
        return issue.message;
      };
    const fieldErrors: FormattedError<T> = { _errors: [] } as any;
    const processError = (error: ValidateError) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError)
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError)
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError)
        } else if (issue.path.length === 0) {
          (fieldErrors as any)._errors.push(mapper(issue));
        } else {
          let curr: any = fieldErrors
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;

            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] }
            } else {
              curr[el] = curr[el] || { _errors: [] }
              curr[el]._errors.push(mapper(issue))
            }

            curr = curr[el]
            i++
          }
        }
      }
    }

    processError(this)
    return fieldErrors
  }

  static create = (issues: Issue[]) => {
    const error = new ValidateError(issues)
    return error
  }

  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2)
  }

  get isEmpty(): boolean {
    return this.issues.length === 0
  }

  addIssue = (sub: Issue) => {
    this.issues = [...this.issues, sub]
  }

  addIssues = (subs: Issue[] = []) => {
    this.issues = [...this.issues, ...subs]
  }

  flatten(): ToFlattenedError<T>
  flatten<U>(mapper?: (issue: Issue) => U): ToFlattenedError<T, U>
  flatten<U = string>(
    mapper: (issue: Issue) => U = (issue: Issue) => issue.message as any
  ): any {
    const fieldErrors: any = {}
    const formErrors: U[] = []
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
        fieldErrors[sub.path[0]].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub))
      }
    }
    return { formErrors, fieldErrors }
  }

  get formErrors() {
    return this.flatten()
  }
}

type stripPath<T extends object> = T extends any
  ? util.OmitKeys<T, "path">
  : never

export type ErrorData = stripPath<InvalidOptionalMessage> & {
  path?: (string | number)[]
  fatal?: boolean
}

export type MakeErrorData = ErrorData

export type ErrorMapCtx = {
  defaultError: string;
  data: any;
};

export type ErrorMap = (
  issue: InvalidOptionalMessage,
  _ctx: ErrorMapCtx
) => { message: string }
