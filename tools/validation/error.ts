import { util, ZodParsedType } from "./helpers/util"

export const ErrorCode = util.arrayToEnum([
  "invalid_type",
  "custom",
  "invalid_string",
  "too_small",
  "too_big"
])

export type ErrorBase = {
  path: (string | number)[]
  message?: string
}

export interface InvalidType extends ErrorBase {
  code: typeof ErrorCode.invalid_type;
  expected: ZodParsedType;
  received: ZodParsedType;
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
  type: "array" | "string"
}

export interface InvalidTooBig extends ErrorBase {
  code: typeof ErrorCode.too_big
  maximum: number
  inclusive: boolean
  type: "array" | "string"
}

export interface CustomError extends ErrorBase {
  code: typeof ErrorCode.custom;
  params?: { [k: string]: any }
}

export type InvalidOptionalMessage =
  | InvalidType
  | InvalidString
  | InvalidTooSmall
  | InvalidTooBig
  | CustomError;

export type Issue = InvalidOptionalMessage & { message: string }
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

  static create = (issues: Issue[]) => {
    const error = new ValidateError(issues)
    return error
  }

  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2)
  } 

  addIssue = (sub: Issue) => {
    this.issues = [...this.issues, sub]
  }

  addIssues = (subs: Issue[] = []) => {
    this.issues = [...this.issues, ...subs]
  }
}

type stripPath<T extends object> = T extends any
  ? util.OmitKeys<T, "path">
  : never

export type ErrorData = stripPath<InvalidOptionalMessage> & {
  path?: (string | number)[]
  fatal?: boolean
}

export type ErrorMapCtx = {
  defaultError: string;
  data: any;
};

export type ErrorMap = (
  issue: InvalidOptionalMessage,
  _ctx: ErrorMapCtx
) => { message: string }
