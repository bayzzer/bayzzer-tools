import { ValidateInput, ValidationResult, ValidationStatus } from "./utils/validation_util";
import { util } from "./utils/util";
import { ValidateInputPath, SchemaKind, SchemaRawShape, SchemaOf, SchemaTypeAny, SchemaTypeDef } from "./schema";

export namespace objectUtil {

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





    export const mergeShapes = <U extends SchemaRawShape, T extends SchemaRawShape>(
        first: U,
        second: T
    ): T & U => {
        return {
            ...first,
            ...second, // second overwrites first
        };
    };
}
interface ObjectDef<
    T extends SchemaRawShape = SchemaRawShape
> extends SchemaTypeDef {
    typeName: SchemaKind.Object;
    shape: () => T
}

type BaseObjectOutputType<Shape extends SchemaRawShape> =
    objectUtil.Flatten<
        objectUtil.AddQuestionMarks<{
            [k in keyof Shape]: Shape[k]["_output"];
        }>
    >;

type ObjectOutputType<
    Shape extends SchemaRawShape,
    Catchall extends SchemaTypeAny
> = SchemaTypeAny extends Catchall
    ? BaseObjectOutputType<Shape>
    : objectUtil.Flatten<
        BaseObjectOutputType<Shape> & { [k: string]: Catchall["_output"] }
    >;

type BaseObjectInputType<Shape extends SchemaRawShape> = objectUtil.Flatten<
    objectUtil.AddQuestionMarks<{
        [k in keyof Shape]: Shape[k]["_input"];
    }>
>;

type ObjectInputType<
    Shape extends SchemaRawShape,
    Catchall extends SchemaTypeAny
> = SchemaTypeAny extends Catchall
    ? BaseObjectInputType<Shape>
    : objectUtil.Flatten<
        BaseObjectInputType<Shape> & { [k: string]: Catchall["_input"] }
    >;
export class Object<
    T extends SchemaRawShape,
    Catchall extends SchemaTypeAny = SchemaTypeAny,
    Output = ObjectOutputType<T, Catchall>,
    Input = ObjectInputType<T, Catchall>
> extends SchemaOf<Output, ObjectDef<T>, Input> {
    private _cached: { shape: T; keys: string[] } | null = null;

    _getCached(): { shape: T; keys: string[] } {
        if (this._cached !== null) return this._cached;
        const shape = this._def.shape();
        const keys = util.objectKeys(shape);
        return (this._cached = { shape, keys });
    }

    _validation(input: ValidateInput): ValidationResult<this["_output"]> {
        var obj = input.data
        if (obj === undefined || obj == null) {
            input.data = {}
        }

        const { status, ctx } = this._processInputParams(input);

        const { shape, keys: shapeKeys } = this._getCached();

        const pairs: {
            key: ValidationResult<any>;
            value: ValidationResult<any>;
            alwaysSet?: boolean;
        }[] = [];
        for (const key of shapeKeys) {
            const keyValidator = shape[key];
            const value = ctx.data[key];
            pairs.push({
                key: { status: "valid", value: key },
                value: keyValidator._validation(
                    new ValidateInputPath(ctx, value, ctx.path, key)
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
                    return ValidationStatus.mergeObjectSync(status, syncPairs);
                });
        } else {
            return ValidationStatus.mergeObjectSync(status, pairs as any);
        }
    }

    static create = <T extends SchemaRawShape>(
        shape: T,
    ): Object<T> => {
        return new Object({
            shape: () => shape,
            typeName: SchemaKind.Object
        }) as any;
    }
}