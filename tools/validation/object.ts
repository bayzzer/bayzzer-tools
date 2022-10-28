import { ValidationInput, ValidateReturn, ValidateStatus } from "./utils/validationUtil";
import { util } from "./utils/util";
import { RawShape, SchemaOf, ValidateAnyType, ValidateInputLazyPath, ValidationKind, ValidationTypeDef } from "./schema";

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
  export type Flatten<T extends object> = Identity<{ [k in keyof T]: T[k] }>  
}
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
  Catch extends ValidateAnyType
> = ValidateAnyType extends Catch
  ? BaseObjectOutputType<Shape>
  : ObjectUtil.Flatten<
    BaseObjectOutputType<Shape> & { [k: string]: Catch["_output"] }
  >;

export type BaseObjectInputType<Shape extends RawShape> = ObjectUtil.Flatten<
  ObjectUtil.AddQuestionMarks<{
    [k in keyof Shape]: Shape[k]["_input"];
  }>
>;

export type ObjectInputType<
  Shape extends RawShape,
  Catch extends ValidateAnyType
> = ValidateAnyType extends Catch
  ? BaseObjectInputType<Shape>
  : ObjectUtil.Flatten<
    BaseObjectInputType<Shape> & { [k: string]: Catch["_input"] }
  >
export class ValidationObject<
  T extends RawShape,
  Catch extends ValidateAnyType = ValidateAnyType,
  Output = ObjectOutputType<T, Catch>,
  Input = ObjectInputType<T, Catch>
> extends SchemaOf<Output, ObjectDef<T>, Input> {
  private _cached: { shape: T; keys: string[] } | null = null;

  private _getCached(): { shape: T; keys: string[] } {
    if (this._cached !== null) return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    return (this._cached = { shape, keys })
  }

  _validation(input: ValidationInput): ValidateReturn<this["_output"]> {
   
    var obj = input.data
    if (obj === undefined || obj == null) {
      input.data =  {}
    }   

    const { status, ctx } = this._processInputParams(input)

    const { shape, keys: shapeKeys } = this._getCached()

    const pairs: {
      key: ValidateReturn<any>;
      value: ValidateReturn<any>;
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
          return ValidateStatus.mergeObjectSync(status, syncPairs);
        });
    } else {
      return ValidateStatus.mergeObjectSync(status, pairs as any);
    }
  }    
  
  static create = <T extends RawShape>(
    shape: T,
  ): ValidationObject<T> => {
    return new ValidationObject({
      shape: () => shape,
      name: ValidationKind.Object
    }) as any
  }
}

export type ValidationAnyObject = ValidationObject<any, any, any>