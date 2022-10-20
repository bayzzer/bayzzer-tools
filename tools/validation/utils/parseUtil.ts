
import defaultErrorMap from "../message";
import type { ErrorData, ErrorMap, Issue } from "../error";
import type { ValidationType } from "./util";

export const makeIssue = (params: {
  data: any;
  path: (string | number)[];
  errorMaps: ErrorMap[];
  issueData: ErrorData;
}): Issue => {
  const { data, path, errorMaps, issueData } = params;
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

export type ValidationPathComponent = string | number;
export type ValidationPath = ValidationPathComponent[];
export const EMPTY_PATH: ValidationPath = [];

export interface ValidationContext {
  readonly common: {
    readonly issues: Issue[];
    readonly contextualErrorMap?: ErrorMap;
    readonly async: boolean;
  };
  readonly path: ValidationPath;
  readonly schemaErrorMap?: ErrorMap;
  readonly parent: ValidationContext | null;
  readonly data: any;
  readonly parsedType: ValidationType;
}

export type ValidationInput = {
  data: any
  path: (string | number)[]
  parent: ValidationContext
};

export function addIssueToContext(
  ctx: ValidationContext,
  issueData: ErrorData
): void {
  const issue = makeIssue({
    issueData: issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap, // contextual error map is first priority
      ctx.schemaErrorMap, // then schema-bound map if available
      defaultErrorMap, // then global default map
    ].filter((x) => !!x) as ErrorMap[],
  });
  ctx.common.issues.push(issue);
}
export class ValidateStatus {
  value: "aborted" | "dirty" | "valid" = "valid";
  dirty() {
    if (this.value === "valid") this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted") this.value = "aborted";
  }

  static mergeArray(
    status: ValidateStatus,
    results: SyncValidateReturnType<any>[]
  ): SyncValidateReturnType {
    const arrayValue: any[] = [];
    for (const s of results) {
      if (s.status === "aborted") return INVALID;
      if (s.status === "dirty") status.dirty();
      arrayValue.push(s.value);
    }

    return { status: status.value, value: arrayValue };
  } 

  static mergeObjectSync(
    status: ValidateStatus,
    pairs: {
      key: SyncValidateReturnType<any>;
      value: SyncValidateReturnType<any>;
      alwaysSet?: boolean;
    }[]
  ): SyncValidateReturnType {
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

export type SyncValidateReturnType<T = any> = OK<T> | DIRTY<T> | INVALID;
export type AsyncValidateReturnType<T> = Promise<SyncValidateReturnType<T>>
export type ValidateReturnType<T> =
  | SyncValidateReturnType<T>
  | AsyncValidateReturnType<T>

export const isAborted = (x: ValidateReturnType<any>): x is INVALID =>
  (x as any).status === "aborted";
export const isDirty = <T>(x: ValidateReturnType<T>): x is OK<T> | DIRTY<T> =>
  (x as any).status === "dirty";
export const isValid = <T>(x: ValidateReturnType<T>): x is OK<T> | DIRTY<T> =>
  (x as any).status === "valid";
export const isAsync = <T>(
  x: ValidateReturnType<T>
): x is AsyncValidateReturnType<T> =>
  typeof Promise !== undefined && x instanceof Promise
