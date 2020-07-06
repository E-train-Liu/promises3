/**
 * An implementation of Promise for ES3.
 * 
 * @author Yichen Liu
 * @copyright (c) 2020 Yichen Liu
 * @license MIT
 */

(function (_Promise) {

    // CommonJS
    if (typeof module === "object" && module !== null)
        module.exports = _Promise;
    // AMD and CMD
    else if (typeof define === "function" && (define.amd || define.cmd))
        define(function () {
            return _Promise;
        });
    // Simply Polyfill
    else {
        if (typeof Promise === "undefined")
            Promise = _Promise;
    }

})((function () {

    /* Constructor */

    /**
     * Construct a `Promise` object.
     * 
     * @param {(
     *      resolve: (value?: any) => void,
     *      reject: (reason?: any) => void
     * ) => void} executor 
     */
    function Promise(executor) {

        if (!(this instanceof Promise))
            throw new TypeError("Promise constructor must be called with 'new' or on a Promise instance.");
        if (typeof executor !== "function")
            throw new TypeError("The argument of Promise constructor must be a function.");


        /** @private @type {any} */
        this["[[value]]"] = undefined;

        /** @private @type {"pending" | "fulfilled" | "rejected"} */
        this["[[status]]"] = "pending";

        /** 
         * @private
         * @type {{
         *      onFulfilled: any | (value: any) => any,
         *      onRejected: any | (reason: any) => any,
         *      returnedPromise: Promise     
         * }[]} 
         */
        this["[[thens]]"] = [];

        /** @private @type {boolean} */
        this["[[handled]]"] = false;

        // Optimization for internally used `emptyExecutor`
        if (executor === emptyExecutor)
            return;

        var once = new OncePromiseOperations(this);
        try {
            executor(once.resolve, once.reject);
        }
        catch (error) {
            once.reject(error);
        }
    }








    /* Member Functions */

    /**
     * Chain the current `Promise`. Define the callback to
     * be invoked when the current `Promise` is fulfilled or rejected.
     * 
     * @param {(value: any) => void} onFulfilled 
     * @param {(reason: any) => void} onRejected 
     */
    Promise.prototype.then = function (onFulfilled, onRejected) {
        this["[[handled]]"] = true;
        var returnedPromise = new Promise(emptyExecutor);

        switch (this["[[status]]"]) {
            case "fulfilled":
                invokeOnFulFilledCallbackAsync(onFulfilled, this["[[value]]"], returnedPromise);
                break;
            case "rejected":
                invokeOnRejectedCallbackAsync(onRejected, this["[[value]]"], returnedPromise);
                break;
            case "pending":
            default:
                this["[[thens]]"].push({
                    onFulfilled: onFulfilled,
                    onRejected: onRejected,
                    returnedPromise: returnedPromise
                });
                break;
        }

        return returnedPromise;
    }

    /**
     * Define callback to be invoked when the current `Promise` is rejected.
     * 
     * @param {(reason: any) => void} onRejected 
     */
    Promise.prototype["catch"] = function (onRejected) {
        return this.then(undefined, onRejected);
    }

    /**
     * Define callback to be invoked when the current `Promise` is
     * either fulfilled or rejected.
     * 
     * @param {(value: any) => void} onFinally 
     */
    Promise.prototype["finally"] = function (onFinally) {
        return this.then(onFinally, onFinally);
    }

    if (typeof Symbol === "function" && Symbol.toStringTag)
        Promise.prototype[Symbol.toStringTag] = "Promise";








    /* Static Functions */

    /**
     * Take an iterable consist of `Promise`, `Thenable` or value.
     * Return a single `Promise`.
     * 
     * The returned `Promise` will be fulfilled when all inputs are fulfilled 
     * and will be rejected if any of the input is rejected.
     * 
     * @param {Iterable} promises 
     * @returns {Promise}
     */
    Promise.all = function (promises) {
        var promiseArray = iterableToArray(promises);
        return new Promise(
            curry(allExecutor, promiseArray)
        );
    }

    /**
     * Take an iterable consist of `Promise`, `Thenable` or value.
     * Return a single `Promise`.
     * 
     * The returned `Promise` will be fulfilled when all inputs are
     * either fulfilled or rejected. 
     * 
     * @param {Iterable} promises
     * @returns {Promise}
     */
    Promise.allSettled = function (promises) {
        var promiseArray = iterableToArray(promises);
        return new Promise(
            curry(allSettledExecutor, promiseArray)
        );
    }

    /**
     * Take an iterable consist of `Promise`, `Thenable` or value.
     * Return a single `Promise`.
     * 
     * The returned `Promise` will be fulfilled when any of the input is first fulfilled 
     * and will be rejected if any of the input is first rejected.
     * 
     * @param {Iterable} promises
     * @returns {Promise}
     */
    Promise.race = function (promise) {
        var promiseArray = iterableToArray(promises);
        return new Promises(
            curry(raceExecutor, promiseArray)
        )
    }

    /**
     * Return a `Promise` rejected by `reason`.
     * 
     * @param {any} reason
     * @return {Promise} 
     */
    Promise.reject = function (reason) {
        return new Promise(function (resolve, reject) {
            reject(reason);
        });
    }

    /**
     * Return a `Promise` resolved by `value`.
     * 
     * @param {any} value
     * @return {Promise} 
     */
    Promise.resolve = function (value) {
        return new Promise(function (resolve, reject) {
            resolve(value);
        });
    }








    /* Helper Functions For Member Functions */

    /**
     * Resolve a promise anyway without checking that if it have not been resolved by 
     * a Thenable or another Promise.
     * 
     * Algorithm and standard: https://promisesaplus.com/#the-promise-resolution-procedure
     * 
     * @param {Promise} promise  The promise to be resolve.
     * @param {any | Thenable} [value]  The value used to resolve the promise.
     */
    function resolvePromise(promise, value) {

        // https://promisesaplus.com/#point-48
        //      A Promise cannot be resolved with itself. 
        if (promise === value) {
            rejectPromise(promise, new TypeError("Cannot resolve a promise with itself."));
            return;
        }

        // https://promisesaplus.com/#point-49
        //      If `value` is a `Promise`, the current `promise` will be 
        //      fulfilled or rejected following `value`
        if (value instanceof Promise) {
            value.then(
                curry(resolvePromise, promise),
                curry(rejectPromise, promise)
            );
            return;
        }

        try {
            var then = null;
            // https://promisesaplus.com/#point-54
            //      For Thenable.
            if (value !== null
                && (typeof value === "object" || typeof value === "function")
                && typeof (then = value.then) === "function"
            ) {
                var once = new OncePromiseOperations(promise);
                try {
                    then.call(value, once.resolve, once.reject);
                }
                // https://promisesaplus.com/#point-60
                //      If calling `then()` throw an error before
                //      `onRejected` is called, reject the `promise`.
                catch (error) {
                    once.reject(error);
                }
            }
            // https://promisesaplus.com/#point-63
            // https://promisesaplus.com/#point-64
            //      If `value` is not a object or a non-thenable object,
            //      fulfill the `promise` with it as value. 
            else
                fulfillPromise(promise, value);
        }
        catch (error) {
            // https://promisesaplus.com/#point-55
            //      If retriving `value.then` cause an `exception`, reject `promise` with `exception`
            rejectPromise(promise, error);
        }
    }

    /**
     * Fulfill a pending promise without checking that if the 
     * promise is pending and if it have been resolve by Thenable.
     * 
     * @param {Promise} promise 
     * @param {any} [value] 
     */
    function fulfillPromise(promise, value) {
        // Only pending `Promise` can be fulfilled.
        if (promise["[[status]]"] !== "pending")
            return;

        promise["[[value]]"] = value;
        promise["[[status]]"] = "fulfilled";
        invokeFunctionAsync(invokeOnFulFilledCallbacks, promise);
    }

    /**
     * Invoke all onFulfilled callbacks added to a `Promise` added by then().
     * 
     * Do nothing when no callbacks are added
     * 
     * @param {Promise} promise
     */
    function invokeOnFulFilledCallbacks(promise) {
        var value = promise["[[value]]"];
        var thens = promise["[[thens]]"];
        var thenCount = thens.length;
        for (var i = 0; i < thenCount; ++i) {
            var then = thens[i];
            invokeOnFulFilledCallbackAsync(then.onFulfilled, value, then.returnedPromise);
        }
    }

    /**
     * Invoke `onFulfilled` callback added by `then()` asynchronously
     * when it is a function. 
     * 
     * Resolve or reject the `returnedPromise` returned by then() according to
     * the `onFulfilled`. 
     * + If `onFulfilled` runs well, resolve the `returnedPromise` with the return value of `onFulfilled`.
     * + If `onFulfilled` is not a function, resolve the `returnedPromise` with the value of current promise.
     * + If `onFulfilled` throws an exception, reject `returnedPromise` with the exception
     * 
     * @param {any | (value: any) => any} onFulfilled 
     * @param {any} value 
     * @param {Promise} returnedPromise
     */
    function invokeOnFulFilledCallbackAsync(onFulfilled, value, returnedPromise) {
        if (typeof onFulfilled === "function")
            // https://promisesaplus.com/#point-34
            //      The `onFulfilled` and `onRejected` callbacks must be called async.
            invokeFunctionAsync(
                invokeThenCallback, onFulfilled, value, returnedPromise
            );
        // https://promisesaplus.com/#point-43
        //      If `onFulfilled` is not a function. Resolve the next promise with
        //      the value of this promise.
        else
            resolvePromise(returnedPromise, value);
    }


    /**
     * Reject the `promise` with given `reason`.
     * 
     * @param {Promise} promise 
     * @param {any} [reason] 
     */
    function rejectPromise(promise, reason) {

        // A promise can only be resolved when pending.
        if (promise["[[status]]"] !== "pending")
            return;

        promise["[[value]]"] = reason;
        promise["[[status]]"] = "rejected";
        invokeFunctionAsync(invokeOnRejectedCallbacks, promise);
    }

    /**
     * Invoke all onFulfilled callbacks added to a `Promise` added by then().
     * 
     * When then() is not called, then no callbacks are added. Throw the value of
     * the current promise as an error.
     * 
     * @param {Promise} promise
     * 
     * @throws {any} Throws the value of `promise` when its `then()` not called.
     */
    function invokeOnRejectedCallbacks(promise) {
        var reason = promise["[[value]]"];
        var thens = promise["[[thens]]"];
        var thenCount = thens.length;

        if (!promise["[[handled]]"])
            reportUnhandledRejection(reason);

        for (var i = 0; i < thenCount; ++i) {
            var then = thens[i];
            invokeOnRejectedCallbackAsync(then.onRejected, reason, then.returnedPromise);
        }
    }

    /**
     * Invoke `onRejected` callback added by `then()` asynchronously
     * when it is a function. 
     * 
     * Resolve or reject the `returnedPromise` returned by then() according to
     * the `onRejected`. 
     * + If `onRejected` runs well, resolve the `returnedPromise` with the return value of `onRejected`.
     * + If `onRejected` is not a function, reject the `returnedPromise` with the value of current promise.
     * + If `onRejected` throws an exception, reject `returnedPromise` with the exception
     * 
     * @param {any | (value: any) => any} onFulfilled 
     * @param {any} reason 
     * @param {Promise} returnedPromise
     */
    function invokeOnRejectedCallbackAsync(onRejected, reason, returnedPromise) {
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
            rejectPromise(returnedPromise, reason);
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
            resolvePromise(returnedPromise, callbackReturnValue)
        }
        catch (error) {
            // https://promisesaplus.com/#point-42
            //      When `onFulfilled` or `onRejected` throws an exception, 
            //      reject the next `Promise`.
            rejectPromise(returnedPromise, error);
        }
    }

    /**
     * Report a Promise was rejected but not handled.
     * Print warning on console.
     * 
     * @function
     * @type {(reason: any) => void}
     * 
     * @param {any} reason
     */
    function reportUnhandledRejection(reason) {
        if (typeof console !== "undefined" && console !== null && console.warn)
            console.warn("Unhandled Promise rejection: ", reason);
    }








    /* Helper Functions for Static Functions */

    /**
     * To watch an array of `Promise`s, add the same fulfill and reject
     * callback by `then()` on them. 
     * 
     * `Thenable`s will also be watched. If some of the `Thenable` call `onFulfilled`
     * or `onRejected` multiple times, only the first call will be reported.
     * 
     * If an element in the array with value `v` is not a `Thenable`, it will be seen as
     * an promise being fulfilled with `v`. 
     * 
     * @param {any[]} promiseArray 
     * @param {(index: number, value: any) => void} [onFulfilledAt]
     * @param {(index: number, reason: any) => void} [onRejectedAt]
     */
    function watchPromiseArray(promiseArray, onFulfilledAt, onRejectedAt) {
        var promiseCount = promiseArray.length;
        var isPending = arrayFilledWith(true, promiseCount);

        function onceOnFulfilledAt(index, value) {
            if (isPending[index]) {
                isPending[index] = false;
                onFulfilledAt(index, value);
            }
        }
        function onceOnRejectedAt(index, reason) {
            if (isPending[index]) {
                isPending[index] = false;
                onRejectedAt(index, reason);
            }
        }

        for (var i = 0; i < promiseCount; ++i) {
            var promise = promiseArray[i];
            try {
                var then = null;
                if (promise !== null
                    && (typeof promise === "object" || typeof promise === "function")
                    && typeof (then = promise.then) === "function"
                ) {
                    then.call(
                        promise,
                        curry(onceOnFulfilledAt, i),
                        curry(onceOnRejectedAt, i)
                    );
                }
                else
                    onceOnFulfilledAt(i, promise);
            }
            catch (error) {
                onceOnRejectedAt(error);
            }
        }
    }

    /**
     * The executor to create the promise returned by `Promise.all()`.
     * 
     * @param {any[]} promiseArray 
     * @param {(value: any[]) => void} resolve
     * @param {(reason: any) => void} reject 
     */
    function allExecutor(promiseArray, resolve, reject) {
        var promiseCount = promiseArray.length;
        var unfulfilledCount = promiseCount;
        var values = new Array(promiseCount);
        var isPendding = arrayFilledWith(true, promiseCount);
        var rejected = false;

        if (unfulfilledCount === 0) {
            resolve(values);
            return;
        }

        function onFulfilledAt(index, value) {
            values[index] = value;
            if (--unfulfilledCount <= 0)
                // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all#Fulfillment
                //      If all promises are fulfilled, the promise returned by `Promise.all()` should be fullfilled async.
                invokeFunctionAsync(resolve, values);
        }
        function onRejectedAt(index, reason) {
            if (!rejected) {
                rejected = true;
                invokeFunctionAsync(reject, reason);
            }
        }
        watchPromiseArray(promiseArray, onFulfilledAt, onRejectedAt);
    }

    /**
     * The executor to create the promise returned by `Promise.allSettled()`.
     * 
     * @param {any[]} promiseArray 
     * @param {(value: any[]) => void} resolve
     * @param {(value: any[]) => void} resolve
     */
    function allSettledExecutor(promiseArray, resolve, reject) {
        var pendingCount = promiseArray.length;
        var values = new Array(promiseArray.length);

        if (pendingCount === 0) {
            resolve(values)
            return;
        }

        function onSettledAt(index, value) {
            values[index] = value;
            if (--pendingCount <= 0)
                // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled#Return_value
                invokeFunctionAsync(resolve, values);
        }
        watchPromiseArray(promiseArray, onSettledAt, onSettledAt);
    }

    /**
     * The executor to create the promise returned by `Promise.race()`.
     * 
     * @param {any} promiseArray 
     * @param {(value: any) => void} resolve 
     * @param {(reason: any) => void} reject
     */
    function raceExecutor(promiseArray, resolve, reject) {
        var settled = false;

        function onSettledAt(index, value) {
            if (!settled) {
                settled = true;
                invokeFunctionAsync(resolve, value);
            }
        }
        watchPromiseArray(promiseArray, onSettledAt, onSettledAt);
    }

    /**
     * A executor function for `Promise` which do nothing.
     * 
     * By using this excutor, you can create a `Promise` which keeps pending.
     * 
     * @param {(value?: any) => void} resolve
     * @param {(reason?: any) => void} reject
     */
    function emptyExecutor(resolve, reject) { }







    /* Common Helper Functions */

    /**
     * Make a pair of functions `resolve` and `reject`, return an object
     * `result` that contains the warpper functions of them, `result.resolve`
     * and `result.reject`. These wrapper functions are once and mutex.
     * 
     * Which means
     * + Once `result.resolve` is called, any call to `result.reject` will
     *   be ignored. Vice versa.
     * + If `result.resolve` are called multiple times, only the first call will
     *   be accepted. This is also true for `result.reject`.
     * 
     * @param {Promise} promise
     * 
     */
    function OncePromiseOperations(promise) {
        var called = false;

        /**
         * Resolve the `promise` if `this.resolve()` 
         * and `this.reject()` have not been called.
         * @param {any} [value] 
         */
        this.resolve = function resolve(value) {
            if (!called) {
                called = true;
                resolvePromise(promise, value);
            }
        };

        /**
         * Reject the `promise` if `this.resolve()` 
         * and `this.reject()` have not been called.
         * @param {any} [reason]
         */
        this.reject = function reject(reason) {
            if (!called) {
                called = true;
                rejectPromise(promise, reason);
            }
        };
    }

    /**
     * Call a function asynchronizely.
     * It will be run only when the task stack of JS engine is empty.
     * 
     * For performance, see https://promisesaplus.com/#point-67
     * 
     * @function
     * @type {(
     *      func: (...args: any) => void,
     *      ...args: any
     * ) => void}
     * @param {(...args: any) => void} func
     * @param {...any} args
     */
    var invokeFunctionAsync;

    // NodeJS process.nextTick
    //      See method of checking whether the `process` is NodeJS's used in q
    //      at https://github.com/kriskowal/q/blob/master/q.js#L184
    if (typeof process === "object"
        && process.toString() === "[object process]"
        && typeof process.nextTick === "function"
    )
        invokeFunctionAsync = process.nextTick;
    // Some browsers: `setImmediate()`
    else if (typeof setImmediate === "function")
        invokeFunctionAsync = function (func) {
            setImmediate.apply(this, arguments);
        }
    // Otherwise, implement by `setTimeout()`
    else {
        // For IE 9 and earlier, `setTimeout` do not support additional arguments
        invokeFunctionAsync = function (func) {
            var argArray = Array.prototype.slice.call(arguments, 1);
            setTimeout(function () {
                func.apply(undefined, argArray);
            }, 0);
        }

        // Detect if the `setTimeout` allow additional arguments.
        setTimeout(function (canAddArg) {
            if (!canAddArg)
                return;
            
            // For modern browsers, `setTimeout` support additional arguments
            // avoid creating closure and copying array.
            invokeFunctionAsync = function (func) {
                // Optimization for function with 0, 1 and 3 argument(s) 
                // since we only use these 3 conditions. 
                switch (arguments.length) {
                    case 4:
                        setTimeout(func, 0, arguments[1], arguments[2], arguments[3]);
                        break;
                    case 2:
                        setTimeout(func, 0, arguments[1]);
                        break
                    case 1:
                        setTimeout(func, 0);
                        break;
                    case 0:
                        throw new TypeError("No function passed as parameter");
                    default:
                        var argArray = Array.prototype.slice.call(arguments);
                        argArray.splice(1, 0, 0);
                        setTimeout.apply(undefined, argArray);
                }
            }
        }, 0, true);


    }

    /**
     * Fixes the first parameter of a function.
     * 
     * Takes a function `func` which have several arguments `arg1`, `arg2`, ...  
     * Returns a curried function `curriedFunc`. Calling `curriedFunc(arg1, arg2, ...)` 
     * is equivalent to calling `func(arg0, arg1, arg2, ...)`.
     * 
     * Currying is a concept in funcational programming. For currying, 
     * see https://en.wikipedia.org/wiki/Currying and https://javascript.info/currying-partials.
     * 
     * @param {Function} func 
     * @param {any} arg1
     * @returns {Function}
     */
    function curry(func, arg0) {
        return function () {
            // Optimization when called with 0-2 arguments
            // Because we currently only use these cases.
            switch (arguments.length) {
                case 2:
                    return func(arg0, arguments[0], arguments[1]);
                case 1:
                    return func(arg0, arguments[0]);
                case 0:
                    return func(arg0);
                default:
                    var argArray = prependArguments(arg0, arguments);
                    func.apply(this, argArray);
            }
        }
    }

    /**
     * 
     * @param {any} arg0
     * @param {IArguments | any[]} argArray 
     * @returns {any[]} 
     */
    function prependArguments(arg0, argArray) {
        var argCount = argArray.length;
        var newArgArray = new Array(argCount + 1);

        newArgArray[0] = arg0;
        for (var i = 0; i < argCount; ++i)
            newArgArray[i + 1] = argArray[i];

        return newArgArray;
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
                // Optimization for Array, string and arguments 
                && !(iterable instanceof Array
                    || (typeof Array.isArray === "function" && Array.isArray(iterable))
                    || typeof iterable === "string" || iterable instanceof String
                    || typeof iterable.constructor === arguments.constructor
                )
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
    // Before ES6, no `Iterable`.
    else {
        iterableToArray = function (iterable) {
            return Array.prototype.slice.apply(iterable);
        }
    }

    /**
     * Return an array filled by `value`.
     * 
     * @param {T} value
     * @param {number} length
     * @returns {T[]}
     */
    function arrayFilledWith(value, length) {
        var array = new Array(length);

        if (array.fill)
            array.fill(value);
        else
            for (var i = 0; i < length; ++i)
                array[i] = value;

        return array;
    }








    /* Export */

    return Promise;

})());