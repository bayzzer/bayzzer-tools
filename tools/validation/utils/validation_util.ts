import defaultErrorMap from "../message";
import type { ErrorData, ErrorMap, ValidationError } from "../validation_error";
import type { ValidatedType } from "./util";

export const makeIssue = (params: {
  data: any;
  path: (string | number)[];
  errorMaps: ErrorMap[];
  errorData: ErrorData;
}): ValidationError => {
  const { data, path, errorMaps, errorData: issueData } = params;
  const fullPath = [...path, ...(issueData.path || [])];
  const fullIssue = {
    ...issueData,
    path: fullPath,
  };

  let errorMessage = "";
  const maps = errorMaps
    .filter((m) => !!m)
    .slice()
    .reverse() as ErrorMap[];
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }

  return {
    ...issueData,
    path: fullPath,
    message: issueData.message || errorMessage,
  };
};

export type ValidationParams = {
  path: (string | number)[];
  errorMap: ErrorMap;
  async: boolean;
};

 type ValidationPathComponent = string | number;
export type ValidationPath = ValidationPathComponent[];

export interface ValidationContext {
  readonly common: {
    readonly issues: ValidationError[];
    readonly errorMap?: ErrorMap;
    readonly async: boolean;
  };
  readonly path: ValidationPath;
  readonly schemaErrorMap?: ErrorMap;
  readonly parent: ValidationContext | null;
  readonly data: any;
  readonly type: ValidatedType;
}

export type ValidateInput = {
  data: any;
  path: (string | number)[];
  parent: ValidationContext;
};

export function addError(
  ctx: ValidationContext,
  errData: ErrorData
): void {
  const issue = makeIssue({
    errorData: errData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.errorMap, // contextual error map is first priority
      ctx.schemaErrorMap, // then schema-bound map if available
      defaultErrorMap, // then global default map
    ].filter((x) => !!x) as ErrorMap[],
  });
  ctx.common.issues.push(issue);
}

type ObjectPair = {
  key: ValidationSync<any>;
  value: ValidationSync<any>;
};
export class ValidationStatus {
  value: "aborted" | "dirty" | "valid" = "valid";
  dirty() {
    if (this.value === "valid") this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted") this.value = "aborted";
  }

  static mergeArray(
    status: ValidationStatus,
    results: ValidationSync<any>[]
  ): ValidationSync {
    const arrayValue: any[] = [];
    for (const s of results) {
      if (s.status === "aborted") return INVALID;
      if (s.status === "dirty") status.dirty();
      arrayValue.push(s.value);
    }

    return { status: status.value, value: arrayValue };
  }

  static async mergeObjectAsync(
    status: ValidationStatus,
    pairs: { key: ValidationResult<any>; value: ValidationResult<any> }[]
  ): Promise<ValidationSync<any>> {
    const syncPairs: ObjectPair[] = [];
    for (const pair of pairs) {
      syncPairs.push({
        key: await pair.key,
        value: await pair.value,
      });
    }
    return ValidationStatus.mergeObjectSync(status, syncPairs);
  }

  static mergeObjectSync(
    status: ValidationStatus,
    pairs: {
      key: ValidationSync<any>;
      value: ValidationSync<any>;
      alwaysSet?: boolean;
    }[]
  ): ValidationSync {
    const finalObject: any = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted") return INVALID;
      if (value.status === "aborted") return INVALID;
      if (key.status === "dirty") status.dirty();
      if (value.status === "dirty") status.dirty();

      if (typeof value.value !== "undefined" || pair.alwaysSet) {
        finalObject[key.value] = value.value;
      }
    }

    return { status: status.value, value: finalObject };
  }
}

export type INVALID = { status: "aborted" };
export const INVALID: INVALID = Object.freeze({
  status: "aborted",
});

export type DIRTY<T> = { status: "dirty"; value: T };
export const DIRTY = <T>(value: T): DIRTY<T> => ({ status: "dirty", value });

export type OK<T> = { status: "valid"; value: T };
export const OK = <T>(value: T): OK<T> => ({ status: "valid", value });

export type ValidationSync<T = any> = OK<T> | DIRTY<T> | INVALID;
export type ValidationAsync<T> = Promise<ValidationSync<T>>;
export type ValidationResult<T> =
  | ValidationSync<T>
  | ValidationAsync<T>

export const isAborted = (x: ValidationResult<any>): x is INVALID =>
  (x as any).status === "aborted";
export const isDirty = <T>(x: ValidationResult<T>): x is OK<T> | DIRTY<T> =>
  (x as any).status === "dirty";
export const isValid = <T>(x: ValidationResult<T>): x is OK<T> | DIRTY<T> =>
  (x as any).status === "valid";
export const isAsync = <T>(
  x: ValidationResult<T>
): x is ValidationAsync<T> =>
  typeof Promise !== undefined && x instanceof Promise;
