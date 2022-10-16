import { errorUtil } from "./helpers/errorUtil";
import {
  addIssueToContext,
  AsyncParseReturnType,
  INVALID,
  isAsync,
  isValid,
  OK,
  ParseContext,
  ParseInput,
  ParseParams,
  ParsePath,
  ParseReturnType,
  ParseStatus,
  SyncParseReturnType,
} from "./helpers/parseUtil";
import { getParsedType, util, ZodParsedType } from "./helpers/util";
import {
  ErrorData,
  StringValidation,
  CustomError,
  ValidateError,
  ErrorMap,
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
    this.array = this.array.bind(this);
    this.transform = this.transform.bind(this);
    this.describe = this.describe.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
  }

  array(): ValidationArray<this> {
    return ValidationArray.create(this);
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
      Def["unknownKeys"]
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
> extends ValidationTypeDef {
  typeName: ValidationFirstKind.Object;
  shape: () => T;
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

export type SomeObject = ValidationObject<
  RawShape,
  UnknownKeysParam,
  ValidateAnyType,
  any,
  any
>
export class ValidationObject<
  T extends RawShape,
  UnknownKeys extends UnknownKeysParam = "strip",
  Catchall extends ValidateAnyType = ValidateAnyType,
  Output = ObjectOutputType<T, Catchall>,
  Input = ObjectInputType<T, Catchall>
> extends SchemaOf<Output, ObjectDef<T, UnknownKeys>, Input> {
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

  augment = AugmentFactory<ObjectDef<T, UnknownKeys>>(this._def);
  extend = AugmentFactory<ObjectDef<T, UnknownKeys>>(this._def);

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
      Incoming["_def"]["unknownKeys"]
    > {
    // const mergedShape = objectUtil.mergeShapes(
    //   this._def.shape(),
    //   merging._def.shape()
    // );
    const merged: any = new ValidationObject({
      unknownKeys: merging._def.unknownKeys,
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
    }) as any;
  }    

  static create = <T extends RawShape>(
    shape: T,
    params?: RawCreateParams
  ): ValidationObject<T> => {
    return new ValidationObject({
      shape: () => shape,
      unknownKeys: "strip",
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
      typeName: ValidationFirstKind.Object,
      ...processCreateParams(params),
    }) as any;
  };
}

export type ValidationAnyObject = ValidationObject<any, any, any>

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

export const Late = {
  object: ValidationObject.lazyCreate,
};

export enum ValidationFirstKind {
  String = "String",  
  Any = "Any",  
  Array = "Array",
  Object = "Object",  
  Effects = "Effects"  
}
export type ValidationFirstSchemaType =
  | ValidationString
  | ValidationArray<any, any>
  | ValidationObject<any, any, any, any, any>
  | ValidationEffects<any, any, any>

export const NEVER = INVALID as never;
