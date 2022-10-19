import { util} from "../helpers/util";
import { ErrorMap, ErrorCode } from "../error";

const errorMap: ErrorMap = (issue, _ctx) => {
  let message: string;
  switch (issue.code) {
    case ErrorCode.invalid_type:
      message = `Expected ${issue.expected}, received ${issue.received}`;
      break
    case ErrorCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("startWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startWith}"`;
        } else if ("endWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endWith}"`;
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
        message = `Array must contain ${
          issue.inclusive ? `at least` : `more than`
        } ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${
          issue.inclusive ? `at least` : `over`
        } ${issue.minimum} character(s)`;      
      else message = "Invalid input";
      break;
    case ErrorCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${
          issue.inclusive ? `at most` : `less than`
        } ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${
          issue.inclusive ? `at most` : `under`
        } ${issue.maximum} character(s)`      
      else message = "Invalid input";
      break;
    case ErrorCode.custom:
      message = `Invalid input`;
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};

export default errorMap;
