import { ValidationObject } from "./object";
import { ValidationString } from "./string";
import {
    SchemaOf,
    ValidationAny,
    ValidationArray,
    ValidationEffects,
} from "./types";

export {SchemaOf}


export const string = ValidationString.create;
export const any = ValidationAny.create;
export const array = ValidationArray.create;
export const object = ValidationObject.create;
export const strictObject = ValidationObject.strictCreate
export const effects = ValidationEffects.create;
export const preprocess = ValidationEffects.createWithPreprocess;

