import { util, ValidatedType } from "./utils/util";

type AllKeys<T> = T extends any ? keyof T : never;

export type FieldErrors<T, U = string> = {
  [P in AllKeys<T>]?: U[];
};

export type FieldError<T> = {
  [P in AllKeys<T>]?: string;
};

export const ErrorCode = util.arrayToEnum([
  "invalid_type",
  "custom",
  "invalid_string",
  "too_small",
  "too_big",
  "required"
]);

type ValidationBase = {
  path: (string | number)[];
  message?: string;
};

interface InvalidTypeError extends ValidationBase {
  code: typeof ErrorCode.invalid_type;
  expected: ValidatedType;
  received: ValidatedType;
}

export type StringValidation =
  | "email"
  | "url"
  | "regex"
  | { startWith: string }
  | { endWith: string };

interface RequiredError extends ValidationBase {
  code: typeof ErrorCode.required
  params?: { [k: string]: any }
}

interface InvalidString extends ValidationBase {
  code: typeof ErrorCode.invalid_string;
  validation: StringValidation;
}

interface TooSmall extends ValidationBase {
  code: typeof ErrorCode.too_small;
  minimum: number;
  inclusive: boolean;
  type: "array" | "string"
}

interface TooBig extends ValidationBase {
  code: typeof ErrorCode.too_big;
  maximum: number;
  inclusive: boolean;
  type: "array" | "string"
}

export interface CustomValidation extends ValidationBase {
  code: typeof ErrorCode.custom;
  params?: { [k: string]: any };
}

type ErrorType =
  | InvalidTypeError
  | InvalidString
  | TooSmall
  | TooBig
  | RequiredError
  | CustomValidation;

export type ValidationError = ErrorType & { message: string };


export class Validation<T = any> extends Error {
  errors: ValidationError[] = []

  constructor(errors: ValidationError[]) {
    super();

    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      // eslint-disable-next-line ban/ban
      Object.setPrototypeOf(this, actualProto);
    } else {
      (this as any).__proto__ = actualProto;
    }
    this.name = "Validation";
    this.errors = errors;
  }

  static create = (errors: ValidationError[]) => {
    const error = new Validation(errors);
    return error;
  };

  addError = (sub: ValidationError) => {
    this.errors = [...this.errors, sub];
  };

  addErrors = (subs: ValidationError[] = []) => {
    this.errors = [...this.errors, ...subs];
  };

  getFieldErrors(): FieldErrors<T>;
  getFieldErrors<U>(mapper?: (error: ValidationError) => U): FieldErrors<T, U>;
  getFieldErrors<U = string>(
    mapper: (error: ValidationError) => U = (error: ValidationError) => error.message as any
  ): any {
    const fieldErrors: any = {}
    for (const sub of this.errors) {
      if (sub.path.length > 0) {
        fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
        fieldErrors[sub.path[0]].push(mapper(sub));
      }
    }
    return fieldErrors
  }

  getFieldError<K extends keyof T>(fields?: K[]): FieldError<T> {
    let errors = this.errors
    if (fields && fields.length > 0) {
      errors = this.errors.filter(r => fields.includes(r.path[0] as any))
    }

    let fieldErrors: any = {}
    for (const sub of errors) {
      if (sub.path.length > 0) {
        if (!fieldErrors[sub.path[0]]) {
          fieldErrors[sub.path[0]] = sub.message
        }
      }
    }
    return fieldErrors
  }
}

type StripPath<T extends object> = T extends any
  ? util.OmitKeys<T, "path">
  : never;

export type ErrorData = StripPath<ErrorType> & {
  path?: (string | number)[];
  fatal?: boolean;
};

type ErrorMapCtx = {
  defaultError: string;
  data: any;
};

export type ErrorMap = (
  error: ErrorType,
  _ctx: ErrorMapCtx
) => { message: string };
