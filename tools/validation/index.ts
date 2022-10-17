import { ValidationObject } from "./object";
import { ValidationString } from "./string";
import {
    SchemaOf,
    ValidationAny,
    ValidationArray,
    ValidationEffects,
} from "./types";

export {SchemaOf}


const stringType = ValidationString.create;
const anyType = ValidationAny.create;
const arrayType = ValidationArray.create;
export const object = ValidationObject.create;
const strictObjectType = ValidationObject.strictCreate
const effectsType = ValidationEffects.create;
const preprocessType = ValidationEffects.createWithPreprocess;

export {
    anyType as any,
    arrayType as array,
    effectsType as effect,
    preprocessType as preprocess,
    strictObjectType as strictObject,
    stringType as string,
    effectsType as transformer    
}
