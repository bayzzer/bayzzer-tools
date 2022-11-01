export namespace errorUtil {
  export type ErrorMessage = string | { message?: string };
  export const errToObj = (message?: ErrorMessage) =>
    typeof message === "string" ? { message } : message || {};
  export const toString = (message?: ErrorMessage): string | undefined =>
    typeof message === "string" ? message : message?.message;
}
