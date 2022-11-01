import { errorUtil } from "./utils/error_util";
import { addError, ValidationContext, ValidateInput, ValidationResult, ValidationStatus } from "./utils/validation_util";
import { util } from "./utils/util";
import { SchemaKind, SchemaOf, SchemaTypeDef } from "./schema";
import { StringValidation, ErrorCode } from "./validation_error";

type StringCheck =
    | { kind: "required"; message?: string }
    | { kind: "min"; value: number; message?: string }
    | { kind: "max"; value: number; message?: string }
    | { kind: "email"; message?: string }
    | { kind: "url"; message?: string }
    | { kind: "startWith"; value: string; message?: string }
    | { kind: "endWith"; value: string; message?: string }
    | { kind: "regex"; regex: RegExp; message?: string }
    | { kind: "trim"; message?: string };

interface StringDef extends SchemaTypeDef {
    checks: StringCheck[]
    type: SchemaKind.String
}

const emailRegex =
    /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

export class String extends SchemaOf<string, StringDef> {
    _validation(input: ValidateInput): ValidationResult<string> {
        if (input.data === undefined || input.data == null) {
            input.data = ''
        }

        const status = new ValidationStatus();
        let ctx: undefined | ValidationContext = undefined

        for (const check of this._def.checks) {
            switch (check.kind) {
                case 'min':
                    if (input.data.length < check.value) {
                        ctx = this._getOrReturnCtx(input, ctx);
                        addError(ctx, {
                            code: ErrorCode.too_small,
                            minimum: check.value,
                            type: "string",
                            inclusive: true,
                            message: check.message,
                        });
                        status.dirty();
                    }
                    break
                case 'max':
                    if (input.data.length > check.value) {
                        ctx = this._getOrReturnCtx(input, ctx);
                        addError(ctx, {
                            code: ErrorCode.too_big,
                            maximum: check.value,
                            type: "string",
                            inclusive: true,
                            message: check.message,
                        });
                        status.dirty();
                    }
                    break
                case 'required':
                    if (input.data.length == 0) {
                        ctx = this._getOrReturnCtx(input, ctx)
                        addError(ctx, {
                            code: ErrorCode.required,
                            message: check.message,
                        })
                        status.dirty()
                    }
                    break
                case 'email':
                    if (!emailRegex.test(input.data)) {
                        ctx = this._getOrReturnCtx(input, ctx);
                        addError(ctx, {
                            validation: "email",
                            code: ErrorCode.invalid_string,
                            message: check.message,
                        });
                        status.dirty();
                    }
                    break
                case 'url':
                    try {
                        new URL(input.data);
                    } catch {
                        ctx = this._getOrReturnCtx(input, ctx);
                        addError(ctx, {
                            validation: "url",
                            code: ErrorCode.invalid_string,
                            message: check.message,
                        });
                        status.dirty();
                    }
                    break
                case 'regex':
                    check.regex.lastIndex = 0;
                    const testResult = check.regex.test(input.data);
                    if (!testResult) {
                        ctx = this._getOrReturnCtx(input, ctx);
                        addError(ctx, {
                            validation: "regex",
                            code: ErrorCode.invalid_string,
                            message: check.message,
                        });
                        status.dirty();
                    }
                    break
                case 'trim':
                    input.data = input.data.trim();
                    break
                case 'startWith':
                    if (!(input.data as string).startsWith(check.value)) {
                        ctx = this._getOrReturnCtx(input, ctx);
                        addError(ctx, {
                            code: ErrorCode.invalid_string,
                            validation: { startWith: check.value },
                            message: check.message,
                        });
                        status.dirty();
                    }
                    break
                case 'endWith':
                    if (!(input.data as string).endsWith(check.value)) {
                        ctx = this._getOrReturnCtx(input, ctx);
                        addError(ctx, {
                            code: ErrorCode.invalid_string,
                            validation: { endWith: check.value },
                            message: check.message,
                        });
                        status.dirty();
                    }
                    break
                default:
                    util.assertNever(check)
                    break
            }
        }

        return { status: status.value, value: input.data };
    }

    protected _regex = (
        regex: RegExp,
        validation: StringValidation,
        message?: errorUtil.ErrorMessage
    ) =>
        this.refinement((data) => regex.test(data), {
            validation,
            code: ErrorCode.invalid_string,
            ...errorUtil.errToObj(message),
        });

    _addCheck(check: StringCheck) {
        return new String({
            ...this._def,
            checks: [...this._def.checks, check],
        });
    }

    required(message?: errorUtil.ErrorMessage) {
        return this._addCheck({ kind: "required", ...errorUtil.errToObj(message) });
    }

    email(message?: errorUtil.ErrorMessage) {
        return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
    }
    url(message?: errorUtil.ErrorMessage) {
        return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
    }
    regex(regex: RegExp, message?: errorUtil.ErrorMessage) {
        return this._addCheck({
            kind: "regex",
            regex: regex,
            ...errorUtil.errToObj(message),
        });
    }

    startWith(value: string, message?: errorUtil.ErrorMessage) {
        return this._addCheck({
            kind: "startWith",
            value: value,
            ...errorUtil.errToObj(message),
        });
    }

    endWith(value: string, message?: errorUtil.ErrorMessage) {
        return this._addCheck({
            kind: "endWith",
            value: value,
            ...errorUtil.errToObj(message),
        });
    }

    min(minLength: number, message?: errorUtil.ErrorMessage) {
        return this._addCheck({
            kind: "min",
            value: minLength,
            ...errorUtil.errToObj(message),
        });
    }

    max(maxLength: number, message?: errorUtil.ErrorMessage) {
        return this._addCheck({
            kind: "max",
            value: maxLength,
            ...errorUtil.errToObj(message),
        });
    }

    length(len: number, message?: errorUtil.ErrorMessage) {
        return this.min(len, message).max(len, message);
    }

    trim = () =>
        new String({
            ...this._def,
            checks: [...this._def.checks, { kind: "trim" }],
        })

    static create = (): String => {
        return new String({
            checks: [],
            type: SchemaKind.String
        });
    };
}