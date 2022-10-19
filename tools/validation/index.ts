import { ValidationArray } from "./array"
import { ValidationObject } from "./object"
import { ValidationString } from "./string"
import {
    SchemaOf
} from "./schema"

export {SchemaOf}
export const string = ValidationString.create
export const array = ValidationArray.create
export const object = ValidationObject.create

