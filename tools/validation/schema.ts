import { Array } from "./array";
import {
  addError,
  ValidationAsync,
  INVALID,
  isAsync,
  isValid,
  ValidationContext,
  ValidateInput,
  ValidationParams,
  ValidationPath,
  ValidationResult,
  ValidationStatus,
  ValidationSync,
} from "./utils/validation_util";
import { getValidatedType, util } from "./utils/util"
import {
  ErrorData,
  CustomValidation,
  Validation,
  ErrorMap,
  ErrorCode,
} from "./validation_error";

export type RefinementCtx = {
  addIssue: (arg: ErrorData) => void
  path: (string | number)[]
};
export type SchemaRawShape = { [k: string]: SchemaTypeAny }
export type SchemaTypeAny = SchemaOf<any, any, any>

type CustomErrorParams = Partial<util.Omit<CustomValidation, "code">>;
export interface SchemaTypeDef {
  errorMap?: ErrorMap
}

export class ValidateInputPath implements ValidateInput {
  parent: ValidationContext;
  data: any;
  _path: ValidationPath;
  _key: string | number | (string | number)[];
  constructor(
    parent: ValidationContext,
    value: any,
    path: ValidationPath,
    key: string | number | (string | number)[]
  ) {
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    return this._path.concat(this._key);
  }
}

const handleResult = <Input, Output>(
  ctx: ValidationContext,
  result: ValidationSync<Output>
):
  | { ok: true; data: Output }
  | { ok: false; validation: Validation<Input> } => {
  if (isValid(result)) {
    return { ok: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed");
    }
    const validation = new Validation(ctx.common.issues);
    return { ok: false, validation };
  }
}

export type SchemaOk<Output> = { ok: true; data: Output };
export type SchemaError<Input> = { ok: false; validation: Validation<Input> };

export type SchemaValidation<Input, Output> =
  | SchemaOk<Output>
  | SchemaError<Input>;

export abstract class SchemaOf<
  Output = any,
  Def extends SchemaTypeDef = SchemaTypeDef,
  Input = Output
> {
  readonly _output!: Output;
  readonly _input!: Input;
  readonly _def!: Def;

  abstract _validation(input: ValidateInput): ValidationResult<Output>


  _getOrReturnCtx(
    input: ValidateInput,
    ctx?: ValidationContext | undefined
  ): ValidationContext {
    return (
      ctx || {
        common: input.parent.common,
        data: input.data,

        type: getValidatedType(input.data),

        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent,
      }
    );
  }

  _processInputParams(input: ValidateInput): {
    status: ValidationStatus;
    ctx: ValidationContext;
  } {
    return {
      status: new ValidationStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,

        type: getValidatedType(input.data),

        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent,
      },
    };
  }

  _validationSync(input: ValidateInput): ValidationSync<Output> {
    const result = this._validation(input);
    if (isAsync(result)) {
      throw new Error("Synchronous validation in promise.");
    }
    return result;
  }

  _validationAsync(input: ValidateInput): ValidationAsync<Output> {
    const result = this._validation(input);
    return Promise.resolve(result);
  }

  async validate(
    data: unknown,
    params?: Partial<ValidationParams>
  ): Promise<SchemaValidation<Input, Output>> {
    const ctx: ValidationContext = {
      common: {
        issues: [],
        errorMap: params?.errorMap,
        async: true,
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      type: getValidatedType(data),
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
  ): Effect<this, RefinedOutput, Input>;
  add(
    check: (arg: Output) => unknown | Promise<unknown>,
    message?: string | CustomErrorParams | ((arg: Output) => CustomErrorParams)
  ): Effect<this, Output, Input>;
  add(
    check: (arg: Output) => unknown,
    message?: string | CustomErrorParams | ((arg: Output) => CustomErrorParams)
  ): Effect<this, Output, Input> {
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
  ): Effect<this, RefinedOutput, Input>;
  refinement(
    check: (arg: Output) => boolean,
    refinementData: ErrorData | ((arg: Output, ctx: RefinementCtx) => ErrorData)
  ): Effect<this, Output, Input>;
  refinement(
    check: (arg: Output) => unknown,
    refinementData: ErrorData | ((arg: Output, ctx: RefinementCtx) => ErrorData)
  ): Effect<this, Output, Input> {
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
  ): Effect<this, Output, Input> {
    return new Effect({
      schema: this,
      type: SchemaKind.Effect,
      effect: { type: "refinement", refinement },
    });
  }

  constructor(def: Def) {
    this._def = def
    this.validate = this.validate.bind(this);
    this.add = this.add.bind(this);
    this.array = this.array.bind(this);
    this.convert = this.convert.bind(this)
  }

  array(): Array<this> {
    return Array.create(this)
  }

  convert<NewOut>(
    convert: (arg: Output, ctx: RefinementCtx) => NewOut | Promise<NewOut>
  ): Effect<this, NewOut> {
    return new Effect({
      schema: this,
      type: SchemaKind.Effect,
      effect: { type: "convert", convert },
    }) as any;
  }
}

type RefinementEffect<T> = {
  type: "refinement";
  refinement: (arg: T, ctx: RefinementCtx) => any;
};
type ConvertEffect<T> = {
  type: "convert";
  convert: (arg: T, ctx: RefinementCtx) => any;
};

type EffectType<T> =
  | RefinementEffect<T>
  | ConvertEffect<T>

interface EffectDef<T extends SchemaTypeAny = SchemaTypeAny>
  extends SchemaTypeDef {
  schema: T;
  type: SchemaKind.Effect;
  effect: EffectType<any>;
}
export class Effect<
  T extends SchemaTypeAny,
  Output = T["_output"],
  Input = T["_input"]
> extends SchemaOf<Output, EffectDef<T>, Input> {
  innerType() {
    return this._def.schema;
  }

  _validation(input: ValidateInput): ValidationResult<this["_output"]> {
    const { status, ctx } = this._processInputParams(input);

    const effect = this._def.effect || null

    const checkCtx: RefinementCtx = {
      addIssue: (arg: ErrorData) => {
        addError(ctx, arg);
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
            "Async operation."
          );
        }
        return acc;
      };

      if (ctx.common.async === false) {
        const inner = this._def.schema._validationSync({
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
          ._validationAsync({ data: ctx.data, path: ctx.path, parent: ctx })
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
        const base = this._def.schema._validationSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        })

        if (!isValid(base)) return base;

        const result = effect.convert(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(
            `Async operation`
          );
        }

        return { status: status.value, value: result };
      } else {
        return this._def.schema
          ._validationAsync({ data: ctx.data, path: ctx.path, parent: ctx })
          .then((base) => {
            if (!isValid(base)) return base
            return Promise.resolve(effect.convert(base.value, checkCtx)).then(
              (result) => ({ status: status.value, value: result })
            );
          });
      }
    }

    util.assertNever(effect)
  }

  static create = <I extends SchemaTypeAny>(
    schema: I,
    effect: EffectType<I["_output"]>
  ): Effect<I, I["_output"]> => {
    return new Effect({
      schema,
      type: SchemaKind.Effect,
      effect
    });
  };
}

export enum SchemaKind {
  String = "String",
  Array = "Array",
  Object = "Object",
  Effect = "Effect",
}