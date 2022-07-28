import { 
    Draft,
    Immutable,
    Nothing, Patch, PatchListener 
} from "@bayzzer/tools"

type AnyFunc = (...args: any[]) => any

type FromNothing<T> = T extends Nothing ? undefined : T

/** The inferred return type of `produce` */
export type Produced<Base, Return> = Return extends void
	? Base
	: Return extends Promise<infer Result>
	? Promise<Result extends void ? Base : FromNothing<Result>>
	: FromNothing<Return>

/**
 * Utility types
 */
type PatchesTuple<T> = readonly [T, Patch[], Patch[]]

type ValidRecipeReturnType<State> =
	| State
	| void
	| undefined
	| (State extends undefined ? Nothing : never)

type ValidRecipeReturnTypePossiblyPromise<State> =
	| ValidRecipeReturnType<State>
	| Promise<ValidRecipeReturnType<State>>

type PromisifyReturnIfNeeded<
	State,
	Recipe extends AnyFunc,
	UsePatches extends boolean
> = ReturnType<Recipe> extends Promise<any>
	? Promise<UsePatches extends true ? PatchesTuple<State> : State>
	: UsePatches extends true
	? PatchesTuple<State>
	: State

/**
 * Core Producer inference
 */
type InferRecipeFromCurried<Curried> = Curried extends (
	base: infer State,
	...rest: infer Args
) => any // extra assertion to make sure this is a proper curried function (state, args) => state
	? ReturnType<Curried> extends State
		? (
				draft: Draft<State>,
				...rest: Args
		  ) => ValidRecipeReturnType<Draft<State>>
		: never
	: never

type InferInitialStateFromCurried<Curried> = Curried extends (
	base: infer State,
	...rest: any[]
) => any // extra assertion to make sure this is a proper curried function (state, args) => state
	? State
	: never

type InferCurriedFromRecipe<
	Recipe,
	UsePatches extends boolean
> = Recipe extends (draft: infer DraftState, ...args: infer RestArgs) => any // verify return type
	? ReturnType<Recipe> extends ValidRecipeReturnTypePossiblyPromise<DraftState>
		? (
				base: Immutable<DraftState>,
				...args: RestArgs
		  ) => PromisifyReturnIfNeeded<DraftState, Recipe, UsePatches> // N.b. we return mutable draftstate, in case the recipe's first arg isn't read only, and that isn't expected as output either
		: never // incorrect return type
	: never // not a function

type InferCurriedFromInitialStateAndRecipe<
	State,
	Recipe,
	UsePatches extends boolean
> = Recipe extends (
	draft: Draft<State>,
	...rest: infer RestArgs
) => ValidRecipeReturnTypePossiblyPromise<State>
	? (
			base?: State | undefined,
			...args: RestArgs
	  ) => PromisifyReturnIfNeeded<State, Recipe, UsePatches>
	: never // recipe doesn't match initial state

/**
 * The `produce` function takes a value and a "recipe function" (whose
 * return value often depends on the base state). The recipe function is
 * free to mutate its first argument however it wants. All mutations are
 * only ever applied to a __copy__ of the base state.
 *
 * Pass only a function to create a "curried producer" which relieves you
 * from passing the recipe function every time.
 *
 * Only plain objects and arrays are made mutable. All other objects are
 * considered uncopyable.
 *
 * Note: This function is __bound__ to its `Immer` instance.
 *
 * @param {any} base - the initial state
 * @param {Function} producer - function that receives a proxy of the base state as first argument and which can be freely modified
 * @param {Function} patchListener - optional function that will be called with all the patches produced here
 * @returns {any} a new state, or the initial state if nothing was modified
 */
export interface ImmutableProduce {
	/** Curried producer that infers the recipe from the curried output function (e.g. when passing to setState) */
	<Curried>(
		recipe: InferRecipeFromCurried<Curried>,
		initialState?: InferInitialStateFromCurried<Curried>
	): Curried

	/** Curried producer that infers curried from the recipe  */
	<Recipe extends AnyFunc>(recipe: Recipe): InferCurriedFromRecipe<
		Recipe,
		false
	>

	/** Curried producer that infers curried from the State generic, which is explicitly passed in.  */
	<State>(
		recipe: (
			state: Draft<State>,
			initialState: State
		) => ValidRecipeReturnType<State>
	): (state?: State) => State
	<State, Args extends any[]>(
		recipe: (
			state: Draft<State>,
			...args: Args
		) => ValidRecipeReturnType<State>,
		initialState: State
	): (state?: State, ...args: Args) => State
	<State>(recipe: (state: Draft<State>) => ValidRecipeReturnType<State>): (
		state: State
	) => State
	<State, Args extends any[]>(
		recipe: (state: Draft<State>, ...args: Args) => ValidRecipeReturnType<State>
	): (state: State, ...args: Args) => State

	/** Curried producer with initial state, infers recipe from initial state */
	<State, Recipe extends Function>(
		recipe: Recipe,
		initialState: State
	): InferCurriedFromInitialStateAndRecipe<State, Recipe, false>

	/** Normal producer */
	<Base, D = Draft<Base>>( // By using a default inferred D, rather than Draft<Base> in the recipe, we can override it.
		base: Base,
		recipe: (draft: D) => ValidRecipeReturnType<D>,
		listener?: PatchListener
	): Immutable<Base>

	/** Promisified dormal producer */
	<Base, D = Draft<Base>>(
		base: Base,
		recipe: (draft: D) => Promise<ValidRecipeReturnType<D>>,
		listener?: PatchListener
	): Promise<Immutable<Base>>
}

/**
 * Like `produce`, but instead of just returning the new state,
 * a tuple is returned with [nextState, patches, inversePatches]
 *
 * Like produce, this function supports currying
 */
export interface IProduceWithPatches {
	// Types copied from IProduce, wrapped with PatchesTuple
	<Recipe extends AnyFunc>(recipe: Recipe): InferCurriedFromRecipe<Recipe, true>
	<State, Recipe extends Function>(
		recipe: Recipe,
		initialState: State
	): InferCurriedFromInitialStateAndRecipe<State, Recipe, true>
	<Base, D = Draft<Base>>(
		base: Base,
		recipe: (draft: D) => ValidRecipeReturnType<D>,
		listener?: PatchListener
	): PatchesTuple<Base>
	<Base, D = Draft<Base>>(
		base: Base,
		recipe: (draft: D) => Promise<ValidRecipeReturnType<D>>,
		listener?: PatchListener
	): Promise<PatchesTuple<Base>>
}