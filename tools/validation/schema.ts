import { ValidationArray } from "./array"
import {
  addIssueToContext,
  AsyncParseReturnType,
  INVALID,
  isAsync,
  isValid,
  ValidationContext,
  ValidationInput,
  ParseParams,
  ParsePath,
  ParseReturnType,
  ParseStatus,
  SyncParseReturnType,
} from "./helpers/parseUtil";
import { getParsedType, util } from "./helpers/util"
import {
  ErrorData,
  CustomError,
  ValidateError,
  ErrorMap,
  ErrorCode,
} from "./error";

export type RefinementCtx = {
  addIssue: (arg: ErrorData) => void
  path: (string | number)[]
}
export type RawShape = { [k: string]: ValidateAnyType }
export type ValidateAnyType = SchemaOf<any, any, any>
export type CustomErrorParams = Partial<util.Omit<CustomError, "code">>
export interface ValidationTypeDef {
  errorMap?: ErrorMap
  description?: string
}
export class ValidateInputLazyPath implements ValidationInput {
  parent: ValidationContext;
  data: any;
  _path: ParsePath;
  _key: string | number | (string | number)[]
  constructor(
    parent: ValidationContext,
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
  ctx: ValidationContext,
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

export type RawCreateParams =
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

export function processCreateParams(params: RawCreateParams): ProcessedCreateParams {
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

  abstract _validation(input: ValidationInput): ParseReturnType<Output>

  _getType(input: ValidationInput): string {
    return getParsedType(input.data)
  }

  _getOrReturnCtx(
    input: ValidationInput,
    ctx?: ValidationContext | undefined
  ): ValidationContext {
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

  _processInputParams(input: ValidationInput): {
    status: ParseStatus
    ctx: ValidationContext
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

  _validateSync(input: ValidationInput): SyncParseReturnType<Output> {
    const result = this._validation(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }

  _validateAsync(input: ValidationInput): AsyncParseReturnType<Output> {
    const result = this._validation(input);

    return Promise.resolve(result);
  }  

  async validate(
    data: unknown,
    params?: Partial<ParseParams>
  ): Promise<SafeParseReturnType<Input, Output>> {
    const ctx: ValidationContext = {
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

    const maybeAsyncResult = this._validation({ data, path: [], parent: ctx });
    const result = await (isAsync(maybeAsyncResult)
      ? maybeAsyncResult
      : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }

  add<RefinedOutput extends Output>(
    check: (arg: Output) => arg is RefinedOutput,
    message?: string | CustomErrorParams | ((arg: Output) => CustomErrorParams)
  ): ValidationEffects<this, RefinedOutput, Input>;
  add(
    check: (arg: Output) => unknown | Promise<unknown>,
    message?: string | CustomErrorParams | ((arg: Output) => CustomErrorParams)
  ): ValidationEffects<this, Output, Input>;
  add(
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

  _refinement(
    refinement: RefinementEffect<Output>["refinement"]
  ): ValidationEffects<this, Output, Input> {
    return new ValidationEffects({
      schema: this,
      name: ValidationKind.Effects,
      effect: { type: "refinement", refinement },
    });
  }

  constructor(def: Def) {
    this._def = def    
    this.validate = this.validate.bind(this)
    this.add = this.add.bind(this)
    this.array = this.array.bind(this)
    this.transform = this.transform.bind(this)
  }

  array(): ValidationArray<this> {
    return ValidationArray.create(this);
  }

  transform<NewOut>(
    transform: (arg: Output, ctx: RefinementCtx) => NewOut | Promise<NewOut>
  ): ValidationEffects<this, NewOut> {
    return new ValidationEffects({
      schema: this,
      name: ValidationKind.Effects,
      effect: { type: "transform", transform },
    }) as any;
  } 
}

export type RefinementEffect<T> = {
  type: "refinement";
  refinement: (arg: T, ctx: RefinementCtx) => any;
};
export type TransformEffect<T> = {
  type: "transform";
  transform: (arg: T, ctx: RefinementCtx) => any;
};

export type Effect<T> =
  | RefinementEffect<T>
  | TransformEffect<T>

export interface EffectsDef<T extends ValidateAnyType = ValidateAnyType>
  extends ValidationTypeDef {
  schema: T;
  name: ValidationKind.Effects;
  effect: Effect<any>;
}

export class ValidationEffects<
  T extends ValidateAnyType,
  Output = T["_output"],
  Input = T["_input"]
> extends SchemaOf<Output, EffectsDef<T>, Input> {
  
  _validation(input: ValidationInput): ParseReturnType<this["_output"]> {
    const { status, ctx } = this._processInputParams(input);

    const effect = this._def.effect || null;    

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
        const inner = this._def.schema._validateSync({
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
          ._validateAsync({ data: ctx.data, path: ctx.path, parent: ctx })
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
        const base = this._def.schema._validateSync({
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
          ._validateAsync({ data: ctx.data, path: ctx.path, parent: ctx })
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
      name: ValidationKind.Effects,
      effect,
      ...processCreateParams(params),
    });
  }  
}

export enum ValidationKind {
  String = "String",  
  Array = "Array",
  Object = "Object",  
  Effects = "Effects"  
}