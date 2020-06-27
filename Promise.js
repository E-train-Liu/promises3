/**
 * An implementation of Promise for ES3.
 * 
 * @author Yichen Liu
 * @copyright (c) 2020 Yichen Liu
 * @license MIT
 */

(function (definations) {

    // CommonJS
    if (typeof module === "object" && module !== null)
        module.exports = definations;
    // AMD and CMD
    else if (typeof define === "function" && (define.amd || define.cmd))
        define(function () {
            return definations;
        });
    // Simply Polyfill
    else {
        if (typeof Promise === "undefined")
            Promise = definations.Promise;
        if (typeof AggregateError === "undefined")
            AggregateError = definations.AggregateError;
    }

})((function () {

    /* Constructor */

    function Promise(executor) {

        if (!(this instanceof Promise))
            throw new TypeError("Promise constructor must be called with 'new' or on a Promise instance.");
        if (typeof executor !== "function")
            throw new TypeError("The argument of Promise constructor must be a function.");


        /**
         * @private
         * @type {any}
         */
        this["[[value]]"] = undefined;

        /**
         * @private
         * @type {"pending" | "fulfilled" | "rejected"}
         */
        this["[[status]]"] = "pending";

        /**
         * If the promise have been resolved by a Thenable object.
         * 
         * When a promise is resolved by a Thenable, it will remain pending
         * state until the Thenable is fullfilled or rejected. 
         * 
         * @private
         * @type {boolean}
         */
        this["[[resolvedByThenable]]"] = false;

        /**
         * @private
         * @type {{
         *      onFulfilled: any | (value: any) => any,
         *      onRejected: any | (reason: any) => any,
         *      returnedPromise: Promise     
         * }[]} 
         */
        this["[[handlers]]"] = [];


        // Function.prototype.bind() is not ES3 function
        // It have been polyfill on this["[[resolve]]"] and this["[[reject]]"].
        // See code later.
        executor(
            curryBinary(resolve, this),
            curryBinary(reject, this)
        );
    }


    if (typeof AggregateError !== "function") {

        /**
         * @type {boolean}
         */
        var definePropertyUsable;
        try {
            Object.defineProperty(new Error(), "test", {
                get: function() {return []},
                configurable: true,
                enumerable: false,
                writable: true
            });
            definePropertyUsable = true;
        }
        catch(error) {
            definePropertyUsable = false;
        }

        /**
         * A bundle of multiple `Error`.
         * 
         * An experimental class,
         * see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError.
         * 
         * @class
         * 
         * @param {Interable} errors  An a interable of errors.
         * @param {string} [message=""]  The message describing the error. Be `""` on default.
         */
        function AggregateError(errors, message) {
            Error.call(this, message);

            var errorArray = iterableToArray(errors);
            
            if (definePropertyUsable)
                Object.defineProperty(this, "[[errors]]", {
                    value: errorArray,
                    configurable: false,
                    enumerable: false,
                    writable: false
                });
            else {
                this.errors = errorArray;
            }
        }
        AggregateError.prototype = new Error();
        AggregateError.prototype.constructor = AggregateError;

        if(definePropertyUsable) {
            Object.defineProperty(AggregateError.prototype, "errors", {
                get: function () {
                    return this["[[errors]]"].slice();
                },
                configurable: true,
                enumerable: false,
                configurable: true
            });
        }
    }








    /* Member Functions */

    Promise.prototype.then = function (onFulfilled, onRejected) {
        var returnedPromise = new Promise(emptyExecutor);

        switch (this["[[status]]"]) {
            case "fulfilled":
                invokeOnFulFilledCallback(onFulfilled, this["[[value]]"], returnedPromise);
                break;
            case "rejected":
                invokeOnRejectedCallback(onRejected, this["[[value]]"], returnedPromise);
                break;
            case "pending":
            default:
                this["[[handlers]]"].push({
                    onFulfilled: onFulfilled,
                    onRejected: onRejected,
                    returnedPromise: returnedPromise
                });
                break;
        }

        return returnedPromise;
    }

    Promise.prototype.catch = function (onRejected) {
        return this.then(undefined, onRejected);
    }

    Promise.prototype.finally = function (onFinally) {
        return this.then(onFinally, onFinally);
    }

    if (typeof Symbol === "function" && Symbol.toStringTag)
        Promise.prototype[Symbol.toStringTag] = "Promise";








    /* Static Functions */

    Promise.all = function (promises) {
        var promiseArray = iterableToArray(promises);
        return new Promise(
            curryTenary(allExecutor, promiseArray)
        );
    }

    Promise.allSettled = function (promises) {
        var promiseArray = iterableToArray(promises);
        return new Promise(
            curryTenary(allSettledExecutor, promiseArray)
        );
    }

    Promise.any = function (promises) {
        var promiseArray = iterableToArray(promises);
        return new Promise(
            curryTenary(anyExecutor, promiseArray)
        );
    }

    Promise.race = function(promise) {
        var promiseArray = iterableToArray(promises);
        return new Promises (
            curryTenary(raceExecutor, promiseArray)
        )
    }

    Promise.reject = function(reason) {
        return new Promise (function (resolve, reject) {
            reject(reason);
        });
    }

    Promise.resolve = function(value) {
        return new Promise (function (resolve, reject) {
            resolve(value);
        });
    }








    /* Helper Functions For Member Functions */

    /**
     * Resolve a promise.
     * 
     * This function will do nothing if the promise have been resolved by a Thenable or Promise.
     * 
     * Algorithm and standard: https://promisesaplus.com/#the-promise-resolution-procedure
     * 
     * @param {Promise} promise  The promise to be resolve.
     * @param {any | Thenable} value  The value used to resolve the promise.
     */
    function resolve(promise, value) {
        if (!promise["[[resolvedByThenable]]"])
            resolveUncheck(promise, value);
    }

    /**
     * Resolve a promise anyway without checking that if it have not been resolved by 
     * a Thenable or another Promise.
     * 
     * Algorithm and standard: https://promisesaplus.com/#the-promise-resolution-procedure
     * 
     * @param {Promise} promise  The promise to be resolve.
     * @param {any | Thenable} value  The value used to resolve the promise.
     */
    function resolveUncheck(promise, value) {

        // https://promisesaplus.com/#point-48
        //      A Promise cannot be resolved with itself. 
        if (promise === value)
            throw new TypeError("Cannot resolve a promise with itself.");

        try {
            // https://promisesaplus.com/#point-49
            // https://promisesaplus.com/#point-54
            //      When `value` thenable or is another promise, `promise` will 
            //      remain "pending" state until `value` is fulfilled or rejected.
            // https://promisesaplus.com/#point-55
            // https://promisesaplus.com/#point-60
            //      If retriving or calling `value.then` cause an exception, reject `promise`.
            if (value != null && typeof value.then === "function") {
                result.then(
                    curryBinary(resolveUncheck, promise),
                    curryBinary(rejectUncheck, promise)
                );
                promise["[[resolvedByThenable]]"] = true;
            }
            else
                fulfill(promise, value);
        }
        catch (error) {
            reject(promise, error);
        }
    }

    /**
     * Fulfill a pending promise.
     * 
     * @param {Promise} promise 
     * @param {any} value 
     */
    function fulfill(promise, value) {
        
        if (promise["[[status]]"] !== "pending")
            return;

        promise["[[value]]"] = value;
        promise["[[status]]"] = "fulfilled";

        var handlers = promise["[[handlers]]"];
        var handlerCount = handlers.length;
        for (var i = 0; i < handlerCount; ++i) {
            var handler = handlers[i];
            invokeOnFulFilledCallback(
                handler.onFulfilled, value, handler.returnedPromise
            );
        }
    }

    /**
     * Invoke an onFulfilled callback added by then().
     * 
     * When `promise1.then()` was called, it will accept a 
     * 
     * @param {any | (value: any) => any} onFulfilled 
     * @param {any} value 
     * @param {Promise} nextPromise
     */
    function invokeOnFulFilledCallback(onFulfilled, value, returnedPromise) {
        if (typeof onFulfilled === "function")
            // https://promisesaplus.com/#point-34
            //      The `onFulfilled` and `onRejected` callbacks must be called async.
            invokeFunctionAsync(
                invokeThenCallback, onFulfilled, result, returnedPromise
            );
        // https://promisesaplus.com/#point-43
        //      If `onFulfilled` is not a function. Resolve the next promise with
        //      the value of this promise.
        else
            resolve(returnedPromise, value);
    }

    /**
     * Reject the promise with the given reason.
     * 
     * This function will do nothing if the promise have been resolved by a promise
     * 
     * @param {Promise} promise 
     * @param {any} reason 
     */
    function reject(promise, reason) {
        if (!promise["[[resolvedByThenable]]"])
            rejectUncheck(promise, reason);
    }

    /**
     * Reject the promise anyway with the given reason considerless that if
     * the Promise have been resolved by a Thenable or another Promise.
     * 
     * @param {Promise} promise 
     * @param {any} reason 
     */
    function rejectUncheck(promise, reason) {
        if (promise["[[status]]"] !== "pending")
            return;

        promise["[[value]]"] = reason;
        promise["[[status]]"] = "rejected";

        var handlers = promise["[[handlers]]"];
        var handlerCount = handlers.length;
        for (var i = 0; i < handlerCount; ++i) {
            var handler = handlers[i];
            invokeOnRejectedCallback(handler.onRejected, reason, handler.promise);
        }
    }

    /**
     * Check if the `onRejected` callback accepted by `then()` is a function.
     * If it is, call it.
     * 
     * @param {any | (value: any) => any} onFulfilled 
     * @param {any} reason 
     * @param {Promise} nextPromise
     */
    function invokeOnRejectedCallback(onRejected, reason, returnedPromise) {
        if (typeof onRejected === "function")
            // https://promisesaplus.com/#point-34
            //      The `onFulfilled` and `onRejected` callbacks must be called async.
            invokeFunctionAsync(
                invokeThenCallback, onRejected, reason, returnedPromise
            );
        // https://promisesaplus.com/#point-44
        //      If `onRejected` is not a function. Reject the next promise with
        //      the value of this promise.
        else
            reject(returnedPromise, reason);
    }


    /**
     * Invoke the `onFulfilled` or `onRejected` callback added by `then()`.
     * 
     * It will resolve or reject the next `Promise` returned by `then()` according
     * to the running result of the callback.
     * 
     * @param {(value: any) => void} callback 
     * @param {any} value 
     * @param {Promise} returnedPromise 
     */
    function invokeThenCallback(callback, value, returnedPromise) {
        try {
            // https://promisesaplus.com/#point-41
            //      When `onFulfilled` or `onRejected` return a value, resolve
            //      the `Promise` returned by `then()` with the return value.
            var callbackReturnValue = callback(value);
            resolve(returnedPromise, callbackReturnValue)
        }
        catch (error) {
            // https://promisesaplus.com/#point-42
            //      When `onFulfilled` or `onRejected` throws an exception, 
            //      reject the next `Promise`.
            reject(returnedPromise, error);
        }
    }








    /* Helper Functions for Static Functions */

    /**
     * To watch an array of `Promise`s, add the same fulfill and reject
     * callback by `then()` on them.
     * 
     * If an element in the array with value `v` is not a promise, it will be seen as
     * an promise being fulfilled with `v`.   
     * 
     * @param {any[]} promises 
     * @param {(index: number, value: any) => void} [onFulfilledAt]
     * @param {(index: number, reason: any) => void} [onRejectedAt]
     */
    function watchPromises(promises, onFulfilledAt, onRejectedAt) {
        var promiseCount = promises.length;

        for (var i = 0; i < promiseCount; ++i) {
            var promise = promises[i];
            try {
                if (promise != null && typeof promise.then === "function")
                    promise.then(
                        curryBinary(onFulfilledAt, i),
                        curryTenary(onRejectedAt, i)
                    );
                else
                    onFulfilledAt(i, promise);
            }
            catch(error) {
                onRejectedAt(i, error);
            }
        }
    }

    /**
     * The executor to create the promise returned by `Promise.all()`.
     * 
     * @param {any[]} promises 
     * @param {(value: any[]) => void} resolvePromise
     * @param {(reason: any) => void} rejectPromise 
     */
    function allExecutor(promises, resolvePromise, rejectPromise) {
        var unfulfilledCount = promises.length;
        var values = new Array(promises.length);
        var rejected = false;

        if (unfulfilledCount === 0) {
            resolvePromise(values);
            return;
        }

        function onFulfilledAt(index, value) {
            values[index] = value;
            if (--unfulfilledCount <= 0)
                // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all#Fulfillment
                //      If all promises are fulfilled, the promise returned by `Promise.all()` should be fullfilled async.
                invokeFunctionAsync(resolvePromise, values);
        }
        function onRejectedAt(index, reason) {
            if (!rejected) {
                rejected = true;
                invokeFunctionAsync(rejectPromise, reason);
            }
        }
        watchPromises(onFulfilledAt, onRejectedAt);
    }

    /**
     * The executor to create the promise returned by `Promise.allSettled()`.
     * 
     * @param {any[]} promises 
     * @param {(value: any[]) => void} resolvePromise
     */
    function allSettledExecutor(promises, resolvePromise, rejectPromise) {
        var pendingCount = promises.length;
        var values = new Array(promises.length);

        if (pendingCount === 0) {
            resolvePromise(values)
            return;
        }

        function onSettledAt(index, value) {
            values[index] = value;
            if (--pendingCount <= 0)
                // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled#Return_value
                invokeFunctionAsync(resolvePromise, values);
        }
        watchPromises(promises, onSettledAt, onSettledAt);
    }

    /**
     * The executor to create the promise returned by `Promise.any()`.
     * 
     * @param {Promise} promises 
     * @param {(value: any) => void} onOneFulfilled 
     * @param {(reason: AggregateError) => void} onAllRejected 
     */
    function anyExecutor(promises, onOneFulfilled, onAllRejected) {
        var unrejectedCount = promises.length;
        var reasons = new Array(promises.length);
        var fulfilled = false;

        if (unrejectedCount === 0) {
            onAllRejected(new AggregateError(reasons));
            return;
        }

        function onFulfilledAt(index, value) {
            if (!fulfilled) {
                fulfilled = true;
                invokeFunctionAsync(onOneFulfilled, value);
            }
        }
        function onRejectedAt(index, reason) {
            reasons[index] = reason;
            if (--unrejectedCount <= 0)
                invokeFunctionAsync(onAllRejected, new AggregateError(reasons));
        }
        watchPromises(onFulfilledAt, onRejectedAt);
    }

    /**
     * The executor to create the promise returned by `Promise.race()`.
     * 
     * @param {Promise} promises 
     * @param {(value: any) => void} onOneFulfilled 
     * @param {(reason: AggregateError) => void} onAllRejected 
     */
    function raceExecutor(promises, resolvePromise, rejectPromise) {
        var settled = false;

        function onSettledAt(index, value) {
            if (!settled) {
                settled = true;
                invokeFunctionAsync(resolvePromise, value);
            }
        }
        watchPromises(promises, onSettledAt, onSettledAt);
    }

    /**
     * A executor function for `Promise` which do nothing.
     * 
     * By using this excutor, you can create a `Promise` which keeps pending.
     * 
     * @param {(value: any) => void} resolve 
     * @param {(reason: any) => void} reject 
     */
    function emptyExecutor(resolve, reject) { }








    /* Common Helper Functions */

    /**
     * Call a function asynchronizely.
     * It will be run only when the task stack of JS engine is empty.
     * 
     * @param {(...args: any) => void} func
     * @param {...any} args
     */
    function invokeFunctionAsync(func, args) {
        // Optimization for function with 0, 1 and 3 argument(s) 
        // since we only use these 3 conditions. 
        switch(arguments.length) {
            case 4:
                setTimeout(func, 0, arguments[1], arguments[2], arguments[3]);
                break;
            case 2:
                setTimeout(func, 0, arguments[1]);
                break;
            case 1:
                setTimeout(func, 0);
                break;
            case 0:
                throw new TypeError("No function passed as parameter");
            default:
                var argArray = Array.prototype.slice.call(arguments);
                argArray.splice(1, 0, 0);
                setTimeout.apply(this, argArray);
        }
    }

    /**
     * Curry a function which takes 2 parameter and fix its first argument.
     * Return the function which only need the 2nd argument. 
     * 
     * For currying, see https://en.wikipedia.org/wiki/Currying and https://javascript.info/currying-partials.
     * 
     * @param {(arg1: T1, arg2: T2) => T0} func  A function which requires 2 arguments.
     * @param {T1} arg1  The first argument to be passed to `func`.
     * @returns {(arg2: T2) => T0}  A new function will takes 1 argument. 
     *                              Calling it with `arg2` is equivalent to calling `func` with `(arg1, arg2)`
     */
    function curryBinary(func, arg1) {
        return function (arg2) {
            return func(arg1, arg2);
        }
    }

    /**
     * Curry a function which takes 3 parameter and fix its first argument.
     * Return the function which only need the 2 later arguments
     * 
     * @param {(arg1: T1, arg2: T2, arg3: T3) => T0} func  A function which requires3 arguments.
     * @param {T1} arg1  The first argument to be passed to `func`.
     * @returns {(arg2: T2, arg3: T3) => T0}  A new function will takes 1 argument. 
     *                                        Calling it with `arg2` is equivalent to calling `func` with `(arg1, arg2)`
     */
    function curryTenary(func, arg1) {
        return function (arg2, arg3) {
            return func(arg1, arg2, arg3);
        }
    }

    /**
     * Convert an iterable object to an array.
     * 
     * See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols.
     * 
     * @function
     * @type {(iterable: Interable) => Array}
     * 
     * @throws {TypeError}  when the argument is not iterable.
     */
    var iterableToArray;

    // ES6 with Array.from
    if (Array.from) {
        iterableToArray = Array.from;
    }
    // Incomplete ES6. Iterable exists but Array.from is not implemented.
    else if (typeof Symbol === "function" && Symbol.iterator) {
        iterableToArray = function (iterable) {
            if (iterable == null)
                throw TypeError("The argument should be iterable instead of null or undefined.");

            // Check that if `iterable` is Iterable.
            // Excepting Array, string or arguments because slice is quicker for them.
            if (typeof iterable[Symbol.iterator] === "function"
                && !((Array.isArray && Array.isArray(iterableToArray)) || iterable instanceof Array)
                && !(typeof iterable === "string" || iterable instanceof String)
                && !(iterable.prototype === arguments.prototype)
            ) {
                var result = [];
                var iterator = iterable[Symbol]();
                var iteratorReturn;
                while (!((iteratorReturn = iterator).done))
                    result.push(iteratorReturn.value);

                return result;
            }
            else {
                return Array.prototype.slice.apply(iterable);
            }
        }
    }
    // Not Iterable.
    else {
        iterableToArray = function (iterable) {
            return Array.prototype.slice.apply(iterable);
        }
    }







    
    /* Export */

    return {
        Promise: Promise,
        AggregateError: AggregateError
    };

})());