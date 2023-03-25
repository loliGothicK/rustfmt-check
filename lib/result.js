"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Err = exports.Ok = void 0;
class Ok {
    constructor(value) {
        this.value = value;
        this.type = 'success';
    }
    isOk() {
        return true;
    }
    isErr() {
        return false;
    }
    unwrap() {
        return this.value;
    }
    unwrap_err() {
        throw this.value;
    }
    expect(_) {
        return this.value;
    }
    map(f) {
        return new Ok(f(this.value));
    }
}
exports.Ok = Ok;
class Err {
    constructor(value) {
        this.value = value;
        this.type = 'failure';
    }
    isOk() {
        return false;
    }
    isErr() {
        return true;
    }
    unwrap() {
        throw this.value;
    }
    unwrap_err() {
        return this.value;
    }
    expect(msg) {
        if (typeof msg === 'string') {
            throw Error(msg);
        }
        else {
            throw Error(msg(this.value));
        }
    }
    map(_) {
        return new Err(this.value);
    }
}
exports.Err = Err;
