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
        
        if (!Object.defineProperty)
            definePropertyUsable = false;
        else {
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
        }

        /**
         * @class
         * 
         * @param {Error[]} errors 
         * @param {string} [message]
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
        var returnedPromise = new Promise(EMPTY_EXECUTOR);

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

    Promise.prototype.toString = function () {
        // No specification on toString().
        // But Chrome, Firefox, Edge, Opera and Node.js all act like this.
        return "[object Promise]";
    }




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


    /**
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
                    invokeFunctionAsync(onFulfilledAt, i, promise);
            }
            catch(error) {
                invokeFunctionAsync(onRejectedAt, i, error);
            }
        }
    }

    /**
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
                resolvePromise(values);
        }
        function onRejectedAt(index, reason) {
            if (!rejected) {
                rejected = true;
                rejectPromise(reason);
            }
        }
        watchPromises(onFulfilledAt, onRejectedAt);
    }

    /**
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
                resolvePromise(values);
        }
        watchPromises(promises, onSettledAt, onSettledAt);
    }

    /**
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
                onOneFulfilled(value);
            }
        }
        function onRejectedAt(index, reason) {
            reasons[index] = reason;
            if (--unrejectedCount <= 0)
                onAllRejected(new AggregateError(reasons));
        }
        watchPromises(onFulfilledAt, onRejectedAt);
    }


    function raceExecutor(promises, resolvePromise, rejectPromise) {
        var settled = false;

        function onSettledAt(index, value) {
            if (!settled) {
                settled = true;
                resolvePromise(value);
            }
        }
        watchPromises(promises, onSettledAt, onSettledAt);
    }

    // If ES5 or above, take advantage of Object.defineProperty().
    // Config all functions to be unenumerable, which is they should be in ES6.
    // For IE8, Object.defineProperty() exists but will throw an error when
    // being applied on non-DOM objects.
    try {
        // Standard descriptor for ES6 member functions.
        var descriptor = {
            value: null,
            configurable: true,
            enumerable: false,
            writeable: true
        };

        for (var k in Promise) {
            descriptor.value = Promise[k];
            Object.defineProperty(Promise, k, descriptor);
        }
        for (var k in Promise.prototype) {
            descriptor.value = Promise.prototype[k];
            Object.defineProperty(Promise.prototype, k, descriptor);
        }
    }
    catch (error) { }

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
     * 
     * @param {Promise} promise 
     * @param {any} value 
     */
    function fulfill(promise, value) {
        // When fulfill the promise:
        // + Set its status to "fulfilled".
        // + Set its value.
        // + Call all onFulfilled callback (added by promise.then()).
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
     * 
     * @param {any | (value: any) => any} onFulfilled 
     * @param {any} value 
     * @param {Promise} nextPromise
     */
    function invokeOnFulFilledCallback(onFulfilled, value, returnedPromise) {
        if (typeof onFulfilled === "function")
            invokeFunctionAsync(
                invokeThenCallback, onFulfilled, result, returnedPromise
            );
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
     * 
     * @param {any | (value: any) => any} onFulfilled 
     * @param {any} reason 
     * @param {Promise} nextPromise
     */
    function invokeOnRejectedCallback(onRejected, reason, returnedPromise) {
        if (typeof onRejected === "function")
            invokeFunctionAsync(
                invokeThenCallback, onRejected, reason, returnedPromise
            );
        else
            reject(returnedPromise, reason);
    }


    /**
     * 
     * @param {(value: any) => void} callback 
     * @param {any} value 
     * @param {Promise} returnedPromise 
     */
    function invokeThenCallback(callback, value, returnedPromise) {
        try {
            var callbackReturnValue = callback(value);
            resolve(returnedPromise, callbackReturnValue)
        }
        catch (error) {
            reject(returnedPromise, error);
        }
    }

    /**
     * Call a function asynchronizely.
     * It will be run only when the task stack of JS engine is empty.
     * 
     * @param {(...args: any) => void} func
     * @param {...any} args
     */
    function invokeFunctionAsync(func, args) {
        // Optimization for function with 0-3 argument.s
        switch(arguments.length) {
            case 4:
                setTimeout(func, 0, arguments[1], arguments[2], arguments[3]);
                break;
            case 3:
                setTimeout(func, 0, arguments[1], arguments[2]);
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
     * 
     * @param {(arg1: T1, arg2: T2) => T0} func 
     * @param {T1} arg1
     * @returns {(arg2: T2) => T0}
     */
    function curryBinary(func, arg1) {
        return function (arg2) {
            return func(arg1, arg2);
        }
    }

    /**
     * 
     * @param {(arg1: T1, arg2: T2, arg3: T3) => T0} func 
     * @param {T1} arg1
     * @returns {(arg2: T2, arg3: T3) => T0}
     */
    function curryTenary(func, arg1) {
        return function (arg2, arg3) {
            return func(arg1, arg2, arg3);
        }
    }

    /**
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


    function EMPTY_EXECUTOR(resolve, reject) { }

    return {
        Promise: Promise,
        AggregateError: AggregateError
    };

})());