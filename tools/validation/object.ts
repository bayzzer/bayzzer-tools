import { addIssueToContext, INVALID, ValidationInput, ParseReturnType, ParseStatus } from "./utils/parseUtil";
import { util, ParsedType } from "./utils/util";
import { processCreateParams, RawCreateParams, RawShape, SchemaOf, ValidateAnyType, ValidateInputLazyPath, ValidationKind, ValidationTypeDef } from "./schema";
import { ErrorCode } from "./error";

export namespace ObjectUtil {
  

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

export interface ObjectDef<
  T extends RawShape = RawShape,
> extends ValidationTypeDef {
  name: ValidationKind.Object;
  shape: () => T
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
  ValidateAnyType,
  any,
  any
>
export class ValidationObject<
  T extends RawShape,
  Catchall extends ValidateAnyType = ValidateAnyType,
  Output = ObjectOutputType<T, Catchall>,
  Input = ObjectInputType<T, Catchall>
> extends SchemaOf<Output, ObjectDef<T>, Input> {
  private _cached: { shape: T; keys: string[] } | null = null;

  private _getCached(): { shape: T; keys: string[] } {
    if (this._cached !== null) return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    return (this._cached = { shape, keys })
  }

  _validation(input: ValidationInput): ParseReturnType<this["_output"]> {
    const parsedType = this._getType(input);
    if (parsedType !== ParsedType.object) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ParsedType.object,
        received: ctx.parsedType,
      });
      return INVALID
    }

    const { status, ctx } = this._processInputParams(input);

    const { shape, keys: shapeKeys } = this._getCached()

    const pairs: {
      key: ParseReturnType<any>;
      value: ParseReturnType<any>;
      alwaysSet?: boolean;
    }[] = []
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._validation(
          new ValidateInputLazyPath(ctx, value, ctx.path, key)
        ),
        alwaysSet: key in ctx.data,
      })
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
  
  static create = <T extends RawShape>(
    shape: T,
    params?: RawCreateParams
  ): ValidationObject<T> => {
    return new ValidationObject({
      shape: () => shape,
      name: ValidationKind.Object,
      ...processCreateParams(params),
    }) as any;
  }
}

export type ValidationAnyObject = ValidationObject<any, any, any>