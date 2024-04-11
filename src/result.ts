export type Result<T, E> = Ok<T, E> | Err<T, E>;

type Transformer<T, U> = (arg: T) => U;

export class Ok<T, E> {
	constructor(readonly value: T) {}
	type = "success" as const;
	isOk(): this is Ok<T, E> {
		return true;
	}
	isErr(): this is Err<T, E> {
		return false;
	}
	unwrap(): T {
		return this.value;
	}
	unwrap_err(): never {
		throw this.value;
	}
	expect(_: unknown): T {
		return this.value;
	}
	map<U>(f: Transformer<T, U>): Ok<U, E> {
		return new Ok(f(this.value));
	}
}

export class Err<T, E> {
	constructor(readonly value: E) {}
	type = "failure" as const;
	isOk(): this is Ok<T, E> {
		return false;
	}
	isErr(): this is Err<T, E> {
		return true;
	}
	unwrap(): never {
		throw this.value;
	}
	unwrap_err(): E {
		return this.value;
	}
	expect(msg: (err: E) => string | string): never {
		if (typeof msg === "string") {
			throw Error(msg);
		}
		throw Error(msg(this.value));
	}
	map<U>(_: unknown): Err<U, E> {
		return new Err(this.value);
	}
}
