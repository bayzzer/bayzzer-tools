import { util } from "./utils/util";
import { ErrorMap, ErrorCode } from "./validation_error";

const errorMap: ErrorMap = (issue, _ctx) => {
  let message: string;
  switch (issue.code) {
    case ErrorCode.invalid_type:
      message = `Expected ${issue.expected}, received ${issue.received}`
      break;
    case ErrorCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("startWith" in issue.validation) {
          message = `Must start with "${issue.validation.startWith}"`;
        } else if ("endWith" in issue.validation) {
          message = `Must end with "${issue.validation.endWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ErrorCode.too_small:
      if (issue.type === "array")
        message = `Must contain ${issue.inclusive ? `at least` : `more than`
          } ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `Must contain ${issue.inclusive ? `at least` : `over`
          } ${issue.minimum} character(s)`;
      else message = "Invalid";
      break;
    case ErrorCode.too_big:
      if (issue.type === "array")
        message = `Must contain ${issue.inclusive ? `at most` : `less than`
          } ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `Must contain ${issue.inclusive ? `at most` : `under`
          } ${issue.maximum} character(s)`;
      else message = "Invalid";
      break;
    case ErrorCode.custom:
      message = `Invalid`;
      break;
    case ErrorCode.required:
      message = `Required`;
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};

export default errorMap;
