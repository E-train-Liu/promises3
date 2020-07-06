/**
 * Define a module as adapter for promise-aplus-tests.
 */


const PromisEs3 = require("../../Promise.js");

function deferred() {
    let resolve, reject;
    let promise = new PromisEs3(
        function (_resolve, _reject) {
            resolve = _resolve;
            reject = _reject;
        }
    );

    return {
        resolve: resolve,
        reject: reject,
        promise: promise
    };
}

module.exports = {
    resolved: PromisEs3.resolve,
    rejected: PromisEs3.reject,
    deferred: deferred
};