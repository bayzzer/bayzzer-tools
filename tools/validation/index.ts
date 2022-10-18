import { ValidationArray } from "./array";
import { ValidationObject } from "./object";
import { ValidationString } from "./string";
import {
    SchemaOf, ValidationEffects,
} from "./types";

export {SchemaOf}
export const string = ValidationString.create
export const array = ValidationArray.create
export const object = ValidationObject.create
export const effects = ValidationEffects.create
export const preprocess = ValidationEffects.createWithPreprocess;

