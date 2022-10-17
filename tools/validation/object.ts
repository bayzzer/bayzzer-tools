import { errorUtil } from "./helpers/errorUtil";
import { addIssueToContext, INVALID, ParseInput, ParseReturnType, ParseStatus } from "./helpers/parseUtil";
import { util, ZodParsedType } from "./helpers/util";
import { processCreateParams, RawCreateParams, RawShape, SchemaOf, ValidateAnyType, ValidateInputLazyPath, ValidationFirstKind, ValidationTypeDef } from "./types";
import { ErrorCode } from "./ZodError";

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
  
   
  }
  
  export type ValidationAnyObject = ValidationObject<any, any, any>