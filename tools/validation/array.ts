import { errorUtil } from "./helpers/errorUtil";
import { addIssueToContext, INVALID, ValidationInput, ParseReturnType, ParseStatus } from "./helpers/parseUtil";
import { ParsedType } from "./helpers/util";
import { processCreateParams, RawCreateParams, SchemaOf, ValidateAnyType, ValidateInputLazyPath, ValidationKind, ValidationTypeDef } from "./schema";
import { ErrorCode } from "./error";

export interface ArrayDef<T extends ValidateAnyType = ValidateAnyType>
  extends ValidationTypeDef {
  type: T;
  name: ValidationKind.Array;
  minLength: { value: number; message?: string } | null;
  maxLength: { value: number; message?: string } | null;
}

export type ArrayCardinality = "many" | "atleastone";
type ArrayOutputType<
  T extends ValidateAnyType,
  Cardinality extends ArrayCardinality = "many"
> = Cardinality extends "atleastone"
  ? [T["_output"], ...T["_output"][]]
  : T["_output"][];

export class ValidationArray<
  T extends ValidateAnyType,
  Cardinality extends ArrayCardinality = "many"
> extends SchemaOf<
  ArrayOutputType<T, Cardinality>,
  ArrayDef<T>,
  Cardinality extends "atleastone"
  ? [T["_input"], ...T["_input"][]]
  : T["_input"][]
> {
  _validation(input: ValidationInput): ParseReturnType<this["_output"]> {
    const { ctx, status } = this._processInputParams(input);

    const def = this._def;

    if (ctx.parsedType !== ParsedType.array) {
      addIssueToContext(ctx, {
        code: ErrorCode.invalid_type,
        expected: ParsedType.array,
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
          return def.type._validateAsync(
            new ValidateInputLazyPath(ctx, item, ctx.path, i)
          );
        })
      ).then((result) => {
        return ParseStatus.mergeArray(status, result);
      });
    }

    const result = (ctx.data as any[]).map((item, i) => {
      return def.type._validateSync(
        new ValidateInputLazyPath(ctx, item, ctx.path, i)
      )
    })

    return ParseStatus.mergeArray(status, result);
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
      name: ValidationKind.Array,
      ...processCreateParams(params),
    })
  }
}