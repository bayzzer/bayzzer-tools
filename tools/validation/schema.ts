import { ValidationArray } from "./array";
import { AsyncParseReturnType, isAsync, isValid, ParseContext, ParseInput, ParseParams, ParseReturnType, ParseStatus, SyncParseReturnType } from "./helpers/parseUtil"
import { getParsedType } from "./helpers/util"
import { CustomErrorParams, RefinementCtx, RefinementEffect, SafeParseReturnType, ValidationEffects, ValidationFirstKind, ValidationTypeDef } from "./types"
import { ErrorCode, ErrorData, ValidateError } from "./error";

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