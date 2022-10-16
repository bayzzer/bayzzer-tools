import { SchemaOf } from './types';
import {
    ValidationAny,
    ValidationArray,
    ValidationEffects,
    ValidationObject,
    ValidationString
} from "./types";


const stringType = ValidationString.create;
const anyType = ValidationAny.create;
const arrayType = ValidationArray.create;
const objectType = ValidationObject.create;
const strictObjectType = ValidationObject.strictCreate
const effectsType = ValidationEffects.create;
const preprocessType = ValidationEffects.createWithPreprocess;

export {
    anyType as any,
    arrayType as array,
    effectsType as effect,
    objectType as object,
    preprocessType as preprocess,
    strictObjectType as strictObject,
    stringType as string,
    effectsType as transformer,
    SchemaOf
}
