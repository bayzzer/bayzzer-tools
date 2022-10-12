import { defaultErrorMap, getErrorMap } from "./errors";
import { enumUtil } from "./helpers/enumUtil";
import { errorUtil } from "./helpers/errorUtil";
import {
  addIssueToContext,
  AsyncParseReturnType,
  DIRTY,
  INVALID,
  isAborted,
  isAsync,
  isDirty,
  isValid,
  makeIssue,
  OK,
  ParseContext,
  ParseInput,
  ParseParams,
  ParsePath,
  ParseReturnType,
  ParseStatus,
  SyncParseReturnType,
} from "./helpers/parseUtil";
import { partialUtil } from "./helpers/partialUtil";
import { Primitive } from "./helpers/typeAliases";
import { getParsedType, util, ZodParsedType } from "./helpers/util";
import {
  ErrorData,
  StringValidation,
  CustomError,
  ValidateError,
  ErrorMap,
  Issue,
  ErrorCode,
} from "./ZodError";

export type RefinementCtx = {
  addIssue: (arg: ErrorData) => void
  path: (string | number)[]
}

export type RawShape = { [k: string]: ValidateAnyType }
export type ValidateAnyType = SchemaOf<any, any, any>
export type TypeOf<T extends SchemaOf<any, any, any>> = T["_output"]
export type Input<T extends SchemaOf<any, any, any>> = T["_input"]
export type Output<T extends SchemaOf<any, any, any>> = T["_output"]
export type { TypeOf as infer }

export type CustomErrorParams = Partial<util.Omit<CustomError, "code">>
export interface ValidationTypeDef {
  errorMap?: ErrorMap
  description?: string
}

class ValidateInputLazyPath implements ParseInput {
  parent: ParseContext;
  data: any;
  _path: ParsePath;
  _key: string | number | (string | number)[]
  constructor(
    parent: ParseContext,
    value: any,
    path: ParsePath,
    key: string | number | (string | number)[]
  ) {
    this.parent = parent
    this.data = value
    this._path = path
    this._key = key
  }
  get path() {
    return this._path.concat(this._key);
  }
}

const handleResult = <Input, Output>(
  ctx: ParseContext,
  result: SyncParseReturnType<Output>
):
  | { success: true; data: Output }
  | { success: false; error: ValidateError<Input> } => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    var issuesCount = ctx.common.issues.length
    if (!issuesCount) {
      throw new Error(`Validation failed, without errors`)
    }
    const error = new ValidateError(ctx.common.issues)
    return { success: false, error }
  }
}

type RawCreateParams =
  | {
    errorMap?: ErrorMap
    invalid_type_error?: string
    required_error?: string
    description?: string
  }
  | undefined

type ProcessedCreateParams = {
  errorMap?: ErrorMap,
  description?: string
}

function processCreateParams(params: RawCreateParams): ProcessedCreateParams {
  if (!params) return {}

  const { errorMap, invalid_type_error, required_error, description } = params
  if (errorMap && (invalid_type_error || required_error)) {
    throw new Error(
      `Invalid conjunction with custom error map.`
    )
  }

  if (errorMap) return { errorMap: errorMap, description }

  const customMap: ErrorMap = (iss, ctx) => {
    if (iss.code !== "invalid_type") return { message: ctx.defaultError };
    if (typeof ctx.data === "undefined") {
      return { message: required_error ?? ctx.defaultError }
    }
    return { message: invalid_type_error ?? ctx.defaultError }
  };
  return { errorMap: customMap, description }
}

export type SafeParseSuccess<Output> = { success: true; data: Output }
export type SafeParseError<Input> = { success: false; error: ValidateError<Input> }

export type SafeParseReturnType<Input, Output> =
  | SafeParseSuccess<Output>
  | SafeParseError<Input>;

export abstract class SchemaOf<
  Output = any,
  Def extends ValidationTypeDef = ValidationTypeDef,
  Input = Output
> {
  readonly _type!: Output
  readonly _output!: Output
  readonly _input!: Input
  readonly _def!: Def

  get description() {
    return this._def.description
  }

  abstract _parse(input: ParseInput): ParseReturnType<Output>

  _getType(input: ParseInput): string {
    return getParsedType(input.data)
  }

  _getOrReturnCtx(
    input: ParseInput,
    ctx?: ParseContext | undefined
  ): ParseContext {
    return (
      ctx || {
        common: input.parent.common,
        data: input.data,

        parsedType: getParsedType(input.data),

        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent,
      }
    )
  }

  _processInputParams(input: ParseInput): {
    status: ParseStatus
    ctx: ParseContext
  } {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,

        parsedType: getParsedType(input.data),

        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent,
      },
    };
  }

  _parseSync(input: ParseInput): SyncParseReturnType<Output> {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }

  _parseAsync(input: ParseInput): AsyncParseReturnType<Output> {
    const result = this._parse(input);

    return Promise.resolve(result);
  }

  parse(data: unknown, params?: Partial<ParseParams>): Output {
    const result = this.safeParse(data, params);
    if (result.success) return result.data;
    throw result.error;
  }

  safeParse(
    data: unknown,
    params?: Partial<ParseParams>
  ): SafeParseReturnType<Input, Output> {
    const ctx: ParseContext = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap,
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data),
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });

    return handleResult(ctx, result);
  }

  async parseAsync(
    data: unknown,
    params?: Partial<ParseParams>
  ): Promise<Output> {
    const result = await this.safeParseAsync(data, params);
    if (result.success) return result.data;
    throw result.error;
  }

  async safeParseAsync(
    data: unknown,
    params?: Partial<ParseParams>
  ): Promise<SafeParseReturnType<Input, Output>> {
    const ctx: ParseContext = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true,
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data),
    };

    const maybeAsyncResult = this._parse({ data, path: [], parent: ctx });
    const result = await (isAsync(maybeAsyncResult)
      ? maybeAsyncResult
      : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }

  /** Alias of safeParseAsync */
  spa = this.safeParseAsync

  refine<RefinedOutput extends Output>(
    check: (arg: Output) => arg is RefinedOutput,
    message?: string | CustomErrorParams | ((arg: Output) => CustomErrorParams)
  ): ValidationEffects<this, RefinedOutput, Input>;
  refine(
    check: (arg: Output) => unknown | Promise<unknown>,
    message?: string | CustomErrorParams | ((arg: Output) => CustomErrorParams)
  ): ValidationEffects<this, Output, Input>;
  refine(
    check: (arg: Output) => unknown,
    message?: string | CustomErrorParams | ((arg: Output) => CustomErrorParams)
  ): ValidationEffects<this, Output, Input> {
    const getIssueProperties = (val: Output) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () =>
        ctx.addIssue({
          code: ErrorCode.custom,
          ...getIssueProperties(val),
        });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }

  refinement<RefinedOutput extends Output>(
    check: (arg: Output) => arg is RefinedOutput,
    refinementData: ErrorData | ((arg: Output, ctx: RefinementCtx) => ErrorData)
  ): ValidationEffects<this, RefinedOutput, Input>;
  refinement(
    check: (arg: Output) => boolean,
    refinementData: ErrorData | ((arg: Output, ctx: RefinementCtx) => ErrorData)
  ): ValidationEffects<this, Output, Input>;
  refinement(
    check: (arg: Output) => unknown,
    refinementData: ErrorData | ((arg: Output, ctx: RefinementCtx) => ErrorData)
  ): ValidationEffects<this, Output, Input> {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(
          typeof refinementData === "function"
            ? refinementData(val, ctx)
            : refinementData
        );
        return false;
      } else {
        return true;
      }
    });
  }

  _refinement(
    refinement: RefinementEffect<Output>["refinement"]
  ): ValidationEffects<this, Output, Input> {
    return new ValidationEffects({
      schema: this,
      typeName: ValidationFirstKind.Effects,
      effect: { type: "refinement", refinement },
    });
  }
  superRefine = this._refinement;

  constructor(def: Def) {
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.default = this.default.bind(this);
    this.describe = this.describe.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
  }

  optional(): ValidationOptional<this> {
    return ValidationOptional.create(this) as any;
  }
  nullable(): ValidationNullable<this> {
    return ValidationNullable.create(this) as any;
  }
  nullish(): ValidationNullable<ValidationOptional<this>> {
    return this.optional().nullable();
  }
  array(): ValidationArray<this> {
    return ValidationArray.create(this);
  }
  promise(): ValidationPromise<this> {
    return ValidationPromise.create(this);
  }

  or<T extends ValidateAnyType>(option: T): ValidationUnion<[this, T]> {
    return ValidationUnion.create([this, option]) as any;
  }

  and<T extends ValidateAnyType>(incoming: T): ValidationIntersection<this, T> {
    return ValidationIntersection.create(this, incoming);
  }

  transform<NewOut>(
    transform: (arg: Output, ctx: RefinementCtx) => NewOut | Promise<NewOut>
  ): ValidationEffects<this, NewOut> {
    return new ValidationEffects({
      schema: this,
      typeName: ValidationFirstKind.Effects,
      effect: { type: "transform", transform },
    }) as any;
  }

  default(def: util.noUndefined<Input>): ValidationDefault<this>;
  default(def: () => util.noUndefined<Input>): ValidationDefault<this>;
  default(def: any) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;

    return new ValidationDefault({
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ValidationFirstKind.Default,
    }) as any;
  }

  brand<B extends string | number | symbol>(): ValidationBranded<this, B> {
    return new ValidationBranded({
      typeName: ValidationFirstKind.Branded,
      type: this,
      ...processCreateParams(undefined),
    });
  }

  describe(description: string): this {
    const This = (this as any).constructor;
    return new This({
      ...this._def,
      description,
    });
  }

  isOptional(): boolean {
    return this.safeParse(undefined).success;
  }
  isNullable(): boolean {
    return this.safeParse(null).success;
  }
}

type StringCheck =
  | { kind: "min"; value: number; message?: string }
  | { kind: "max"; value: number; message?: string }
  | { kind: "email"; message?: string }
  | { kind: "url"; message?: string }
  | { kind: "uuid"; message?: string }
  | { kind: "cuid"; message?: string }
  | { kind: "startsWith"; value: string; message?: string }
  | { kind: "endsWith"; value: string; message?: string }
  | { kind: "regex"; regex: RegExp; message?: string }
  | { kind: "trim"; message?: string };

export interface StringDef extends ValidationTypeDef {
  checks: StringCheck[];
  typeName: ValidationFirstKind.String;
}

const cuidRegex = /^c[^\s-]{8,}$/i
const uuidRegex =
  /^([a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}|00000000-0000-0000-0000-000000000000)$/i
const emailRegex =
  /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

export class ValidationString extends SchemaOf<string, StringDef> {
  _parse(input: ParseInput): ParseReturnType<string> {
    const parsedType = this._getType(input);

    if (parsedType !== ZodParsedType.string) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(
        ctx,
        {
          code: ErrorCode.invalid_type,
          expected: ZodParsedType.string,
          received: ctx.parsedType,
        }
      );
      return INVALID
    }

    const status = new ParseStatus();
    let ctx: undefined | ParseContext = undefined

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
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx)
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ErrorCode.invalid_string,
            message: check.message,
          })
          status.dirty()
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ErrorCode.invalid_string,
            message: check.message,
          });
          status.dirty()
        }
      } else if (check.kind === "url") {
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
      } else if (check.kind === "startsWith") {
        if (!(input.data as string).startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!(input.data as string).endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.invalid_string,
            validation: { endsWith: check.value },
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

  protected _regex = (
    regex: RegExp,
    validation: StringValidation,
    message?: errorUtil.ErrMessage
  ) =>
    this.refinement((data) => regex.test(data), {
      validation,
      code: ErrorCode.invalid_string,
      ...errorUtil.errToObj(message),
    });

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
  uuid(message?: errorUtil.ErrMessage) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  cuid(message?: errorUtil.ErrMessage) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  regex(regex: RegExp, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "regex",
      regex: regex,
      ...errorUtil.errToObj(message),
    });
  }

  startsWith(value: string, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "startsWith",
      value: value,
      ...errorUtil.errToObj(message),
    });
  }

  endsWith(value: string, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "endsWith",
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

  nonempty = (message?: errorUtil.ErrMessage) =>
    this.min(1, errorUtil.errToObj(message));

  trim = () =>
    new ValidationString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }],
    });

  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }

  get minLength() {
    let min: number | null = null
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min) min = ch.value;
      }
    }
    return min
  }
  get maxLength() {
    let max: number | null = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max) max = ch.value;
      }
    }
    return max
  }

  static create = (params?: RawCreateParams): ValidationString => {
    return new ValidationString({
      checks: [],
      typeName: ValidationFirstKind.String,
      ...processCreateParams(params),
    })
  }
}

/////////////////////////////////////////
/////////////////////////////////////////
//////////                     //////////
//////////      ZodNumber      //////////
//////////                     //////////
/////////////////////////////////////////
/////////////////////////////////////////
type NumberCheck =
  | { kind: "min"; value: number; inclusive: boolean; message?: string }
  | { kind: "max"; value: number; inclusive: boolean; message?: string }
  | { kind: "int"; message?: string }
  | { kind: "multipleOf"; value: number; message?: string };

// https://stackoverflow.com/questions/3966484/why-does-modulus-operator-return-fractional-number-in-javascript/31711034#31711034
function floatSafeRemainder(val: number, step: number) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = parseInt(step.toFixed(decCount).replace(".", ""));
  return (valInt % stepInt) / Math.pow(10, decCount);
}

export interface NumberDef extends ValidationTypeDef {
  checks: NumberCheck[];
  typeName: ValidationFirstKind.Number;
}

export class ValidationNumber extends SchemaOf<number, NumberDef> {
  _parse(input: ParseInput): ParseReturnType<number> {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx.parsedType,
      });
      return INVALID
    }

    let ctx: undefined | ParseContext = undefined
    const status = new ParseStatus();

    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive
          ? input.data < check.value
          : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive
          ? input.data > check.value
          : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.not_multiple_of,
            multipleOf: check.value,
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

  static create = (params?: RawCreateParams): ValidationNumber => {
    return new ValidationNumber({
      checks: [],
      typeName: ValidationFirstKind.Number,
      ...processCreateParams(params),
    });
  };

  gte(value: number, message?: errorUtil.ErrMessage) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  min = this.gte;

  gt(value: number, message?: errorUtil.ErrMessage) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }

  lte(value: number, message?: errorUtil.ErrMessage) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  max = this.lte;

  lt(value: number, message?: errorUtil.ErrMessage) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }

  protected setLimit(
    kind: "min" | "max",
    value: number,
    inclusive: boolean,
    message?: string
  ) {
    return new ValidationNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message),
        },
      ],
    });
  }

  _addCheck(check: NumberCheck) {
    return new ValidationNumber({
      ...this._def,
      checks: [...this._def.checks, check],
    });
  }

  int(message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message),
    });
  }

  positive(message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message),
    });
  }

  negative(message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message),
    });
  }

  nonpositive(message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message),
    });
  }

  nonnegative(message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message),
    });
  }

  multipleOf(value: number, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "multipleOf",
      value: value,
      message: errorUtil.toString(message),
    });
  }

  step = this.multipleOf;

  get minValue() {
    let min: number | null = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min) min = ch.value;
      }
    }
    return min;
  }

  get maxValue() {
    let max: number | null = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max) max = ch.value;
      }
    }
    return max;
  }

  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int");
  }
}

/////////////////////////////////////////
/////////////////////////////////////////
//////////                     //////////
//////////      ZodBigInt      //////////
//////////                     //////////
/////////////////////////////////////////
/////////////////////////////////////////

export interface BigIntDef extends ValidationTypeDef {
  typeName: ValidationFirstKind.BigInt;
}

export class ValidationBigInt extends SchemaOf<bigint, BigIntDef> {
  _parse(input: ParseInput): ParseReturnType<bigint> {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.bigint,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }

  static create = (params?: RawCreateParams): ValidationBigInt => {
    return new ValidationBigInt({
      typeName: ValidationFirstKind.BigInt,
      ...processCreateParams(params),
    });
  };
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////                     ///////////
//////////      ZodBoolean      //////////
//////////                     ///////////
//////////////////////////////////////////
//////////////////////////////////////////
export interface BooleanDef extends ValidationTypeDef {
  typeName: ValidationFirstKind.Boolean;
}

export class ValidationBoolean extends SchemaOf<boolean, BooleanDef> {
  _parse(input: ParseInput): ParseReturnType<boolean> {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }

  static create = (params?: RawCreateParams): ValidationBoolean => {
    return new ValidationBoolean({
      typeName: ValidationFirstKind.Boolean,
      ...processCreateParams(params),
    });
  };
}

///////////////////////////////////////
///////////////////////////////////////
//////////                     ////////
//////////      ZodDate        ////////
//////////                     ////////
///////////////////////////////////////
///////////////////////////////////////
type DateCheck =
  | { kind: "min"; value: number; message?: string }
  | { kind: "max"; value: number; message?: string };
export interface DateDef extends ValidationTypeDef {
  checks: DateCheck[];
  typeName: ValidationFirstKind.Date;
}

export class ValidationDate extends SchemaOf<Date, DateDef> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const parsedType = this._getType(input);

    if (parsedType !== ZodParsedType.date) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    if (isNaN(input.data.getTime())) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_date,
      });
      return INVALID;
    }

    const status = new ParseStatus();
    let ctx: undefined | ParseContext = undefined;

    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.too_small,
            message: check.message,
            inclusive: true,
            minimum: check.value,
            type: "date",
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ErrorCode.too_big,
            message: check.message,
            inclusive: true,
            maximum: check.value,
            type: "date",
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }

    return {
      status: status.value,
      value: new Date((input.data as Date).getTime()),
    };
  }

  _addCheck(check: DateCheck) {
    return new ValidationDate({
      ...this._def,
      checks: [...this._def.checks, check],
    });
  }

  min(minDate: Date, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message),
    });
  }

  max(maxDate: Date, message?: errorUtil.ErrMessage) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message),
    });
  }

  get minDate() {
    let min: number | null = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min) min = ch.value;
      }
    }

    return min != null ? new Date(min) : null;
  }

  get maxDate() {
    let max: number | null = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max) max = ch.value;
      }
    }

    return max != null ? new Date(max) : null;
  }

  static create = (params?: RawCreateParams): ValidationDate => {
    return new ValidationDate({
      checks: [],
      typeName: ValidationFirstKind.Date,
      ...processCreateParams(params),
    });
  };
}

////////////////////////////////////////////
////////////////////////////////////////////
//////////                        //////////
//////////      ZodUndefined      //////////
//////////                        //////////
////////////////////////////////////////////
////////////////////////////////////////////
export interface UndefinedDef extends ValidationTypeDef {
  typeName: ValidationFirstKind.Undefined;
}

export class ValidationUndefined extends SchemaOf<undefined, UndefinedDef> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }
  params?: RawCreateParams;

  static create = (params?: RawCreateParams): ValidationUndefined => {
    return new ValidationUndefined({
      typeName: ValidationFirstKind.Undefined,
      ...processCreateParams(params),
    });
  };
}

///////////////////////////////////////
///////////////////////////////////////
//////////                   //////////
//////////      ZodNull      //////////
//////////                   //////////
///////////////////////////////////////
///////////////////////////////////////
export interface NullDef extends ValidationTypeDef {
  typeName: ValidationFirstKind.Null;
}

export class ValidationNull extends SchemaOf<null, NullDef> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }
  static create = (params?: RawCreateParams): ValidationNull => {
    return new ValidationNull({
      typeName: ValidationFirstKind.Null,
      ...processCreateParams(params),
    });
  };
}

//////////////////////////////////////
//////////////////////////////////////
//////////                  //////////
//////////      ZodAny      //////////
//////////                  //////////
//////////////////////////////////////
//////////////////////////////////////
export interface AnyDef extends ValidationTypeDef {
  typeName: ValidationFirstKind.Any;
}

export class ValidationAny extends SchemaOf<any, AnyDef> {
  // to prevent instances of other classes from extending ZodAny. this causes issues with catchall in ZodObject.
  _any: true = true;
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    return OK(input.data);
  }
  static create = (params?: RawCreateParams): ValidationAny => {
    return new ValidationAny({
      typeName: ValidationFirstKind.Any,
      ...processCreateParams(params),
    });
  };
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////                      //////////
//////////      ZodUnknown      //////////
//////////                      //////////
//////////////////////////////////////////
//////////////////////////////////////////
export interface UnknownDef extends ValidationTypeDef {
  typeName: ValidationFirstKind.Unknown;
}

export class ValidationUnknown extends SchemaOf<unknown, UnknownDef> {
  // required
  _unknown: true = true;
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    return OK(input.data);
  }

  static create = (params?: RawCreateParams): ValidationUnknown => {
    return new ValidationUnknown({
      typeName: ValidationFirstKind.Unknown,
      ...processCreateParams(params),
    });
  };
}

////////////////////////////////////////
////////////////////////////////////////
//////////                    //////////
//////////      ZodNever      //////////
//////////                    //////////
////////////////////////////////////////
////////////////////////////////////////
export interface NeverDef extends ValidationTypeDef {
  typeName: ValidationFirstKind.Never;
}

export class ValidationNever extends SchemaOf<never, NeverDef> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ErrorCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType,
    });
    return INVALID;
  }
  static create = (params?: RawCreateParams): ValidationNever => {
    return new ValidationNever({
      typeName: ValidationFirstKind.Never,
      ...processCreateParams(params),
    });
  };
}

///////////////////////////////////////
///////////////////////////////////////
//////////                   //////////
//////////      ZodVoid      //////////
//////////                   //////////
///////////////////////////////////////
///////////////////////////////////////
export interface VoidDef extends ValidationTypeDef {
  typeName: ValidationFirstKind.Void;
}

export class ValidationVoid extends SchemaOf<void, VoidDef> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }

  static create = (params?: RawCreateParams): ValidationVoid => {
    return new ValidationVoid({
      typeName: ValidationFirstKind.Void,
      ...processCreateParams(params),
    });
  };
}

////////////////////////////////////////
////////////////////////////////////////
//////////                    //////////
//////////      ZodArray      //////////
//////////                    //////////
////////////////////////////////////////
////////////////////////////////////////
export interface ArrayDef<T extends ValidateAnyType = ValidateAnyType>
  extends ValidationTypeDef {
  type: T;
  typeName: ValidationFirstKind.Array;
  minLength: { value: number; message?: string } | null;
  maxLength: { value: number; message?: string } | null;
}

export type ArrayCardinality = "many" | "atleastone";
type arrayOutputType<
  T extends ValidateAnyType,
  Cardinality extends ArrayCardinality = "many"
> = Cardinality extends "atleastone"
  ? [T["_output"], ...T["_output"][]]
  : T["_output"][];

export class ValidationArray<
  T extends ValidateAnyType,
  Cardinality extends ArrayCardinality = "many"
> extends SchemaOf<
  arrayOutputType<T, Cardinality>,
  ArrayDef<T>,
  Cardinality extends "atleastone"
  ? [T["_input"], ...T["_input"][]]
  : T["_input"][]
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { ctx, status } = this._processInputParams(input);

    const def = this._def;

    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ErrorCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          message: def.minLength.message,
        });
        status.dirty();
      }
    }

    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ErrorCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          message: def.maxLength.message,
        });
        status.dirty();
      }
    }

    if (ctx.common.async) {
      return Promise.all(
        (ctx.data as any[]).map((item, i) => {
          return def.type._parseAsync(
            new ValidateInputLazyPath(ctx, item, ctx.path, i)
          );
        })
      ).then((result) => {
        return ParseStatus.mergeArray(status, result);
      });
    }

    const result = (ctx.data as any[]).map((item, i) => {
      return def.type._parseSync(
        new ValidateInputLazyPath(ctx, item, ctx.path, i)
      );
    });

    return ParseStatus.mergeArray(status, result);
  }

  get element() {
    return this._def.type;
  }

  min(minLength: number, message?: errorUtil.ErrMessage): this {
    return new ValidationArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) },
    }) as any;
  }

  max(maxLength: number, message?: errorUtil.ErrMessage): this {
    return new ValidationArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) },
    }) as any;
  }

  length(len: number, message?: errorUtil.ErrMessage): this {
    return this.min(len, message).max(len, message) as any;
  }

  nonempty(message?: errorUtil.ErrMessage): ValidationArray<T, "atleastone"> {
    return this.min(1, message) as any;
  }

  static create = <T extends ValidateAnyType>(
    schema: T,
    params?: RawCreateParams
  ): ValidationArray<T> => {
    return new ValidationArray({
      type: schema,
      minLength: null,
      maxLength: null,
      typeName: ValidationFirstKind.Array,
      ...processCreateParams(params),
    });
  };
}

export type ValidationNonEmptyArray<T extends ValidateAnyType> = ValidationArray<T, "atleastone">;

/////////////////////////////////////////
/////////////////////////////////////////
//////////                     //////////
//////////      ZodObject      //////////
//////////                     //////////
/////////////////////////////////////////
/////////////////////////////////////////

export namespace ObjectUtil {
  export type MergeShapes<U extends RawShape, V extends RawShape> = {
    [k in Exclude<keyof U, keyof V>]: U[k];
  } & V;

  type OptionalKeys<T extends object> = {
    [k in keyof T]: undefined extends T[k] ? k : never;
  }[keyof T];

  type RequiredKeys<T extends object> = {
    [k in keyof T]: undefined extends T[k] ? never : k;
  }[keyof T];

  export type AddQuestionMarks<T extends object> = Partial<
    Pick<T, OptionalKeys<T>>
  > &
    Pick<T, RequiredKeys<T>>;

  export type Identity<T> = T;
  export type Flatten<T extends object> = Identity<{ [k in keyof T]: T[k] }>;

  export type NoNeverKeys<T extends RawShape> = {
    [k in keyof T]: [T[k]] extends [never] ? never : k;
  }[keyof T];

  export type NoNever<T extends RawShape> = Identity<{
    [k in NoNeverKeys<T>]: k extends keyof T ? T[k] : never;
  }>;

  export const mergeShapes = <U extends RawShape, T extends RawShape>(
    first: U,
    second: T
  ): T & U => {
    return {
      ...first,
      ...second, // second overwrites first
    };
  };
}

export type ExtendShape<A, B> = Omit<A, keyof B> & B;

const AugmentFactory =
  <Def extends ObjectDef>(def: Def) =>
    <Augmentation extends RawShape>(
      augmentation: Augmentation
    ): ValidationObject<
      ExtendShape<ReturnType<Def["shape"]>, Augmentation>,
      Def["unknownKeys"],
      Def["catchall"]
    > => {
      return new ValidationObject({
        ...def,
        shape: () => ({
          ...def.shape(),
          ...augmentation,
        }),
      }) as any;
    };

type UnknownKeysParam = "passthrough" | "strict" | "strip";

export interface ObjectDef<
  T extends RawShape = RawShape,
  UnknownKeys extends UnknownKeysParam = UnknownKeysParam,
  Catchall extends ValidateAnyType = ValidateAnyType
> extends ValidationTypeDef {
  typeName: ValidationFirstKind.Object;
  shape: () => T;
  catchall: Catchall;
  unknownKeys: UnknownKeys;
}

export type BaseObjectOutputType<Shape extends RawShape> =
  ObjectUtil.Flatten<
    ObjectUtil.AddQuestionMarks<{
      [k in keyof Shape]: Shape[k]["_output"];
    }>
  >;

export type ObjectOutputType<
  Shape extends RawShape,
  Catchall extends ValidateAnyType
> = ValidateAnyType extends Catchall
  ? BaseObjectOutputType<Shape>
  : ObjectUtil.Flatten<
    BaseObjectOutputType<Shape> & { [k: string]: Catchall["_output"] }
  >;

export type BaseObjectInputType<Shape extends RawShape> = ObjectUtil.Flatten<
  ObjectUtil.AddQuestionMarks<{
    [k in keyof Shape]: Shape[k]["_input"];
  }>
>;

export type ObjectInputType<
  Shape extends RawShape,
  Catchall extends ValidateAnyType
> = ValidateAnyType extends Catchall
  ? BaseObjectInputType<Shape>
  : ObjectUtil.Flatten<
    BaseObjectInputType<Shape> & { [k: string]: Catchall["_input"] }
  >;

type Deoptional<T extends ValidateAnyType> = T extends ValidationOptional<infer U>
  ? Deoptional<U>
  : T;

export type SomeObject = ValidationObject<
  RawShape,
  UnknownKeysParam,
  ValidateAnyType,
  any,
  any
>;

function deepPartialify(schema: ValidateAnyType): any {
  if (schema instanceof ValidationObject) {
    const newShape: any = {};

    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ValidationOptional.create(deepPartialify(fieldSchema));
    }
    return new ValidationObject({
      ...schema._def,
      shape: () => newShape,
    }) as any;
  } else if (schema instanceof ValidationArray) {
    return ValidationArray.create(deepPartialify(schema.element));
  } else if (schema instanceof ValidationOptional) {
    return ValidationOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ValidationNullable) {
    return ValidationNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ValidationTuple) {
    return ValidationTuple.create(
      schema.items.map((item: any) => deepPartialify(item))
    );
  } else {
    return schema;
  }
}

export class ValidationObject<
  T extends RawShape,
  UnknownKeys extends UnknownKeysParam = "strip",
  Catchall extends ValidateAnyType = ValidateAnyType,
  Output = ObjectOutputType<T, Catchall>,
  Input = ObjectInputType<T, Catchall>
> extends SchemaOf<Output, ObjectDef<T, UnknownKeys, Catchall>, Input> {
  private _cached: { shape: T; keys: string[] } | null = null;

  _getCached(): { shape: T; keys: string[] } {
    if (this._cached !== null) return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    return (this._cached = { shape, keys });
  }

  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    const { status, ctx } = this._processInputParams(input);

    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys: string[] = [];

    if (
      !(
        this._def.catchall instanceof ValidationNever &&
        this._def.unknownKeys === "strip"
      )
    ) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }

    const pairs: {
      key: ParseReturnType<any>;
      value: ParseReturnType<any>;
      alwaysSet?: boolean;
    }[] = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(
          new ValidateInputLazyPath(ctx, value, ctx.path, key)
        ),
        alwaysSet: key in ctx.data,
      });
    }

    if (this._def.catchall instanceof ValidationNever) {
      const unknownKeys = this._def.unknownKeys;

      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] },
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ErrorCode.unrecognized_keys,
            keys: extraKeys,
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Invalid unknownKeys value.`)
      }
    } else {
      // run catchall validation
      const catchall = this._def.catchall;

      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ValidateInputLazyPath(ctx, value, ctx.path, key)
          ),
          alwaysSet: key in ctx.data,
        });
      }
    }

    if (ctx.common.async) {
      return Promise.resolve()
        .then(async () => {
          const syncPairs: any[] = [];
          for (const pair of pairs) {
            const key = await pair.key;
            syncPairs.push({
              key,
              value: await pair.value,
              alwaysSet: pair.alwaysSet,
            });
          }
          return syncPairs;
        })
        .then((syncPairs) => {
          return ParseStatus.mergeObjectSync(status, syncPairs);
        });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs as any);
    }
  }

  get shape() {
    return this._def.shape();
  }

  strict(message?: errorUtil.ErrMessage): ValidationObject<T, "strict", Catchall> {
    errorUtil.errToObj;
    return new ValidationObject({
      ...this._def,
      unknownKeys: "strict",
      ...(message !== undefined
        ? {
          errorMap: (issue, ctx) => {
            const defaultError =
              this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
            if (issue.code === "unrecognized_keys")
              return {
                message: errorUtil.errToObj(message).message ?? defaultError,
              };
            return {
              message: defaultError,
            };
          },
        }
        : {}),
    }) as any;
  }

  strip(): ValidationObject<T, "strip", Catchall> {
    return new ValidationObject({
      ...this._def,
      unknownKeys: "strip",
    }) as any;
  }

  passthrough(): ValidationObject<T, "passthrough", Catchall> {
    return new ValidationObject({
      ...this._def,
      unknownKeys: "passthrough",
    }) as any;
  }

  /**
   * @deprecated In most cases, this is no longer needed - unknown properties are now silently stripped.
   * If you want to pass through unknown properties, use `.passthrough()` instead.
   */
  nonstrict = this.passthrough;

  augment = AugmentFactory<ObjectDef<T, UnknownKeys, Catchall>>(this._def);
  extend = AugmentFactory<ObjectDef<T, UnknownKeys, Catchall>>(this._def);

  setKey<Key extends string, Schema extends ValidateAnyType>(
    key: Key,
    schema: Schema
  ): ValidationObject<T & { [k in Key]: Schema }, UnknownKeys, Catchall> {
    return this.augment({ [key]: schema }) as any;
  }

  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge<Incoming extends ValidationAnyObject>(
    merging: Incoming
  ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
    ValidationObject<
      ExtendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
      Incoming["_def"]["unknownKeys"],
      Incoming["_def"]["catchall"]
    > {
    // const mergedShape = objectUtil.mergeShapes(
    //   this._def.shape(),
    //   merging._def.shape()
    // );
    const merged: any = new ValidationObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () =>
        ObjectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
      typeName: ValidationFirstKind.Object,
    }) as any;
    return merged;
  }

  catchall<Index extends ValidateAnyType>(
    index: Index
  ): ValidationObject<T, UnknownKeys, Index> {
    return new ValidationObject({
      ...this._def,
      catchall: index,
    }) as any;
  }

  pick<Mask extends { [k in keyof T]?: true }>(
    mask: Mask
  ): ValidationObject<Pick<T, Extract<keyof T, keyof Mask>>, UnknownKeys, Catchall> {
    const shape: any = {};
    util.objectKeys(mask).map((key) => {
      // only add to shape if key corresponds to an element of the current shape
      if (this.shape[key]) shape[key] = this.shape[key];
    });
    return new ValidationObject({
      ...this._def,
      shape: () => shape,
    }) as any;
  }

  omit<Mask extends { [k in keyof T]?: true }>(
    mask: Mask
  ): ValidationObject<Omit<T, keyof Mask>, UnknownKeys, Catchall> {
    const shape: any = {};
    util.objectKeys(this.shape).map((key) => {
      if (util.objectKeys(mask).indexOf(key) === -1) {
        shape[key] = this.shape[key];
      }
    });
    return new ValidationObject({
      ...this._def,
      shape: () => shape,
    }) as any;
  }

  deepPartial(): partialUtil.DeepPartial<this> {
    return deepPartialify(this) as any;
  }

  partial(): ValidationObject<
    { [k in keyof T]: ValidationOptional<T[k]> },
    UnknownKeys,
    Catchall
  >;
  partial<Mask extends { [k in keyof T]?: true }>(
    mask: Mask
  ): ValidationObject<
    ObjectUtil.NoNever<{
      [k in keyof T]: k extends keyof Mask ? ValidationOptional<T[k]> : T[k];
    }>,
    UnknownKeys,
    Catchall
  >;
  partial(mask?: any) {
    const newShape: any = {};
    if (mask) {
      util.objectKeys(this.shape).map((key) => {
        if (util.objectKeys(mask).indexOf(key) === -1) {
          newShape[key] = this.shape[key];
        } else {
          newShape[key] = this.shape[key].optional();
        }
      });
      return new ValidationObject({
        ...this._def,
        shape: () => newShape,
      }) as any;
    } else {
      for (const key in this.shape) {
        const fieldSchema = this.shape[key];
        newShape[key] = fieldSchema.optional();
      }
    }

    return new ValidationObject({
      ...this._def,
      shape: () => newShape,
    }) as any;
  }

  required(): ValidationObject<
    { [k in keyof T]: Deoptional<T[k]> },
    UnknownKeys,
    Catchall
  >;
  required<Mask extends { [k in keyof T]?: true }>(
    mask: Mask
  ): ValidationObject<
    ObjectUtil.NoNever<{
      [k in keyof T]: k extends keyof Mask ? Deoptional<T[k]> : T[k];
    }>,
    UnknownKeys,
    Catchall
  >;
  required(mask?: any) {
    const newShape: any = {};
    if (mask) {
      util.objectKeys(this.shape).map((key) => {
        if (util.objectKeys(mask).indexOf(key) === -1) {
          newShape[key] = this.shape[key];
        } else {
          const fieldSchema = this.shape[key];
          let newField = fieldSchema;
          while (newField instanceof ValidationOptional) {
            newField = (newField as ValidationOptional<any>)._def.innerType;
          }
          newShape[key] = newField;
        }
      });
    } else {
      for (const key in this.shape) {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ValidationOptional) {
          newField = (newField as ValidationOptional<any>)._def.innerType;
        }

        newShape[key] = newField;
      }
    }
    return new ValidationObject({
      ...this._def,
      shape: () => newShape,
    }) as any;
  }

  keyof(): ValidationEnum<enumUtil.UnionToTupleString<keyof T>> {
    return createZodEnum(
      util.objectKeys(this.shape) as [string, ...string[]]
    ) as any;
  }

  static create = <T extends RawShape>(
    shape: T,
    params?: RawCreateParams
  ): ValidationObject<T> => {
    return new ValidationObject({
      shape: () => shape,
      unknownKeys: "strip",
      catchall: ValidationNever.create(),
      typeName: ValidationFirstKind.Object,
      ...processCreateParams(params),
    }) as any;
  };

  static strictCreate = <T extends RawShape>(
    shape: T,
    params?: RawCreateParams
  ): ValidationObject<T, "strict"> => {
    return new ValidationObject({
      shape: () => shape,
      unknownKeys: "strict",
      catchall: ValidationNever.create(),
      typeName: ValidationFirstKind.Object,
      ...processCreateParams(params),
    }) as any;
  };

  static lazyCreate = <T extends RawShape>(
    shape: () => T,
    params?: RawCreateParams
  ): ValidationObject<T> => {
    return new ValidationObject({
      shape,
      unknownKeys: "strip",
      catchall: ValidationNever.create(),
      typeName: ValidationFirstKind.Object,
      ...processCreateParams(params),
    }) as any;
  };
}

export type ValidationAnyObject = ValidationObject<any, any, any>

////////////////////////////////////////
////////////////////////////////////////
//////////                    //////////
//////////      ZodUnion      //////////
//////////                    //////////
////////////////////////////////////////
////////////////////////////////////////
type UnionOptions = Readonly<[ValidateAnyType, ...ValidateAnyType[]]>
export interface UnionDef<
  T extends UnionOptions = Readonly<
    [ValidateAnyType, ValidateAnyType, ...ValidateAnyType[]]
  >
> extends ValidationTypeDef {
  options: T;
  typeName: ValidationFirstKind.Union;
}

export class ValidationUnion<T extends UnionOptions> extends SchemaOf<
  T[number]["_output"],
  UnionDef<T>,
  T[number]["_input"]
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;

    function handleResults(
      results: { ctx: ParseContext; result: SyncParseReturnType<any> }[]
    ) {
      // return first issue-free validation if it exists
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }

      for (const result of results) {
        if (result.result.status === "dirty") {
          // add issues from dirty option

          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }

      // return invalid
      const unionErrors = results.map(
        (result) => new ValidateError(result.ctx.common.issues)
      );

      addIssueToContext(ctx, {
        code: ErrorCode.invalid_union,
        unionErrors,
      });
      return INVALID;
    }

    if (ctx.common.async) {
      return Promise.all(
        options.map(async (option) => {
          const childCtx: ParseContext = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: [],
            },
            parent: null,
          };
          return {
            result: await option._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx,
            }),
            ctx: childCtx,
          };
        })
      ).then(handleResults);
    } else {
      let dirty: undefined | { result: DIRTY<any>; ctx: ParseContext } =
        undefined;
      const issues: Issue[][] = [];
      for (const option of options) {
        const childCtx: ParseContext = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: [],
          },
          parent: null,
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx,
        });

        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }

        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }

      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }

      const unionErrors = issues.map((issues) => new ValidateError(issues));
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_union,
        unionErrors,
      });

      return INVALID;
    }
  }

  get options() {
    return this._def.options;
  }

  static create = <
    T extends Readonly<[ValidateAnyType, ValidateAnyType, ...ValidateAnyType[]]>
  >(
    types: T,
    params?: RawCreateParams
  ): ValidationUnion<T> => {
    return new ValidationUnion({
      options: types,
      typeName: ValidationFirstKind.Union,
      ...processCreateParams(params),
    });
  };
}

/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
//////////                                 //////////
//////////      ZodDiscriminatedUnion      //////////
//////////                                 //////////
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////

export type DiscriminatedUnionOption<
  Discriminator extends string,
  DiscriminatorValue extends Primitive
> = ValidationObject<
  { [key in Discriminator]: ValidationLiteral<DiscriminatorValue> } & RawShape,
  any,
  any
>;

export interface DiscriminatedUnionDef<
  Discriminator extends string,
  DiscriminatorValue extends Primitive,
  Option extends DiscriminatedUnionOption<Discriminator, DiscriminatorValue>
> extends ValidationTypeDef {
  discriminator: Discriminator;
  options: Map<DiscriminatorValue, Option>;
  typeName: ValidationFirstKind.DiscriminatedUnion;
}

export class ValidationDiscriminatedUnion<
  Discriminator extends string,
  DiscriminatorValue extends Primitive,
  Option extends DiscriminatedUnionOption<Discriminator, DiscriminatorValue>
> extends SchemaOf<
  Option["_output"],
  DiscriminatedUnionDef<Discriminator, DiscriminatorValue, Option>,
  Option["_input"]
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { ctx } = this._processInputParams(input);

    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    const discriminator = this.discriminator;
    const discriminatorValue: DiscriminatorValue = ctx.data[discriminator];
    const option = this.options.get(discriminatorValue);

    if (!option) {
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_union_discriminator,
        options: this.validDiscriminatorValues,
        path: [discriminator],
      });
      return INVALID;
    }

    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx,
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx,
      });
    }
  }

  get discriminator() {
    return this._def.discriminator;
  }

  get validDiscriminatorValues() {
    return Array.from(this.options.keys());
  }

  get options() {
    return this._def.options;
  }

  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create<
    Discriminator extends string,
    DiscriminatorValue extends Primitive,
    Types extends [
      DiscriminatedUnionOption<Discriminator, DiscriminatorValue>,
      DiscriminatedUnionOption<Discriminator, DiscriminatorValue>,
      ...DiscriminatedUnionOption<Discriminator, DiscriminatorValue>[]
    ]
  >(
    discriminator: Discriminator,
    types: Types,
    params?: RawCreateParams
  ): ValidationDiscriminatedUnion<Discriminator, DiscriminatorValue, Types[number]> {
    // Get all the valid discriminator values
    const options: Map<DiscriminatorValue, Types[number]> = new Map();

    try {
      types.forEach((type) => {
        const discriminatorValue = type.shape[discriminator].value;
        options.set(discriminatorValue, type);
      });
    } catch (e) {
      throw new Error(
        "The discriminator value could not be extracted from all the provided schemas"
      );
    }

    // Assert that all the discriminator values are unique
    if (options.size !== types.length) {
      throw new Error("Some of the discriminator values are not unique");
    }

    return new ValidationDiscriminatedUnion<
      Discriminator,
      DiscriminatorValue,
      Types[number]
    >({
      typeName: ValidationFirstKind.DiscriminatedUnion,
      discriminator,
      options,
      ...processCreateParams(params),
    });
  }
}

///////////////////////////////////////////////
///////////////////////////////////////////////
//////////                           //////////
//////////      ZodIntersection      //////////
//////////                           //////////
///////////////////////////////////////////////
///////////////////////////////////////////////
export interface IntersectionDef<
  T extends ValidateAnyType = ValidateAnyType,
  U extends ValidateAnyType = ValidateAnyType
> extends ValidationTypeDef {
  left: T;
  right: U;
  typeName: ValidationFirstKind.Intersection;
}

function mergeValues(
  a: any,
  b: any
): { valid: true; data: any } | { valid: false } {
  const aType = getParsedType(a);
  const bType = getParsedType(b);

  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util
      .objectKeys(a)
      .filter((key) => bKeys.indexOf(key) !== -1);

    const newObj: any = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }

    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }

    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);

      if (!sharedValue.valid) {
        return { valid: false };
      }

      newArray.push(sharedValue.data);
    }

    return { valid: true, data: newArray };
  } else if (
    aType === ZodParsedType.date &&
    bType === ZodParsedType.date &&
    +a === +b
  ) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}

export class ValidationIntersection<
  T extends ValidateAnyType,
  U extends ValidateAnyType
> extends SchemaOf<
  T["_output"] & U["_output"],
  IntersectionDef<T, U>,
  T["_input"] & U["_input"]
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (
      parsedLeft: SyncParseReturnType,
      parsedRight: SyncParseReturnType
    ): SyncParseReturnType<T & U> => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }

      const merged = mergeValues(parsedLeft.value, parsedRight.value);

      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ErrorCode.invalid_intersection_types,
        });
        return INVALID;
      }

      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }

      return { status: status.value, value: merged.data as any };
    };

    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        }),
      ]).then(([left, right]: any) => handleParsed(left, right));
    } else {
      return handleParsed(
        this._def.left._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        }),
        this._def.right._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        })
      );
    }
  }

  static create = <T extends ValidateAnyType, U extends ValidateAnyType>(
    left: T,
    right: U,
    params?: RawCreateParams
  ): ValidationIntersection<T, U> => {
    return new ValidationIntersection({
      left: left,
      right: right,
      typeName: ValidationFirstKind.Intersection,
      ...processCreateParams(params),
    });
  };
}

////////////////////////////////////////
////////////////////////////////////////
//////////                    //////////
//////////      ZodTuple      //////////
//////////                    //////////
////////////////////////////////////////
////////////////////////////////////////
export type TupleItems = [ValidateAnyType, ...ValidateAnyType[]];
export type AssertArray<T> = T extends any[] ? T : never;
export type OutputTypeOfTuple<T extends TupleItems | []> = AssertArray<{
  [k in keyof T]: T[k] extends SchemaOf<any, any> ? T[k]["_output"] : never;
}>

export type OutputTypeOfTupleWithRest<
  T extends TupleItems | [],
  Rest extends ValidateAnyType | null = null
> = Rest extends ValidateAnyType
  ? [...OutputTypeOfTuple<T>, ...Rest["_output"][]]
  : OutputTypeOfTuple<T>;

export type InputTypeOfTuple<T extends TupleItems | []> = AssertArray<{
  [k in keyof T]: T[k] extends SchemaOf<any, any> ? T[k]["_input"] : never;
}>

export type InputTypeOfTupleWithRest<
  T extends TupleItems | [],
  Rest extends ValidateAnyType | null = null
> = Rest extends ValidateAnyType
  ? [...InputTypeOfTuple<T>, ...Rest["_input"][]]
  : InputTypeOfTuple<T>;

export interface TupleDef<
  T extends TupleItems | [] = TupleItems,
  Rest extends ValidateAnyType | null = null
> extends ValidationTypeDef {
  items: T;
  rest: Rest;
  typeName: ValidationFirstKind.Tuple;
}

export type ValidationAnyTuple = ValidationTuple<
  [ValidateAnyType, ...ValidateAnyType[]] | [],
  ValidateAnyType | null
>;
export class ValidationTuple<
  T extends [ValidateAnyType, ...ValidateAnyType[]] | [] = [ValidateAnyType, ...ValidateAnyType[]],
  Rest extends ValidateAnyType | null = null
> extends SchemaOf<
  OutputTypeOfTupleWithRest<T, Rest>,
  TupleDef<T, Rest>,
  InputTypeOfTupleWithRest<T, Rest>
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ErrorCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        type: "array",
      });

      return INVALID;
    }

    const rest = this._def.rest;

    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ErrorCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        type: "array",
      });
      status.dirty();
    }

    const items = (ctx.data as any[])
      .map((item, itemIndex) => {
        const schema = this._def.items[itemIndex] || this._def.rest;
        if (!schema) return null as any as SyncParseReturnType<any>;
        return schema._parse(
          new ValidateInputLazyPath(ctx, item, ctx.path, itemIndex)
        );
      })
      .filter((x) => !!x); // filter nulls

    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items as SyncParseReturnType[]);
    }
  }

  get items() {
    return this._def.items;
  }

  rest<Rest extends ValidateAnyType>(rest: Rest): ValidationTuple<T, Rest> {
    return new ValidationTuple({
      ...this._def,
      rest,
    });
  }

  static create = <T extends [ValidateAnyType, ...ValidateAnyType[]] | []>(
    schemas: T,
    params?: RawCreateParams
  ): ValidationTuple<T, null> => {
    if (!Array.isArray(schemas)) {
      throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
    }
    return new ValidationTuple({
      items: schemas,
      typeName: ValidationFirstKind.Tuple,
      rest: null,
      ...processCreateParams(params),
    });
  };
}

/////////////////////////////////////////
/////////////////////////////////////////
//////////                     //////////
//////////      ZodRecord      //////////
//////////                     //////////
/////////////////////////////////////////
/////////////////////////////////////////
export interface RecordDef<
  Key extends KeySchema = ValidationString,
  Value extends ValidateAnyType = ValidateAnyType
> extends ValidationTypeDef {
  valueType: Value;
  keyType: Key;
  typeName: ValidationFirstKind.Record;
}

type KeySchema = SchemaOf<string | number | symbol, any, any>;
type RecordType<K extends string | number | symbol, V> = [string] extends [K]
  ? Record<K, V>
  : [number] extends [K]
  ? Record<K, V>
  : [symbol] extends [K]
  ? Record<K, V>
  : Partial<Record<K, V>>;
export class ValidationRecord<
  Key extends KeySchema = ValidationString,
  Value extends ValidateAnyType = ValidateAnyType
> extends SchemaOf<
  RecordType<Key["_output"], Value["_output"]>,
  RecordDef<Key, Value>,
  RecordType<Key["_input"], Value["_input"]>
> {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    const pairs: {
      key: ParseReturnType<any>;
      value: ParseReturnType<any>;
    }[] = [];

    const keyType = this._def.keyType;
    const valueType = this._def.valueType;

    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ValidateInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(
          new ValidateInputLazyPath(ctx, ctx.data[key], ctx.path, key)
        ),
      });
    }

    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs as any);
    }
  }

  get element() {
    return this._def.valueType;
  }

  static create<Value extends ValidateAnyType>(
    valueType: Value,
    params?: RawCreateParams
  ): ValidationRecord<ValidationString, Value>;
  static create<Keys extends KeySchema, Value extends ValidateAnyType>(
    keySchema: Keys,
    valueType: Value,
    params?: RawCreateParams
  ): ValidationRecord<Keys, Value>;
  static create(first: any, second?: any, third?: any): ValidationRecord<any, any> {
    if (second instanceof SchemaOf) {
      return new ValidationRecord({
        keyType: first,
        valueType: second,
        typeName: ValidationFirstKind.Record,
        ...processCreateParams(third),
      });
    }

    return new ValidationRecord({
      keyType: ValidationString.create(),
      valueType: first,
      typeName: ValidationFirstKind.Record,
      ...processCreateParams(second),
    });
  }
}

//////////////////////////////////////
//////////////////////////////////////
//////////                  //////////
//////////      ZodMap      //////////
//////////                  //////////
//////////////////////////////////////
//////////////////////////////////////
export interface MapDef<
  Key extends ValidateAnyType = ValidateAnyType,
  Value extends ValidateAnyType = ValidateAnyType
> extends ValidationTypeDef {
  valueType: Value;
  keyType: Key;
  typeName: ValidationFirstKind.Map;
}

export class ValidationMap<
  Key extends ValidateAnyType = ValidateAnyType,
  Value extends ValidateAnyType = ValidateAnyType
> extends SchemaOf<
  Map<Key["_output"], Value["_output"]>,
  MapDef<Key, Value>,
  Map<Key["_input"], Value["_input"]>
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    const keyType = this._def.keyType;
    const valueType = this._def.valueType;

    const pairs = [...(ctx.data as Map<unknown, unknown>).entries()].map(
      ([key, value], index) => {
        return {
          key: keyType._parse(
            new ValidateInputLazyPath(ctx, key, ctx.path, [index, "key"])
          ),
          value: valueType._parse(
            new ValidateInputLazyPath(ctx, value, ctx.path, [index, "value"])
          ),
        };
      }
    );

    if (ctx.common.async) {
      const finalMap = new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }

          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = new Map();
      for (const pair of pairs) {
        const key = pair.key as SyncParseReturnType;
        const value = pair.value as SyncParseReturnType;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }

        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
  static create = <
    Key extends ValidateAnyType = ValidateAnyType,
    Value extends ValidateAnyType = ValidateAnyType
  >(
    keyType: Key,
    valueType: Value,
    params?: RawCreateParams
  ): ValidationMap<Key, Value> => {
    return new ValidationMap({
      valueType,
      keyType,
      typeName: ValidationFirstKind.Map,
      ...processCreateParams(params),
    });
  };
}

//////////////////////////////////////
//////////////////////////////////////
//////////                  //////////
//////////      ZodSet      //////////
//////////                  //////////
//////////////////////////////////////
//////////////////////////////////////
export interface SetDef<Value extends ValidateAnyType = ValidateAnyType>
  extends ValidationTypeDef {
  valueType: Value;
  typeName: ValidationFirstKind.Set;
  minSize: { value: number; message?: string } | null;
  maxSize: { value: number; message?: string } | null;
}

export class ValidatioSet<Value extends ValidateAnyType = ValidateAnyType> extends SchemaOf<
  Set<Value["_output"]>,
  SetDef<Value>,
  Set<Value["_input"]>
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    const def = this._def;

    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ErrorCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          message: def.minSize.message,
        });
        status.dirty();
      }
    }

    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ErrorCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          message: def.maxSize.message,
        });
        status.dirty();
      }
    }

    const valueType = this._def.valueType;

    function finalizeSet(elements: SyncParseReturnType<any>[]) {
      const parsedSet = new Set();
      for (const element of elements) {
        if (element.status === "aborted") return INVALID;
        if (element.status === "dirty") status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }

    const elements = [...(ctx.data as Set<unknown>).values()].map((item, i) =>
      valueType._parse(new ValidateInputLazyPath(ctx, item, ctx.path, i))
    );

    if (ctx.common.async) {
      return Promise.all(elements).then((elements) => finalizeSet(elements));
    } else {
      return finalizeSet(elements as SyncParseReturnType[]);
    }
  }

  min(minSize: number, message?: errorUtil.ErrMessage): this {
    return new ValidatioSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) },
    }) as any;
  }

  max(maxSize: number, message?: errorUtil.ErrMessage): this {
    return new ValidatioSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) },
    }) as any;
  }

  size(size: number, message?: errorUtil.ErrMessage): this {
    return this.min(size, message).max(size, message) as any;
  }

  nonempty(message?: errorUtil.ErrMessage): ValidatioSet<Value> {
    return this.min(1, message) as any;
  }

  static create = <Value extends ValidateAnyType = ValidateAnyType>(
    valueType: Value,
    params?: RawCreateParams
  ): ValidatioSet<Value> => {
    return new ValidatioSet({
      valueType,
      minSize: null,
      maxSize: null,
      typeName: ValidationFirstKind.Set,
      ...processCreateParams(params),
    });
  };
}

///////////////////////////////////////////
///////////////////////////////////////////
//////////                       //////////
//////////      ZodFunction      //////////
//////////                       //////////
///////////////////////////////////////////
///////////////////////////////////////////
export interface FunctionDef<
  Args extends ValidationTuple<any, any> = ValidationTuple<any, any>,
  Returns extends ValidateAnyType = ValidateAnyType
> extends ValidationTypeDef {
  args: Args;
  returns: Returns;
  typeName: ValidationFirstKind.Function;
}

export type OuterTypeOfFunction<
  Args extends ValidationTuple<any, any>,
  Returns extends ValidateAnyType
> = Args["_input"] extends Array<any>
  ? (...args: Args["_input"]) => Returns["_output"]
  : never;

export type InnerTypeOfFunction<
  Args extends ValidationTuple<any, any>,
  Returns extends ValidateAnyType
> = Args["_output"] extends Array<any>
  ? (...args: Args["_output"]) => Returns["_input"]
  : never;

export class ValidationFunction<
  Args extends ValidationTuple<any, any>,
  Returns extends ValidateAnyType
> extends SchemaOf<
  OuterTypeOfFunction<Args, Returns>,
  FunctionDef<Args, Returns>,
  InnerTypeOfFunction<Args, Returns>
> {
  _parse(input: ParseInput): ParseReturnType<any> {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    function makeArgsIssue(args: any, error: ValidateError): Issue {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [
          ctx.common.contextualErrorMap,
          ctx.schemaErrorMap,
          getErrorMap(),
          defaultErrorMap,
        ].filter((x) => !!x) as ErrorMap[],
        issueData: {
          code: ErrorCode.invalid_arguments,
          argumentsError: error,
        },
      });
    }

    function makeReturnsIssue(returns: any, error: ValidateError): Issue {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [
          ctx.common.contextualErrorMap,
          ctx.schemaErrorMap,
          getErrorMap(),
          defaultErrorMap,
        ].filter((x) => !!x) as ErrorMap[],
        issueData: {
          code: ErrorCode.invalid_return_type,
          returnTypeError: error,
        },
      });
    }

    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;

    if (this._def.returns instanceof ValidationPromise) {
      return OK(async (...args: any[]) => {
        const error = new ValidateError([]);
        const parsedArgs = await this._def.args
          .parseAsync(args, params)
          .catch((e) => {
            error.addIssue(makeArgsIssue(args, e));
            throw error;
          });
        const result = await fn(...(parsedArgs as any));
        const parsedReturns = await (
          this._def.returns as ValidationPromise<ValidateAnyType>
        )._def.type
          .parseAsync(result, params)
          .catch((e) => {
            error.addIssue(makeReturnsIssue(result, e));
            throw error;
          });
        return parsedReturns;
      });
    } else {
      return OK((...args: any[]) => {
        const parsedArgs = this._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ValidateError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = fn(...(parsedArgs.data as any));
        const parsedReturns = this._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ValidateError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      }) as any;
    }
  }

  parameters() {
    return this._def.args;
  }

  returnType() {
    return this._def.returns;
  }

  args<Items extends Parameters<typeof ValidationTuple["create"]>[0]>(
    ...items: Items
  ): ValidationFunction<ValidationTuple<Items, ValidationUnknown>, Returns> {
    return new ValidationFunction({
      ...this._def,
      args: ValidationTuple.create(items).rest(ValidationUnknown.create()) as any,
    });
  }

  returns<NewReturnType extends SchemaOf<any, any>>(
    returnType: NewReturnType
  ): ValidationFunction<Args, NewReturnType> {
    return new ValidationFunction({
      ...this._def,
      returns: returnType,
    });
  }

  implement<F extends InnerTypeOfFunction<Args, Returns>>(
    func: F
  ): ReturnType<F> extends Returns["_output"]
    ? (...args: Args["_input"]) => ReturnType<F>
    : OuterTypeOfFunction<Args, Returns> {
    const validatedFunc = this.parse(func);
    return validatedFunc as any;
  }

  strictImplement(
    func: InnerTypeOfFunction<Args, Returns>
  ): InnerTypeOfFunction<Args, Returns> {
    const validatedFunc = this.parse(func);
    return validatedFunc as any;
  }

  validate = this.implement;

  static create(): ValidationFunction<ValidationTuple<[], ValidationUnknown>, ValidationUnknown>;
  static create<T extends ValidationAnyTuple = ValidationTuple<[], ValidationUnknown>>(
    args: T
  ): ValidationFunction<T, ValidationUnknown>;
  static create<T extends ValidationAnyTuple, U extends ValidateAnyType>(
    args: T,
    returns: U
  ): ValidationFunction<T, U>;
  static create<
    T extends ValidationAnyTuple = ValidationTuple<[], ValidationUnknown>,
    U extends ValidateAnyType = ValidationUnknown
  >(args: T, returns: U, params?: RawCreateParams): ValidationFunction<T, U>;
  static create(
    args?: ValidationAnyTuple,
    returns?: ValidateAnyType,
    params?: RawCreateParams
  ) {
    return new ValidationFunction({
      args: (args
        ? args
        : ValidationTuple.create([]).rest(ValidationUnknown.create())) as any,
      returns: returns || ValidationUnknown.create(),
      typeName: ValidationFirstKind.Function,
      ...processCreateParams(params),
    }) as any;
  }
}

///////////////////////////////////////
///////////////////////////////////////
//////////                   //////////
//////////      ZodLazy      //////////
//////////                   //////////
///////////////////////////////////////
///////////////////////////////////////
export interface LazyDef<T extends ValidateAnyType = ValidateAnyType>
  extends ValidationTypeDef {
  getter: () => T;
  typeName: ValidationFirstKind.Lazy;
}

export class ValidationLazy<T extends ValidateAnyType> extends SchemaOf<
  Output<T>,
  LazyDef<T>,
  Input<T>
> {
  get schema(): T {
    return this._def.getter();
  }

  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }

  static create = <T extends ValidateAnyType>(
    getter: () => T,
    params?: RawCreateParams
  ): ValidationLazy<T> => {
    return new ValidationLazy({
      getter: getter,
      typeName: ValidationFirstKind.Lazy,
      ...processCreateParams(params),
    });
  };
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////                      //////////
//////////      ZodLiteral      //////////
//////////                      //////////
//////////////////////////////////////////
//////////////////////////////////////////
export interface LiteralDef<T = any> extends ValidationTypeDef {
  value: T;
  typeName: ValidationFirstKind.Literal;
}

export class ValidationLiteral<T> extends SchemaOf<T, LiteralDef<T>> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_literal,
        expected: this._def.value,
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }

  get value() {
    return this._def.value;
  }

  static create = <T extends Primitive>(
    value: T,
    params?: RawCreateParams
  ): ValidationLiteral<T> => {
    return new ValidationLiteral({
      value: value,
      typeName: ValidationFirstKind.Literal,
      ...processCreateParams(params),
    });
  };
}

///////////////////////////////////////
///////////////////////////////////////
//////////                   //////////
//////////      ZodEnum      //////////
//////////                   //////////
///////////////////////////////////////
///////////////////////////////////////
export type ArrayKeys = keyof any[];
export type Indices<T> = Exclude<keyof T, ArrayKeys>;

type EnumValues = [string, ...string[]];

type Values<T extends EnumValues> = {
  [k in T[number]]: k;
};

export interface EnumDef<T extends EnumValues = EnumValues>
  extends ValidationTypeDef {
  values: T;
  typeName: ValidationFirstKind.Enum;
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

function createZodEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
  values: T,
  params?: RawCreateParams
): ValidationEnum<Writeable<T>>;
function createZodEnum<U extends string, T extends [U, ...U[]]>(
  values: T,
  params?: RawCreateParams
): ValidationEnum<T>;
function createZodEnum(values: any, params?: RawCreateParams) {
  return new ValidationEnum({
    values: values as any,
    typeName: ValidationFirstKind.Enum,
    ...processCreateParams(params),
  }) as any;
}

export class ValidationEnum<T extends [string, ...string[]]> extends SchemaOf<
  T[number],
  EnumDef<T>
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues) as "string",
        received: ctx.parsedType,
        code: ErrorCode.invalid_type,
      });
      return INVALID;
    }

    if (this._def.values.indexOf(input.data) === -1) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;

      addIssueToContext(ctx, {
        received: ctx.data,
        code: ErrorCode.invalid_enum_value,
        options: expectedValues,
      });
      return INVALID;
    }
    return OK(input.data);
  }

  get options() {
    return this._def.values;
  }

  get enum(): Values<T> {
    const enumValues: any = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues as any;
  }

  get Values(): Values<T> {
    const enumValues: any = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues as any;
  }

  get Enum(): Values<T> {
    const enumValues: any = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues as any;
  }

  static create = createZodEnum;
}

/////////////////////////////////////////////
/////////////////////////////////////////////
//////////                         //////////
//////////      ZodNativeEnum      //////////
//////////                         //////////
/////////////////////////////////////////////
/////////////////////////////////////////////
export interface NativeEnumDef<T extends EnumLike = EnumLike>
  extends ValidationTypeDef {
  values: T;
  typeName: ValidationFirstKind.NativeEnum;
}

type EnumLike = { [k: string]: string | number;[nu: number]: string };

export class ValidationNativeEnum<T extends EnumLike> extends SchemaOf<
  T[keyof T],
  NativeEnumDef<T>
> {
  _parse(input: ParseInput): ParseReturnType<T[keyof T]> {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);

    const ctx = this._getOrReturnCtx(input);
    if (
      ctx.parsedType !== ZodParsedType.string &&
      ctx.parsedType !== ZodParsedType.number
    ) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues) as "string",
        received: ctx.parsedType,
        code: ErrorCode.invalid_type,
      });
      return INVALID;
    }

    if (nativeEnumValues.indexOf(input.data) === -1) {
      const expectedValues = util.objectValues(nativeEnumValues);

      addIssueToContext(ctx, {
        received: ctx.data,
        code: ErrorCode.invalid_enum_value,
        options: expectedValues,
      });
      return INVALID;
    }
    return OK(input.data as any);
  }

  get enum() {
    return this._def.values;
  }

  static create = <T extends EnumLike>(
    values: T,
    params?: RawCreateParams
  ): ValidationNativeEnum<T> => {
    return new ValidationNativeEnum({
      values: values,
      typeName: ValidationFirstKind.NativeEnum,
      ...processCreateParams(params),
    });
  };
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////                      //////////
//////////      ZodPromise      //////////
//////////                      //////////
//////////////////////////////////////////
//////////////////////////////////////////
export interface PromiseDef<T extends ValidateAnyType = ValidateAnyType>
  extends ValidationTypeDef {
  type: T;
  typeName: ValidationFirstKind.Promise;
}

export class ValidationPromise<T extends ValidateAnyType> extends SchemaOf<
  Promise<T["_output"]>,
  PromiseDef<T>,
  Promise<T["_input"]>
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { ctx } = this._processInputParams(input);
    if (
      ctx.parsedType !== ZodParsedType.promise &&
      ctx.common.async === false
    ) {
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    const promisified =
      ctx.parsedType === ZodParsedType.promise
        ? ctx.data
        : Promise.resolve(ctx.data);

    return OK(
      promisified.then((data: any) => {
        return this._def.type.parseAsync(data, {
          path: ctx.path,
          errorMap: ctx.common.contextualErrorMap,
        });
      })
    );
  }

  static create = <T extends ValidateAnyType>(
    schema: T,
    params?: RawCreateParams
  ): ValidationPromise<T> => {
    return new ValidationPromise({
      type: schema,
      typeName: ValidationFirstKind.Promise,
      ...processCreateParams(params),
    });
  };
}

//////////////////////////////////////////////
//////////////////////////////////////////////
//////////                          //////////
//////////        ZodEffects        //////////
//////////                          //////////
//////////////////////////////////////////////
//////////////////////////////////////////////

export type Refinement<T> = (arg: T, ctx: RefinementCtx) => any;
export type SuperRefinement<T> = (arg: T, ctx: RefinementCtx) => void;

export type RefinementEffect<T> = {
  type: "refinement";
  refinement: (arg: T, ctx: RefinementCtx) => any;
};
export type TransformEffect<T> = {
  type: "transform";
  transform: (arg: T, ctx: RefinementCtx) => any;
};
export type PreprocessEffect<T> = {
  type: "preprocess";
  transform: (arg: T) => any;
};
export type Effect<T> =
  | RefinementEffect<T>
  | TransformEffect<T>
  | PreprocessEffect<T>;

export interface EffectsDef<T extends ValidateAnyType = ValidateAnyType>
  extends ValidationTypeDef {
  schema: T;
  typeName: ValidationFirstKind.Effects;
  effect: Effect<any>;
}

export class ValidationEffects<
  T extends ValidateAnyType,
  Output = T["_output"],
  Input = T["_input"]
> extends SchemaOf<Output, EffectsDef<T>, Input> {
  innerType() {
    return this._def.schema;
  }

  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { status, ctx } = this._processInputParams(input);

    const effect = this._def.effect || null;

    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data);

      if (ctx.common.async) {
        return Promise.resolve(processed).then((processed) => {
          return this._def.schema._parseAsync({
            data: processed,
            path: ctx.path,
            parent: ctx,
          });
        });
      } else {
        return this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx,
        });
      }
    }

    const checkCtx: RefinementCtx = {
      addIssue: (arg: ErrorData) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      },
    };

    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "refinement") {
      const executeRefinement = (
        acc: unknown
        // effect: RefinementEffect<any>
      ): any => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error(
            "Async refinement encountered during synchronous parse operation. Use .parseAsync instead."
          );
        }
        return acc
      };

      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        });
        if (inner.status === "aborted") return INVALID;
        if (inner.status === "dirty") status.dirty();

        // return value is ignored
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema
          ._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx })
          .then((inner) => {
            if (inner.status === "aborted") return INVALID;
            if (inner.status === "dirty") status.dirty();

            return executeRefinement(inner.value).then(() => {
              return { status: status.value, value: inner.value };
            });
          });
      }
    }

    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        })

        if (!isValid(base)) return base;

        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(
            `Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`
          );
        }

        return { status: status.value, value: result };
      } else {
        return this._def.schema
          ._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx })
          .then((base) => {
            if (!isValid(base)) return base
            return Promise.resolve(effect.transform(base.value, checkCtx)).then(
              (result) => ({ status: status.value, value: result })
            );
          });
      }
    }

    util.assertNever(effect);
  }

  static create = <I extends ValidateAnyType>(
    schema: I,
    effect: Effect<I["_output"]>,
    params?: RawCreateParams
  ): ValidationEffects<I, I["_output"]> => {
    return new ValidationEffects({
      schema,
      typeName: ValidationFirstKind.Effects,
      effect,
      ...processCreateParams(params),
    });
  };

  static createWithPreprocess = <I extends ValidateAnyType>(
    preprocess: (arg: unknown) => unknown,
    schema: I,
    params?: RawCreateParams
  ): ValidationEffects<I, I["_output"], unknown> => {
    return new ValidationEffects({
      schema,
      effect: { type: "preprocess", transform: preprocess },
      typeName: ValidationFirstKind.Effects,
      ...processCreateParams(params),
    });
  };
}

export { ValidationEffects as ZodTransformer };

///////////////////////////////////////////
///////////////////////////////////////////
//////////                       //////////
//////////      ZodOptional      //////////
//////////                       //////////
///////////////////////////////////////////
///////////////////////////////////////////
export interface OptionalDef<T extends ValidateAnyType = ValidateAnyType>
  extends ValidationTypeDef {
  innerType: T;
  typeName: ValidationFirstKind.Optional;
}

export type ValidationOptionalType<T extends ValidateAnyType> = ValidationOptional<T>;

export class ValidationOptional<T extends ValidateAnyType> extends SchemaOf<
  T["_output"] | undefined,
  OptionalDef<T>,
  T["_input"] | undefined
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(undefined);
    }
    return this._def.innerType._parse(input);
  }

  unwrap() {
    return this._def.innerType;
  }

  static create = <T extends ValidateAnyType>(
    type: T,
    params?: RawCreateParams
  ): ValidationOptional<T> => {
    return new ValidationOptional({
      innerType: type,
      typeName: ValidationFirstKind.Optional,
      ...processCreateParams(params),
    }) as any;
  };
}

///////////////////////////////////////////
///////////////////////////////////////////
//////////                       //////////
//////////      ZodNullable      //////////
//////////                       //////////
///////////////////////////////////////////
///////////////////////////////////////////
export interface NullableDef<T extends ValidateAnyType = ValidateAnyType>
  extends ValidationTypeDef {
  innerType: T;
  typeName: ValidationFirstKind.Nullable;
}

export type ValidationNullableType<T extends ValidateAnyType> = ValidationNullable<T>;

export class ValidationNullable<T extends ValidateAnyType> extends SchemaOf<
  T["_output"] | null,
  NullableDef<T>,
  T["_input"] | null
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }

  unwrap() {
    return this._def.innerType;
  }

  static create = <T extends ValidateAnyType>(
    type: T,
    params?: RawCreateParams
  ): ValidationNullable<T> => {
    return new ValidationNullable({
      innerType: type,
      typeName: ValidationFirstKind.Nullable,
      ...processCreateParams(params),
    }) as any;
  };
}

////////////////////////////////////////////
////////////////////////////////////////////
//////////                        //////////
//////////       ZodDefault       //////////
//////////                        //////////
////////////////////////////////////////////
////////////////////////////////////////////
export interface DefaultDef<T extends ValidateAnyType = ValidateAnyType>
  extends ValidationTypeDef {
  innerType: T;
  defaultValue: () => util.noUndefined<T["_input"]>;
  typeName: ValidationFirstKind.Default;
}

export class ValidationDefault<T extends ValidateAnyType> extends SchemaOf<
  util.noUndefined<T["_output"]>,
  DefaultDef<T>,
  T["_input"] | undefined
> {
  _parse(input: ParseInput): ParseReturnType<this["_output"]> {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx,
    });
  }

  removeDefault() {
    return this._def.innerType;
  }

  static create = <T extends ValidateAnyType>(
    type: T,
    params?: RawCreateParams
  ): ValidationOptional<T> => {
    return new ValidationOptional({
      innerType: type,
      typeName: ValidationFirstKind.Optional,
      ...processCreateParams(params),
    }) as any;
  };
}

//////////////////////////////////////
//////////////////////////////////////
//////////                  //////////
//////////      ZodNaN      //////////
//////////                  //////////
//////////////////////////////////////
//////////////////////////////////////

export interface NaNDef extends ValidationTypeDef {
  typeName: ValidationFirstKind.NaN;
}

export class ValidationNaN extends SchemaOf<number, NaNDef> {
  _parse(input: ParseInput): ParseReturnType<any> {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    return { status: "valid", value: input.data };
  }

  static create = (params?: RawCreateParams): ValidationNaN => {
    return new ValidationNaN({
      typeName: ValidationFirstKind.NaN,
      ...processCreateParams(params),
    });
  };
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////                      //////////
//////////      ZodBranded      //////////
//////////                      //////////
//////////////////////////////////////////
//////////////////////////////////////////

export interface BrandedDef<T extends ValidateAnyType> extends ValidationTypeDef {
  type: T;
  typeName: ValidationFirstKind.Branded;
}

export const BRAND: unique symbol = Symbol("zod_brand");
export type BRAND<T extends string | number | symbol> = {
  [BRAND]: { [k in T]: true };
};

export class ValidationBranded<
  T extends ValidateAnyType,
  B extends string | number | symbol
> extends SchemaOf<
  T["_output"] & BRAND<B>,
  BrandedDef<T>,
  T["_input"] & BRAND<B>
> {
  _parse(input: ParseInput): ParseReturnType<any> {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx,
    });
  }

  unwrap() {
    return this._def.type;
  }
}

export const Custom = <T>(
  check?: (data: unknown) => any,
  params: Parameters<ValidateAnyType["refine"]>[1] = {},
  fatal?: boolean
): SchemaOf<T> => {
  if (check)
    return ValidationAny.create().superRefine((data, ctx) => {
      if (!check(data)) {
        const p = typeof params === "function" ? params(data) : params;
        const p2 = typeof p === "string" ? { message: p } : p;
        ctx.addIssue({ code: "custom", ...p2, fatal });
      }
    });
  return ValidationAny.create();
};

export { SchemaOf as Schema, SchemaOf as ZodSchema };

export const Late = {
  object: ValidationObject.lazyCreate,
};

export enum ValidationFirstKind {
  String = "String",
  Number = "Number",
  NaN = "NaN",
  BigInt = "BigInt",
  Boolean = "Boolean",
  Date = "Date",
  Undefined = "Undefined",
  Null = "Null",
  Any = "Any",
  Unknown = "Unknown",
  Never = "Never",
  Void = "Void",
  Array = "Array",
  Object = "Object",
  Union = "Union",
  DiscriminatedUnion = "DiscriminatedUnion",
  Intersection = "Intersection",
  Tuple = "Tuple",
  Record = "Record",
  Map = "Map",
  Set = "Set",
  Function = "Function",
  Lazy = "Lazy",
  Literal = "Literal",
  Enum = "Enum",
  Effects = "Effects",
  NativeEnum = "NativeEnum",
  Optional = "Optional",
  Nullable = "Nullable",
  Default = "Default",
  Promise = "Promise",
  Branded = "Branded",
}
export type ValidationFirstSchemaType =
  | ValidationString
  | ValidationNumber
  | ValidationNaN
  | ValidationBigInt
  | ValidationBoolean
  | ValidationDate
  | ValidationUndefined
  | ValidationNull
  | ValidationAny
  | ValidationUnknown
  | ValidationNever
  | ValidationVoid
  | ValidationArray<any, any>
  | ValidationObject<any, any, any, any, any>
  | ValidationUnion<any>
  | ValidationDiscriminatedUnion<any, any, any>
  | ValidationIntersection<any, any>
  | ValidationTuple<any, any>
  | ValidationRecord<any, any>
  | ValidationMap<any>
  | ValidatioSet<any>
  | ValidationFunction<any, any>
  | ValidationLazy<any>
  | ValidationLiteral<any>
  | ValidationEnum<any>
  | ValidationEffects<any, any, any>
  | ValidationNativeEnum<any>
  | ValidationOptional<any>
  | ValidationNullable<any>
  | ValidationDefault<any>
  | ValidationPromise<any>
  | ValidationBranded<any, any>;

const instanceOfType = <T extends new (...args: any[]) => any>(
  cls: T,
  params: Parameters<ValidateAnyType["refine"]>[1] = {
    message: `Input not instance of ${cls.name}`,
  }
) => Custom<InstanceType<T>>((data) => data instanceof cls, params, true);

const stringType = ValidationString.create;
const numberType = ValidationNumber.create;
const nanType = ValidationNaN.create;
const bigIntType = ValidationBigInt.create;
const booleanType = ValidationBoolean.create;
const dateType = ValidationDate.create;
const undefinedType = ValidationUndefined.create;
const nullType = ValidationNull.create;
const anyType = ValidationAny.create;
const unknownType = ValidationUnknown.create;
const neverType = ValidationNever.create;
const voidType = ValidationVoid.create;
const arrayType = ValidationArray.create;
const objectType = ValidationObject.create;
const strictObjectType = ValidationObject.strictCreate;
const unionType = ValidationUnion.create;
const discriminatedUnionType = ValidationDiscriminatedUnion.create;
const intersectionType = ValidationIntersection.create;
const tupleType = ValidationTuple.create;
const recordType = ValidationRecord.create;
const mapType = ValidationMap.create;
const setType = ValidatioSet.create;
const functionType = ValidationFunction.create;
const lazyType = ValidationLazy.create;
const literalType = ValidationLiteral.create;
const enumType = ValidationEnum.create;
const nativeEnumType = ValidationNativeEnum.create;
const promiseType = ValidationPromise.create;
const effectsType = ValidationEffects.create;
const optionalType = ValidationOptional.create;
const nullableType = ValidationNullable.create;
const preprocessType = ValidationEffects.createWithPreprocess;
const ostring = () => stringType().optional();
const onumber = () => numberType().optional();
const oboolean = () => booleanType().optional();

export {
  anyType as any,
  arrayType as array,
  bigIntType as bigint,
  booleanType as boolean,
  dateType as date,
  discriminatedUnionType as discriminatedUnion,
  effectsType as effect,
  enumType as enum,
  functionType as function,
  instanceOfType as instanceof,
  intersectionType as intersection,
  lazyType as lazy,
  literalType as literal,
  mapType as map,
  nanType as nan,
  nativeEnumType as nativeEnum,
  neverType as never,
  nullType as null,
  nullableType as nullable,
  numberType as number,
  objectType as object,
  oboolean,
  onumber,
  optionalType as optional,
  ostring,
  preprocessType as preprocess,
  promiseType as promise,
  recordType as record,
  setType as set,
  strictObjectType as strictObject,
  stringType as string,
  effectsType as transformer,
  tupleType as tuple,
  undefinedType as undefined,
  unionType as union,
  unknownType as unknown,
  voidType as void,
};

export const NEVER = INVALID as never;
