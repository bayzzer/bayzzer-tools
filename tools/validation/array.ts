import { addError, INVALID, ValidateInput, ValidationResult, ValidationStatus } from "./utils/validation_util";
import { ValidatedType } from "./utils/util";
import { ValidateInputPath, SchemaKind, SchemaOf, SchemaTypeAny, SchemaTypeDef } from "./schema";
import { ErrorCode } from "./validation_error";
import { errorUtil } from "./utils/error_util";

export interface ArrayDef<T extends SchemaTypeAny = SchemaTypeAny>
  extends SchemaTypeDef {
  type: T;
  typeName: SchemaKind.Array;
  minLength: { value: number; message?: string } | null;
  maxLength: { value: number; message?: string } | null;
}

export type ArrayCardinality = "many" | "atleastone";
type arrayOutputType<
  T extends SchemaTypeAny,
  Cardinality extends ArrayCardinality = "many"
> = Cardinality extends "atleastone"
  ? [T["_output"], ...T["_output"][]]
  : T["_output"][];

export class Array<
  T extends SchemaTypeAny,
  Cardinality extends ArrayCardinality = "many"
> extends SchemaOf<
  arrayOutputType<T, Cardinality>,
  ArrayDef<T>,
  Cardinality extends "atleastone"
    ? [T["_input"], ...T["_input"][]]
    : T["_input"][]
> {
  _validation(input: ValidateInput): ValidationResult<this["_output"]> {
    const { ctx, status } = this._processInputParams(input);

    const def = this._def;

    if (ctx.parsedType !== ValidatedType.array) {
      addError(ctx, {
        code: ErrorCode.invalid_type,
        expected: ValidatedType.array,
        received: ctx.parsedType,
      });
      return INVALID;
    }

    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addError(ctx, {
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
        addError(ctx, {
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
          return def.type._validationAsync(
            new ValidateInputPath(ctx, item, ctx.path, i)
          );
        })
      ).then((result) => {
        return ValidationStatus.mergeArray(status, result);
      });
    }

    const result = (ctx.data as any[]).map((item, i) => {
      return def.type._validationSync(
        new ValidateInputPath(ctx, item, ctx.path, i)
      );
    });

    return ValidationStatus.mergeArray(status, result);
  }  

  min(minLength: number, message?: errorUtil.ErrorMessage): this {
    return new Array({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) },
    }) as any;
  }

  max(maxLength: number, message?: errorUtil.ErrorMessage): this {
    return new Array({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) },
    }) as any;
  }

  length(len: number, message?: errorUtil.ErrorMessage): this {
    return this.min(len, message).max(len, message) as any;
  }

  nonempty(message?: errorUtil.ErrorMessage): Array<T, "atleastone"> {
    return this.min(1, message) as any;
  }

  static create = <T extends SchemaTypeAny>(
    schema: T,
  ): Array<T> => {
    return new Array({
      type: schema,
      minLength: null,
      maxLength: null,
      typeName: SchemaKind.Array
    });
  };
}