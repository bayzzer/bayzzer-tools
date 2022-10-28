import { ValidationArray } from "./array"
import {
  addIssueToContext,
  ValidateAsync,
  INVALID,
  isAsync,
  isValid,
  ValidationContext,
  ValidationInput,
  ValidationParams,
  ValidationPath,
  ValidateReturn,
  ValidateStatus,
  ValidateSync,
} from "./utils/validationUtil";
import { getValidationType, util } from "./utils/util"
import {
  ErrorData,
  CustomError,
  //ValidateError,
  ErrorMap,
  ErrorCode,
  Issue,
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
  _path: ValidationPath;
  _key: string | number | (string | number)[]
  constructor(
    parent: ValidationContext,
    value: any,
    path: ValidationPath,
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
  result: ValidateSync<Output>
):
  | { ok: true; data: Output }
  | { ok: false; errors: Issue[] } => {
  if (isValid(result)) {
    return { ok: true, data: result.value };
  } else {
    var issuesCount = ctx.common.issues.length
    if (!issuesCount) {
      throw new Error(`Validation failed, without errors`)
    }
    return { ok: false, errors: ctx.common.issues }
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

export type ValidationSuccess<Output> = { ok: true; data: Output }
export type ValidationError<Input> = { ok: false; errors: Issue[] }

export type ValidationReturn<Input, Output> =
  | ValidationSuccess<Output>
  | ValidationError<Input>

export abstract class SchemaOf<
  Output = any,
  Def extends ValidationTypeDef = ValidationTypeDef,
  Input = Output
> {
  readonly _type!: Output
  readonly _output!: Output
  readonly _input!: Input
  readonly _def!: Def

  abstract _validation(input: ValidationInput): ValidateReturn<Output>

  _getType(input: ValidationInput): string {
    return getValidationType(input.data)
  }

  _getOrReturnCtx(
    input: ValidationInput,
    ctx?: ValidationContext | undefined
  ): ValidationContext {
    return (
      ctx || {
        common: input.parent.common,
        data: input.data,

        parsedType: getValidationType(input.data),

        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent,
      }
    )
  }

  _processInputParams(input: ValidationInput): {
    status: ValidateStatus
    ctx: ValidationContext
  } {
    return {
      status: new ValidateStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,

        parsedType: getValidationType(input.data),

        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent,
      },
    };
  }

  _validateSync(input: ValidationInput): ValidateSync<Output> {
    const result = this._validation(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }

  _validateAsync(input: ValidationInput): ValidateAsync<Output> {
    const result = this._validation(input);

    return Promise.resolve(result);
  }

  async validate(
    data: unknown,
    params?: Partial<ValidationParams>
  ): Promise<ValidationReturn<Input, Output>> {
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
      parsedType: getValidationType(data),
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
        return message(val)
      } else {
        return message
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
    })
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
    this.convert = this.convert.bind(this)
  }

  array(): ValidationArray<this> {
    return ValidationArray.create(this)
  }  

  convert<NewOut>(
    convert: (arg: Output, ctx: RefinementCtx) => NewOut | Promise<NewOut>
  ): ValidationEffects<this, NewOut> {
    return new ValidationEffects({
      schema: this,
      name: ValidationKind.Effects,
      effect: { type: "convert", convert: convert },
    }) as any;
  }
}

export type RefinementEffect<T> = {
  type: "refinement";
  refinement: (arg: T, ctx: RefinementCtx) => any;
};
export type ConvertEffect<T> = {
  type: "convert";
  convert: (arg: T, ctx: RefinementCtx) => any;
};

export type Effect<T> =
  | RefinementEffect<T>
  | ConvertEffect<T>

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

  _validation(input: ValidationInput): ValidateReturn<this["_output"]> {
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
            "Refinement async operation."
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

    if (effect.type === "convert") {
      if (ctx.common.async === false) {
        const base = this._def.schema._validateSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        })

        if (!isValid(base)) return base;

        const result = effect.convert(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(
            `Convert async operation.`
          );
        }

        return { status: status.value, value: result };
      } else {
        return this._def.schema
          ._validateAsync({ data: ctx.data, path: ctx.path, parent: ctx })
          .then((base) => {
            if (!isValid(base)) return base
            return Promise.resolve(effect.convert(base.value, checkCtx)).then(
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