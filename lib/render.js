"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plural = void 0;
function plural(value, suffix = 's') {
    return value == 1 ? '' : suffix;
}
exports.plural = plural;
