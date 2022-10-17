import { errorUtil } from "./helpers/errorUtil";
import { addIssueToContext, INVALID, ParseInput, ParseReturnType, ParseStatus } from "./helpers/parseUtil";
import { ZodParsedType } from "./helpers/util";
import { processCreateParams, RawCreateParams, SchemaOf, ValidateAnyType, ValidateInputLazyPath, ValidationFirstKind, ValidationTypeDef } from "./types";
import { ErrorCode } from "./ZodError";

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
