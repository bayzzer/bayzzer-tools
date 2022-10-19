import { errorUtil } from "./helpers/errorUtil";
import { addIssueToContext, INVALID, ValidationContext, ValidationInput, ParseReturnType, ParseStatus } from "./helpers/parseUtil";
import { util, ParsedType } from "./helpers/util";
import { processCreateParams, RawCreateParams, SchemaOf, ValidationKind, ValidationTypeDef } from "./schema";
import { ErrorCode } from "./error"

type StringCheck =
  | { kind: "min"; value: number; message?: string }
  | { kind: "max"; value: number; message?: string }
  | { kind: "email"; message?: string }
  | { kind: "url"; message?: string }
  | { kind: "startWith"; value: string; message?: string }
  | { kind: "endWith"; value: string; message?: string }
  | { kind: "regex"; regex: RegExp; message?: string }
  | { kind: "trim"; message?: string }
export interface StringDef extends ValidationTypeDef {
  checks: StringCheck[]
  name: ValidationKind.String
}

const emailRegex = /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

export class ValidationString extends SchemaOf<string, StringDef> {
  _validation(input: ValidationInput): ParseReturnType<string> {
    const parsedType = this._getType(input);

    if (parsedType !== ParsedType.string) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(
        ctx,
        {
          code: ErrorCode.invalid_type,
          expected: ParsedType.string,
          received: ctx.parsedType,
        }
      );
      return INVALID
    }

    const status = new ParseStatus();
    let ctx: undefined | ValidationContext = undefined

    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ErrorCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      }else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ErrorCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ErrorCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "startWith") {
        if (!(input.data as string).startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.invalid_string,
            validation: { startWith: check.value },
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "endWith") {
        if (!(input.data as string).endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.invalid_string,
            validation: { endWith: check.value },
            message: check.message,
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }

    return { status: status.value, value: input.data };
  }  

  _addCheck(check: StringCheck) {
    return new ValidationString({
      ...this._def,
      checks: [...this._def.checks, check],
    });
  }

  email(message?: errorUtil.ErrMessage) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message?: errorUtil.ErrMessage) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  regex(regex: RegExp, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "regex",
      regex: regex,
      ...errorUtil.errToObj(message),
    });
  }

  startWith(value: string, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "startWith",
      value: value,
      ...errorUtil.errToObj(message),
    });
  }

  endWith(value: string, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "endWith",
      value: value,
      ...errorUtil.errToObj(message),
    });
  }

  min(minLength: number, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message),
    });
  }

  max(maxLength: number, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message),
    });
  }

  length(len: number, message?: errorUtil.ErrMessage) {
    return this.min(len, message).max(len, message);
  }

  trim = () => new ValidationString({
    ...this._def,
    checks: [...this._def.checks, { kind: "trim" }],
  })

  static create = (params?: RawCreateParams): ValidationString => {
    return new ValidationString({
      checks: [],
      name: ValidationKind.String,
      ...processCreateParams(params),
    })
  }
}