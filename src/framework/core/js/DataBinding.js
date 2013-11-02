/*
Copyright 2008-2010 University of Cambridge
Copyright 2008-2009 University of Toronto
Copyright 2010-2011 Lucendo Development Ltd.
Copyright 2010 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options
/*jslint white: true, funcinvoke: true, continue: true, elsecatch: true, operator: true, jslintok:true, undef: true, newcap: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
    /** NOTE: The contents of this file are by default NOT PART OF THE PUBLIC FLUID API unless explicitly annotated before the function **/
  
    /** MODEL ACCESSOR ENGINE **/

    /** Standard strategies for resolving path segments **/
    
    fluid.model.makeEnvironmentStrategy = function (environment) {
        return function (root, segment, index) {
            return index === 0 && environment[segment] ?
                environment[segment] : undefined;
        };
    };

    fluid.model.defaultCreatorStrategy = function (root, segment) {
        if (root[segment] === undefined) {
            root[segment] = {};
            return root[segment];
        }
    };

    fluid.model.defaultFetchStrategy = function (root, segment) {
        return segment === "" ? root : root[segment];
    };

    fluid.model.funcResolverStrategy = function (root, segment) {
        if (root.resolvePathSegment) {
            return root.resolvePathSegment(segment);
        }
    };

    fluid.model.traverseWithStrategy = function (root, segs, initPos, config, uncess) {
        var strategies = config.strategies;
        var limit = segs.length - uncess;
        for (var i = initPos; i < limit; ++i) {
            if (!root) {
                return root;
            }
            var accepted = undefined;
            for (var j = 0; j < strategies.length; ++ j) {
                accepted = strategies[j](root, segs[i], i + 1, segs);
                if (accepted !== undefined) {
                    break; // May now short-circuit with stateless strategies
                }
            }
            if (accepted === fluid.NO_VALUE) {
                accepted = undefined;
            }
            root = accepted;
        }
        return root;
    };

    /** Returns both the value and the path of the value held at the supplied EL path **/
    fluid.model.getValueAndSegments = function (root, EL, config, initSegs) {
        return fluid.model.accessWithStrategy(root, EL, fluid.NO_VALUE, config, initSegs, true);
    };

    // Very lightweight remnant of trundler, only used in resolvers
    fluid.model.makeTrundler = function (config) {
        return function (valueSeg, EL) {
            return fluid.model.getValueAndSegments(valueSeg.root, EL, config, valueSeg.segs);
        };
    };

    fluid.model.getWithStrategy = function (root, EL, config, initSegs) {
        return fluid.model.accessWithStrategy(root, EL, fluid.NO_VALUE, config, initSegs);
    };

    fluid.model.setWithStrategy = function (root, EL, newValue, config, initSegs) {
        fluid.model.accessWithStrategy(root, EL, newValue, config, initSegs);
    };

    fluid.model.accessWithStrategy = function (root, EL, newValue, config, initSegs, returnSegs) {
        // This function is written in this unfortunate style largely for efficiency reasons. In many cases
        // it should be capable of running with 0 allocations (EL is preparsed, initSegs is empty)
        if (!fluid.isPrimitive(EL) && !fluid.isArrayable(EL)) {
            var key = EL.type || "default";
            var resolver = config.resolvers[key];
            if (!resolver) {
                fluid.fail("Unable to find resolver of type " + key);
            }
            var trundler = fluid.model.makeTrundler(config); // very lightweight trundler for resolvers
            var valueSeg = {root: root, segs: initSegs};
            valueSeg = resolver(valueSeg, EL, trundler);
            if (EL.path && valueSeg) { // every resolver supports this piece of output resolution
                valueSeg = trundler(valueSeg, EL.path);
            }
            return returnSegs ? valueSeg : (valueSeg ? valueSeg.root : undefined);
        }
        else {
            return fluid.model.accessImpl(root, EL, newValue, config, initSegs, returnSegs, fluid.model.traverseWithStrategy);
        }
    };

    // Implementation notes: The EL path manipulation utilities here are somewhat more thorough
    // and expensive versions of those provided in Fluid.js - there is some duplication of
    // functionality. This is a tradeoff between stability and performance - the versions in
    // Fluid.js are the most frequently used and do not implement escaping of characters .
    // as \. and \ as \\ as the versions here. The implementations here are not
    // performant and are left here partially as an implementation note. Problems will
    // arise if clients manipulate JSON structures containing "." characters in keys as if they
    // are models. The basic utilities fluid.path(), fluid.parseEL and fluid.composePath are
    // the ones recommended for general users and the following implementations will
    // be upgraded to use regexes in future to make them better alternatives

    fluid.registerNamespace("fluid.pathUtil");

    var getPathSegmentImpl = function (accept, path, i) {
        var segment = null; // TODO: rewrite this with regexes and replaces
        if (accept) {
            segment = "";
        }
        var escaped = false;
        var limit = path.length;
        for (; i < limit; ++i) {
            var c = path.charAt(i);
            if (!escaped) {
                if (c === '.') {
                    break;
                }
                else if (c === '\\') {
                    escaped = true;
                }
                else if (segment !== null) {
                    segment += c;
                }
            }
            else {
                escaped = false;
                if (segment !== null) {
                    segment += c;
                }
            }
        }
        if (segment !== null) {
            accept[0] = segment;
        }
        return i;
    };

    var globalAccept = []; // TODO: serious reentrancy risk here, why is this impl like this?

    /** A version of fluid.model.parseEL that apples escaping rules - this allows path segments
     * to contain period characters . - characters "\" and "}" will also be escaped. WARNING -
     * this current implementation is EXTREMELY slow compared to fluid.model.parseEL and should
     * not be used in performance-sensitive applications */
    // supported, PUBLIC API function
    fluid.pathUtil.parseEL = function (path) {
        var togo = [];
        var index = 0;
        var limit = path.length;
        while (index < limit) {
            var firstdot = getPathSegmentImpl(globalAccept, path, index);
            togo.push(globalAccept[0]);
            index = firstdot + 1;
        }
        return togo;
    };

    // supported, PUBLIC API function
    fluid.pathUtil.composeSegment = function (prefix, toappend) {
        toappend = toappend.toString();
        for (var i = 0; i < toappend.length; ++i) {
            var c = toappend.charAt(i);
            if (c === '.' || c === '\\' || c === '}') {
                prefix += '\\';
            }
            prefix += c;
        }
        return prefix;
    };

    /** Escapes a single path segment by replacing any character ".", "\" or "}" with
     * itself prepended by \
     */
     // supported, PUBLIC API function
    fluid.pathUtil.escapeSegment = function (segment) {
        return fluid.pathUtil.composeSegment("", segment);
    };

    /**
     * Compose a prefix and suffix EL path, where the prefix is already escaped.
     * Prefix may be empty, but not null. The suffix will become escaped.
     */
    // supported, PUBLIC API function
    fluid.pathUtil.composePath = function (prefix, suffix) {
        if (prefix.length !== 0) {
            prefix += '.';
        }
        return fluid.pathUtil.composeSegment(prefix, suffix);
    };

    // supported, PUBLIC API record
    fluid.model.defaultGetConfig = {
        strategies: [fluid.model.funcResolverStrategy, fluid.model.defaultFetchStrategy]
    };

    // supported, PUBLIC API record
    fluid.model.defaultSetConfig = {
        strategies: [fluid.model.funcResolverStrategy, fluid.model.defaultFetchStrategy, fluid.model.defaultCreatorStrategy]
    };

    // supported, PUBLIC API record
    fluid.model.escapedGetConfig = {
        parser: {
            parse: fluid.pathUtil.parseEL,
            compose: fluid.pathUtil.composePath
        },
        strategies: [fluid.model.defaultFetchStrategy]
    };

    // supported, PUBLIC API record
    fluid.model.escapedSetConfig = {
        parser: {
            parse: fluid.pathUtil.parseEL,
            compose: fluid.pathUtil.composePath
        },
        strategies: [fluid.model.defaultFetchStrategy, fluid.model.defaultCreatorStrategy]
    };

    /** MODEL COMPONENT HIERARCHY AND RELAY SYSTEM **/
    
    fluid.initSimpleModel = function (that, optionsModel) {
        return that.model = optionsModel || {};
    };
    
    fluid.initRelayModel = function (that, modelRelayModel) {
        return modelRelayModel;
    };
    
    // TODO: This utility compensates for our lack of control over "wave of explosions" initialisation - we may
    // catch a model when it is apparently "completely initialised" and that's the best we can do, since we have
    // missed its own initial transaction
    
    fluid.isModelComplete = function (that) {
        return that.model !== fluid.inEvaluationMarker;
    };
    
    // Enlist this model component as part of the "initial transaction" wave - note that "special transaction" init
    // is indexed by component, not by applier, and has special record type (complete + initModel), not transaction
    fluid.enlistModelComponent = function (that) {
        var instantiator = fluid.getInstantiator(that);
        var applier = fluid.getForComponent(that, "applier");
        var enlist = instantiator.modelTransactions.init[that.id];
        if (!enlist) {
            enlist = {
                that: that,
                complete: fluid.isModelComplete(that) 
            }
            instantiator.modelTransactions.init[that.id] = enlist;
        }
        return enlist;
    };
    
    // Operate all coordinated transactions by bringing models to their respective initial values, and then commit them all
    fluid.operateInitialTransaction = function (mrec) {
        var transId = fluid.allocateGuid();
        var transacs = fluid.transform(mrec, function (recel) {
            if (!fluid.isModelComplete(recel.that)) { // note we don't use the "complete" flag since status may have changed
                recel.that.model = undefined; // Abuse of the ginger system - in fact it is "currently in evaluation"
            }
            return recel.that.applier.initiate(transId);
        });
        fluid.each(mrec, function (recel) {
            fluid.each(recel.initModels, function (initModel) {
                transacs[recel.that.id].fireChangeRequest({type: "ADD", segs: [], value: initModel});
            });
        });
        fluid.each(transacs, function (transac) {
            transac.commitOnly();
        });
    };
    
    // This modelComponent has now concluded initialisation - commit its initialisation transaction
    fluid.deenlistModelComponent = function (that) {
        var instantiator = fluid.getInstantiator(that);
        var mrec = instantiator.modelTransactions.init; 
        mrec[that.id].complete = true;
        var incomplete = fluid.find_if(mrec, function (recel) {
            return recel.complete !== true;
        });
        if (!incomplete) {
            fluid.operateInitialTransaction(mrec);
        }
        instantiator.modelTransactions.init = {};
    };
    
    fluid.model.commitRelays = function (instantiator, transactionId) {
        var transRec = instantiator.modelTransactions[transactionId];
        fluid.each(transRec, function (trans) {
            if (trans.commitOnly) { // some entries are links
                trans.commitOnly();
            }
        });
        delete instantiator.modelTransactions[transactionId];
    };
    
    // Gets global record for a particular transaction id - looks up applier id to transaction,
    // as well as looking up source id (linkId in below) to count/true
    fluid.getModelTransactionRec = function (instantiator, transId) {
        var transRec = instantiator.modelTransactions[transId];
        if (!transRec) {
            transRec = instantiator.modelTransactions[transId] = {};
        }
        return transRec;
    };
    
    fluid.registerDirectChangeRelay = function (target, targetSegs, source, sourceSegs, linkId) {
        var instantiator = fluid.getInstantiator(target), applierId = target.applier.applierId;
        targetSegs = fluid.makeArray(targetSegs);
        sourceSegs = fluid.makeArray(sourceSegs); // take copies since originals will be trashed
        var sourceListener = function (newValue, oldValue, path, changeRequest) {
            var transId = changeRequest.transactionId;
            var transRec = fluid.getModelTransactionRec(instantiator, transId);
            var existing = transRec[applierId];
            var initRecord = instantiator.modelTransactions.init[target.id];
            var noRelay = initRecord && initRecord[linkId] === "noRelay";
            if ((!existing || !transRec[linkId]) && !noRelay) {
                var newTrans = target.applier.initiate(transId);
                transRec[applierId] = newTrans;
                transRec[linkId] = true; 
                newTrans.fireChangeRequest({type: "ADD", segs: targetSegs, value: newValue});
            }
        };
        source.applier.modelChanged.addListener({
            segs: sourceSegs,
            groupId: applierId
        }, sourceListener);
    };
    
    fluid.parseImplicitRelay = function (that, modelRec, segs) {
        var value;
        if (typeof(modelRec) === "string" && modelRec.charAt(0) === "{") {
            var parsed = fluid.parseContextReference(modelRec);
            parsed.segs = fluid.model.parseEL(parsed.path);
            var target = fluid.resolveContext(parsed.context, that);
            if (parsed.segs[0] === "model") {
                var linkId = fluid.allocateGuid();
                var enlist = fluid.enlistModelComponent(target);
                var modelSegs = parsed.segs.slice(1);
                if (enlist.complete) {
                   // TODO: This really SHOULD use relay since it may involve a transform etc. - this implies we should get to 
                   // RE-OBSERVE the init model change in the case we missed it (a "promised model"!)
                    value = fluid.get(target.model, modelSegs);
                    enlist[linkId] = "noRelay"; // avoid trying to broadcast this BACK to target again as part of relay
                }
                // it is THESE listeners which will get to observe the "fake re-init" morally generated by replacement for fluid.get above
                fluid.registerDirectChangeRelay(that, segs, target, modelSegs, linkId);
                fluid.registerDirectChangeRelay(target, modelSegs, that, segs, linkId);
            } else {
                value = fluid.getForComponent(target, parsed.segs);
            }
        } else if (fluid.isPrimitive(modelRec) || !fluid.isPlainObject(modelRec)) {
            value = modelRec;
        } else {
            value = fluid.freshContainer(modelRec);
            fluid.each(modelRec, function (innerValue, key) {
                segs.push(key);
                var innerTrans = fluid.parseImplicitRelay(that, innerValue, segs);
                if (innerTrans !== undefined) {
                     value[key] = innerTrans;
                }
                segs.pop();
            });
        }
        return value;
    };
    
    fluid.establishModelRelay = function (that, optionsModel, optionsML, optionsMR, applier) {
        fluid.mergeModelListeners(that, optionsML);
        
        // parse optionsMR and register too
        
        var initModels = fluid.transform(optionsModel, function (modelRec) {
            return fluid.parseImplicitRelay(that, modelRec, []);  
        });
        var enlist = fluid.enlistModelComponent(that);
        enlist.initModels = initModels;
        fluid.deenlistModelComponent(that);
        var instantiator = fluid.getInstantiator(that);

        function commitRelays(transaction, newTransaction) {
            fluid.model.commitRelays(instantiator, transaction.id);
        }
        applier.preCommit.addListener(commitRelays);
        
        return applier.holder.model;
    };
    
    // Grade common to "old" and "new" model components
    fluid.defaults("fluid.commonModelComponent", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        mergePolicy: {
            modelListeners: fluid.makeMergeListenersPolicy(fluid.arrayConcatPolicy)
        }
    });
    
    // supported, PUBLIC API grade
    fluid.defaults("fluid.modelComponent", {
        gradeNames: ["fluid.commonModelComponent", "autoInit"], 
        members: {
            model: "@expand:fluid.initSimpleModel({that}, {that}.options.model)",
            applier: "@expand:fluid.makeChangeApplier({that}.model, {that}.options.changeApplierOptions)",
            modelListeners: "@expand:fluid.mergeModelListeners({that}, {that}.options.modelListeners)"
        },
        mergePolicy: {
            model: "preserve"
        }
    });
    
    fluid.defaults("fluid.modelRelayComponent", {
        gradeNames: ["fluid.commonModelComponent", "fluid.eventedComponent", "autoInit"],
        changeApplierOptions: {
            relayStyle: true,
            cullUnchanged: true
        },
        members: {
            model: "@expand:fluid.initRelayModel({that}, {that}.modelRelay)",
            applier: "@expand:fluid.makeNewChangeApplier({that}, {that}.options.changeApplierOptions)",
            modelRelay: "@expand:fluid.establishModelRelay({that}, {that}.options.model, {that}.options.modelListeners, {that}.options.modelRelay, {that}.applier)"
        },
        model: null, // a hack to force the mergePolicy to convert records to array
        mergePolicy: {
            model: {
                noexpand: true,
                func: fluid.arrayConcatPolicy
            },
            modelRelay: fluid.arrayConcatPolicy
        }
    });

    // supported, PUBLIC API record    
    fluid.defaults("fluid.standardComponent", {
        gradeNames: ["fluid.modelComponent", "fluid.eventedComponent", "autoInit"]
    });

    fluid.defaults("fluid.standardRelayComponent", {
        gradeNames: ["fluid.modelRelayComponent", "autoInit"]
    });
    
    fluid.modelChangedToChange = function (newApplier, args) {
        var newModel = args[0], oldModel = args[1], path = args[3]; // in 4th position for old applier 
        return newApplier ? {
            value: args[0],
            oldValue: args[1],
            path: args[2]
        } : {
            value: fluid.get(newModel, path),
            oldValue: fluid.get(oldModel, path),
            path: path
        };
    };
 
    fluid.resolveModelListener = function (that, record) {
        var newApplier = fluid.hasGrade(that.options, "fluid.modelRelayComponent");
        var togo = function (newModel, oldModel, changes, path) {
            var change = fluid.modelChangedToChange(newApplier, arguments)
            var args = [change];
            var localRecord = {change: change, arguments: args};
            if (record.args) {
                args = fluid.expandOptions(record.args, that, {}, localRecord); 
            }
            fluid.event.invokeListener(record.listener, fluid.makeArray(args));
        };
        fluid.event.impersonateListener(record.listener, togo);
        return togo;
    };
    
    var modelPrefix = "model.";

    fluid.resolveModelReference = function (that, path) {
        var togo;
        if (path.charAt(0) === "{") {
            var parsed = fluid.parseContextReference(path);
            var context = fluid.resolveContext(parsed.context, that);
            if (!context || !context.applier) {
                fluid.fail("Cannot look up model reference " + path + " to a model component with applier");
            }
            if (parsed.path.indexOf(modelPrefix) !== 0) {
                fluid.fail("Path in model reference " + path + " must begin with \"model.\"");
            }
            togo = {
                that: context,
                path: parsed.path.substring(modelPrefix.length)
            };
        } else {
            togo = {
                that: that,
                path: path
            };
        }
        togo.applier = fluid.getForComponent(togo.that, "applier");
        return togo;
    };

    fluid.mergeModelListeners = function (that, listeners) {
        fluid.each(listeners, function (value, path) {
            if (typeof(value) === "string") {
                value = {
                    funcName: value
                };
            }
            var records = fluid.event.resolveListenerRecord(value, that, "modelListeners", null, false);
            var parsed = fluid.resolveModelReference(that, path);
            // Bypass fluid.event.dispatchListener by means of "standard = false" and enter our custom workflow including expanding "change":
            fluid.each(records.records, function (record) {
                var func = fluid.resolveModelListener(that, record);
                fluid.addSourceGuardedListener(parsed.applier, {
                    groupId: that.id,
                    path: parsed.path,
                    transactional: true
                }, record.guardSource, func, "modelChanged", record.namespace, record.softNamespace);
                fluid.recordListener(parsed.applier.modelChanged, func, fluid.shadowForComponent(that));
            });  
        });
    };


    /** CHANGE APPLIER **/

    /** COMMON UTILITIES common between old and new ChangeAppliers **/

    /** Add a listener to a ChangeApplier event that only acts in the case the event
     * has not come from the specified source (typically ourself)
     * @param modelEvent An model event held by a changeApplier (typically applier.modelChanged)
     * @param path The path specification to listen to
     * @param source The source value to exclude (direct equality used)
     * @param func The listener to be notified of a change
     * @param [eventName] - optional - the event name to be listened to - defaults to "modelChanged"
     * @param [namespace] - optional - the event namespace
     */
    fluid.addSourceGuardedListener = function(applier, path, source, func, eventName, namespace, softNamespace) {
        eventName = eventName || "modelChanged";
        var wrapped = function (newValue, oldValue, path, changes) { // TODO: adapt signature
            if (!applier.hasChangeSource(source, changes)) {
                return func.apply(null, arguments);
            }
        };
        fluid.event.impersonateListener(func, wrapped);
        applier[eventName].addListener(path, wrapped, namespace, softNamespace);
    };

    /** Convenience method to fire a change event to a specified applier, including
     * a supplied "source" identified (perhaps for use with addSourceGuardedListener)
     */
    fluid.fireSourcedChange = function (applier, path, value, source) {
        applier.fireChangeRequest({
            path: path,
            value: value,
            source: source
        });
    };

    /** Dispatches a list of changes to the supplied applier */
    fluid.requestChanges = function (applier, changes) {
        for (var i = 0; i < changes.length; ++i) {
            applier.fireChangeRequest(changes[i]);
        }
    };


    // Automatically adapts requestChange onto fireChangeRequest
    fluid.bindRequestChange = function (that) {
        that.requestChange = function (path, value, type) {
            var changeRequest = {
                path: path,
                value: value,
                type: type
            };
            that.fireChangeRequest(changeRequest);
        };
    };

    fluid.identifyChangeListener = function (listener) {
        return fluid.event.identifyListener(listener) || listener;
    };


    /** NEW CHANGEAPPLIER IMPLEMENTATION (Will be default in Infusion 2.0 onwards **/

    fluid.typeCode = function (totest) {
        return fluid.isPrimitive(totest) || !fluid.isPlainObject(totest) ? "primitive" : 
            fluid.isArrayable(totest) ? "array" : "object" 
    };
    
    fluid.model.isChangedPath = function (changeMap, segs) {
        for (var i = 0; i <= segs.length; ++ i) {
            if (typeof(changeMap) === "string") {
                return true;
            }
            if (i < segs.length && changeMap) {
                changeMap = changeMap[segs[i]];
            }
        }
        return false;
    };

    fluid.model.setChangedPath = function (options, segs, value) {
        var notePath = function (record) {
            segs.unshift(record);
            fluid.model.setSimple(options, segs, value);
            segs.shift();          
        };
        if (!fluid.model.isChangedPath(options.changeMap, segs)) {
            ++ options.changes;
            notePath("changeMap");
        }
        notePath("deltaMap");
    };

    fluid.model.fetchChangeChildren = function (target, i, segs, source, options) {
        fluid.each(source, function (value, key) {
            segs[i] = key;
            fluid.model.applyChangeStrategy(target, key, i, segs, value, options);
            segs.length = i;
        });
    };

    fluid.model.applyChangeStrategy = function (target, name, i, segs, source, options, atRoot) {
        var targetSlot = target[name];
        var sourceCode = fluid.typeCode(source);
        var targetCode = fluid.typeCode(targetSlot);
        var changedValue = fluid.NO_VALUE;
        if (sourceCode === "primitive") {
            if (targetSlot !== source) {
                changedValue = source;
            }
        } else if (targetCode !== sourceCode) { // RH is not primitive - array or object and mismatching
            changedValue = fluid.freshContainer(source);
        }
        if (changedValue !== fluid.NO_VALUE) {
            target[name] = changedValue;
            if (options.changeMap) {
                fluid.model.setChangedPath(options, segs, "ADD");
            }
        }
        if (sourceCode !== "primitive") {
            fluid.model.fetchChangeChildren(target[name], i + 1, segs, source, options);
        }
    };
    
    fluid.model.stepTargetAccess = function (target, type, segs, startpos, endpos, options) {
        for (var i = startpos; i < endpos; ++ i) {
            var oldTrunk = target[segs[i]];
            var target = fluid.model.traverseWithStrategy(target, segs, i, options[type === "ADD" ? "resolverSetConfig" : "resolverGetConfig"], 
                segs.length - i - 1);
            if (oldTrunk !== target && options.changeMap) {
                fluid.model.setChangedPath(options, segs.slice(0, i + 1), "ADD");
            }
        }
        return {root: target, last: segs[endpos]};
    };
    
    fluid.model.defaultAccessorConfig = function (options) {
        options = options || {};
        options.resolverSetConfig = options.resolverSetConfig || fluid.model.defaultSetConfig;
        options.resolverGetConfig = options.resolverGetConfig || fluid.model.defaultGetConfig;
        return options;      
    }
    
    // After the 1.5 release, this will replace the old "applyChangeRequest"
    // Changes: "MERGE" action abolished
    // ADD/DELETE at root can be destructive
    // changes tracked in optional final argument holding "changeMap: {}, changes: 0"
    fluid.model.applyHolderChangeRequest = function (holder, request, options) {
        options = fluid.model.defaultAccessorConfig(options);
        options.deltaMap = options.changeMap ? {} : null;
        var length = request.segs.length;
        var pen, atRoot = length === 0;
        if (atRoot) {
            pen = {root: holder, last: "model"};
        } else {
            pen = fluid.model.stepTargetAccess(holder.model, request.type, request.segs, 0, length - 1, options);
        }
        if (request.type === "ADD") {
            var value = request.value;
            var segs = fluid.makeArray(request.segs);
            fluid.model.applyChangeStrategy(pen.root, pen.last, length - 1, segs, value, options, atRoot);
        } else if (request.type === "DELETE") {
            if (pen.root && pen.root[pen.last] !== undefined) {
                delete pen.root[pen.last];
                if (options.changeMap) {
                    fluid.model.setChangedPath(options, request.segs, "DELETE");
                }
            }
        } else {
            fluid.fail("Unrecognised change type of " + request.type);
        }
        return options.deltaMap;
    };
    
    // Here we only support for now very simple expressions which have at most one
    // wildcard which must appear in the final segment
    fluid.matchChanges = function (changeMap, specSegs, newHolder) {
        var root = newHolder.model;
        var map = changeMap;
        var outSegs = ["model"];
        var wildcard = false;
        var togo = [];
        for (var i = 0; i < specSegs.length; ++ i) {
            var seg = specSegs[i];
            if (seg === "*") {
                if (i === specSegs.length - 1) {
                    wildcard = true;
                } else {
                    fluid.fail("Wildcard specification in modelChanged listener is only supported for the final path segment: " + specSegs.join("."));
                }
            } else {
                outSegs.push(seg);
                map = fluid.isPrimitive(map) ? map : map[seg];
                root = root ? root[seg] : undefined;
            }
        }
        if (map) {
            if (wildcard) {
                fluid.each(root, function (value, key) {
                    togo.push(outSegs.concat(key));
                });
            } else {
                togo.push(outSegs);
            }
        }
        return togo;
    };

    fluid.notifyModelChanges = function (listeners, changeMap, newHolder, oldHolder, changeRequest) {
        for (var i = 0; i < listeners.length; ++ i) {
            var spec = listeners[i];
            var invalidPaths = fluid.matchChanges(changeMap, spec.segs, newHolder);
            for (var j = 0; j < invalidPaths.length; ++ j) {
                var invalidPath = invalidPaths[j];
                spec.listener = fluid.event.resolveListener(spec.listener);
                // TODO: process namespace and softNamespace rules, and propagate "sources" in 4th argument
                spec.listener(fluid.model.getSimple(newHolder, invalidPath), fluid.model.getSimple(oldHolder, invalidPath), invalidPath.slice(1), changeRequest); 
            }
        }
    };
    
    fluid.makeNewChangeApplier = function (holder, options) {
        options = fluid.model.defaultAccessorConfig(options);
        function preFireChangeRequest(changeRequest) {
            if (!changeRequest.type) {
                changeRequest.type = "ADD";
            }
            changeRequest.segs = changeRequest.segs || fluid.model.pathToSegments(changeRequest.path, options.resolverSetConfig);
        }
        var applierId = fluid.allocateGuid(); 
        var that = {
            applierId: applierId,
            holder: holder,
            changeListeners: {
                listeners: [],
                transListeners: []
            },
            modelChanged: {},
            preCommit: fluid.makeEventFirer(null, null, "preCommit event for ChangeApplier " + applierId)
        };
        that.modelChanged.addListener = function (spec, listener, namespace, softNamespace) {
            if (typeof(spec) === "string") {
                spec = {path: spec}
            } else {
                spec = fluid.copy(spec);
            }
            spec.id = fluid.event.identifyListener(listener);
            spec.namespace = namespace;
            spec.softNamespace = softNamespace;
            if (typeof(listener) === "string") { // TODO: replicate this nonsense from Fluid.js until we remember its purpose
                listener = {globalName: listener};
            }
            spec.listener = listener;
            transactional = spec.transactional;
            spec.segs = spec.segs || fluid.model.pathToSegments(spec.path, options.parser);
            var collection = transactional ? "transListeners" : "listeners";
            that.changeListeners[collection].push(spec);
        };
        that.modelChanged.removeListener = function (listener) {
            var id, key;
            if (fluid.isPrimitive(listener)) {
                id = fluid.event.identifyChangeListener(listener);
                key = "id";
            } else {
                id = listener.groupId;
                key = "groupId";
            }
            var removePred = function (record) {
                return record[key] === id; 
            };
            fluid.remove_if(that.changeListeners.listeners, removePred);
            fluid.remove_if(that.changeListeners.transListeners, removePred);
        };
        that.fireChangeRequest = function (changeRequest) {
            var ation = that.initiate();
            ation.fireChangeRequest(changeRequest);
            ation.commit();
        };
        
        that.initiate = function (transactionId) {
            var newHolder = { model: fluid.copy(holder.model) };
            var trans = {
                id: transactionId || fluid.allocateGuid(),
                newHolder: newHolder,
                changeRecord: {
                    changes: 0,
                    changeMap: {},
                    resolverSetConfig: options.resolverSetConfig,
                    resolverGetConfig: options.resolverGetConfig
                },
                commitOnly: function () {
                    fluid.notifyModelChanges(that.changeListeners.transListeners, trans.changeRecord.changeMap, newHolder, holder, {transactionId: trans.id});
                    holder.model = newHolder.model; // It's really as simple as that : P                      
                },
                commit: function () {
                    that.preCommit.fire(trans, that);
                    trans.commitOnly();
                },
                fireChangeRequest: function (changeRequest) {
                    preFireChangeRequest(changeRequest);
                    changeRequest.transactionId = trans.id;
                    var deltaMap = fluid.model.applyHolderChangeRequest(newHolder, changeRequest, trans.changeRecord);
                    fluid.notifyModelChanges(that.changeListeners.listeners, deltaMap, newHolder, holder, changeRequest);
                }
            };
            fluid.bindRequestChange(trans);
            return trans;
        };
        that.hasChangeSource = function (source, changes) { // compatibility for old API
            return changes ? changes[source] : false;
        };
        
        fluid.bindRequestChange(that);
        return that;
    };


    /** OLD CHANGEAPPLIER IMPLEMENTATION (Infusion 1.5 and before - this will be removed on Fluid 2.0) **/

    /** Parses a path segment, following escaping rules, starting from character index i in the supplied path */
    fluid.pathUtil.getPathSegment = function (path, i) {
        getPathSegmentImpl(globalAccept, path, i);
        return globalAccept[0];
    };

    /** Returns just the head segment of an EL path */
    fluid.pathUtil.getHeadPath = function (path) {
        return fluid.pathUtil.getPathSegment(path, 0);
    };

    /** Returns all of an EL path minus its first segment - if the path consists of just one segment, returns "" */
    fluid.pathUtil.getFromHeadPath = function (path) {
        var firstdot = getPathSegmentImpl(null, path, 0);
        return firstdot === path.length ? "" : path.substring(firstdot + 1);
    };

    function lastDotIndex(path) {
        // TODO: proper escaping rules
        return path.lastIndexOf(".");
    }

    /** Returns all of an EL path minus its final segment - if the path consists of just one segment, returns "" -
     * WARNING - this method does not follow escaping rules */
    fluid.pathUtil.getToTailPath = function (path) {
        var lastdot = lastDotIndex(path);
        return lastdot === -1 ? "" : path.substring(0, lastdot);
    };

    /** Returns the very last path component of an EL path
     * WARNING - this method does not follow escaping rules */
    fluid.pathUtil.getTailPath = function (path) {
        var lastdot = lastDotIndex(path);
        return fluid.pathUtil.getPathSegment(path, lastdot + 1);
    };

    /** Helpful utility for use in resolvers - matches a path which has already been
      * parsed into segments **/

    fluid.pathUtil.matchSegments = function (toMatch, segs, start, end) {
        if (end - start !== toMatch.length) {
            return false;
        }
        for (var i = start; i < end; ++ i) {
            if (segs[i] !== toMatch[i - start]) {
                return false;
            }
        }
        return true;
    };

    /** Determine the path by which a given path is nested within another **/
    // TODO: This utility is not used in the framework, and will cease to be useful in client code
    // once we move over to the declarative system for change binding
    fluid.pathUtil.getExcessPath = function (base, longer) {
        var index = longer.indexOf(base);
        if (index !== 0) {
            fluid.fail("Path " + base + " is not a prefix of path " + longer);
        }
        if (base.length === longer.length) {
            return "";
        }
        if (longer[base.length] !== ".") {
            fluid.fail("Path " + base + " is not properly nested in path " + longer);
        }
        return longer.substring(base.length + 1);
    };

    /** Determines whether a particular EL path matches a given path specification.
     * The specification consists of a path with optional wildcard segments represented by "*".
     * @param spec (string) The specification to be matched
     * @param path (string) The path to be tested
     * @param exact (boolean) Whether the path must exactly match the length of the specification in
     * terms of path segments in order to count as match. If exact is falsy, short specifications will
     * match all longer paths as if they were padded out with "*" segments
     * @return (array of string) The path segments which matched the specification, or <code>null</code> if there was no match
     */

    fluid.pathUtil.matchPath = function (spec, path, exact) {
        var togo = [];
        while (true) {
            if (((path === "") ^ (spec === "")) && exact) {
                return null;
            }
            // FLUID-4625 - symmetry on spec and path is actually undesirable, but this
            // quickly avoids at least missed notifications - improved (but slower)
            // implementation should explode composite changes
            if (!spec || !path) {
                break;
            }
            var spechead = fluid.pathUtil.getHeadPath(spec);
            var pathhead = fluid.pathUtil.getHeadPath(path);
            // if we fail to match on a specific component, fail.
            if (spechead !== "*" && spechead !== pathhead) {
                return null;
            }
            togo.push(pathhead);
            spec = fluid.pathUtil.getFromHeadPath(spec);
            path = fluid.pathUtil.getFromHeadPath(path);
        }
        return togo;
    };

    fluid.model.isNullChange = function (model, request, resolverGetConfig) {
        if (request.type === "ADD" && !request.forceChange) {
            var existing = fluid.get(model, request.segs, resolverGetConfig);
            if (existing === request.value) {
                return true;
            }
        }
    };

    /** Applies the supplied ChangeRequest object directly to the supplied model.
     */
     
    fluid.model.applyChangeRequest = function (model, request, resolverSetConfig) {
        var pen = fluid.model.accessWithStrategy(model, request.path, fluid.VALUE, resolverSetConfig || fluid.model.defaultSetConfig, null, true);
        var last = pen.segs[pen.segs.length - 1];

        if (request.type === "ADD" || request.type === "MERGE") {
            if (pen.segs.length === 0 || (request.type === "MERGE" && pen.root[last])) {
                if (request.type === "ADD") {
                    fluid.clear(pen.root);
                }
                $.extend(true, pen.segs.length === 0 ? pen.root : pen.root[last], request.value);
            }
            else {
                pen.root[last] = request.value;
            }
        }
        else if (request.type === "DELETE") {
            if (pen.segs.length === 0) {
                fluid.clear(pen.root);
            }
            else {
                delete pen.root[last];
            }
        }
    };

    // Utility used for source tracking in changeApplier

    function sourceWrapModelChanged(modelChanged, threadLocal) {
        return function (changeRequest) {
            var sources = threadLocal().sources;
            var args = arguments;
            var source = changeRequest.source || "";
            fluid.tryCatch(function () {
                if (sources[source] === undefined) {
                    sources[source] = 0;
                }
                ++sources[source];
                modelChanged.apply(null, args);
            }, null, function() {
                --sources[source];
            });
        };
    }
    
    
    /** The core creator function constructing ChangeAppliers. See API documentation
     * at http://wiki.fluidproject.org/display/fluid/ChangeApplier+API for the various
     * options supported in the options structure */
    
    fluid.makeChangeApplier = function (model, options) {
        return fluid.makeHolderChangeApplier({model: model}, options);
    };

    /** Make a "new-style" ChangeApplier that allows the base model reference to be overwritten. This is
     *  re-read on every access from the object "holder" (in typical usage, the component owning the 
     *  ChangeApplier) */
     
    fluid.makeHolderChangeApplier = function (holder, options) {
        options = options || {};
        var baseEvents = {
            guards: fluid.event.getEventFirer(false, true, "guard event"),
            postGuards: fluid.event.getEventFirer(false, true, "postGuard event"),
            modelChanged: fluid.event.getEventFirer(false, false, "modelChanged event")
        };
        var threadLocal = fluid.threadLocal(function() { return {sources: {}};});
        var that = {
        // For now, we don't use "id" to avoid confusing component detection which uses
        // a simple algorithm looking for that field
            applierid: fluid.allocateGuid(),
            holder: holder
        };

        function makeGuardWrapper(cullUnchanged) {
            if (!cullUnchanged) {
                return null;
            }
            var togo = function (guard) {
                return function (model, changeRequest, internalApplier) {
                    var oldRet = guard(model, changeRequest, internalApplier);
                    if (oldRet === false) {
                        return false;
                    }
                    else {
                        if (fluid.model.isNullChange(model, changeRequest)) {
                            togo.culled = true;
                            return false;
                        }
                    }
                };
            };
            return togo;
        }

        function wrapListener(listener, spec) {
            var pathSpec = spec;
            var transactional = false;
            var priority = Number.MAX_VALUE;
            if (typeof (spec) === "string") {
                spec = {path: spec};
            }
            pathSpec = spec.path;
            transactional = spec.transactional;
            if (spec.priority !== undefined) {
                priority = spec.priority;
            }
            if (pathSpec.charAt(0) === "!") {
                transactional = true;
                pathSpec = pathSpec.substring(1)
            }
            var wrapped = function (changePath, fireSpec, accum) {
                var guid = fluid.event.identifyListener(listener);
                var exist = fireSpec.guids[guid];
                if (!exist || !accum) {
                    var match = fluid.pathUtil.matchPath(pathSpec, changePath);
                    if (match !== null) {
                        var record = {
                            match: match,
                            pathSpec: pathSpec,
                            listener: listener,
                            priority: priority,
                            transactional: transactional
                        };
                        if (accum) {
                            record.accumulate = [accum];
                        }
                        fireSpec.guids[guid] = record;
                        var collection = transactional ? "transListeners" : "listeners";
                        fireSpec[collection].push(record);
                        fireSpec.all.push(record);
                    }
                }
                else if (accum) {
                    if (!exist.accumulate) {
                        exist.accumulate = [];
                    }
                    exist.accumulate.push(accum);
                }
            };
            fluid.event.impersonateListener(listener, wrapped);
            return wrapped;
        }

        function fireFromSpec(name, fireSpec, args, category, wrapper) {
            return baseEvents[name].fireToListeners(fireSpec[category], args, wrapper);
        }

        function fireComparator(recA, recB) {
            return recA.priority - recB.priority;
        }

        function prepareFireEvent(name, changePath, fireSpec, accum) {
            baseEvents[name].fire(changePath, fireSpec, accum);
            fireSpec.all.sort(fireComparator);
            fireSpec.listeners.sort(fireComparator);
            fireSpec.transListeners.sort(fireComparator);
        }

        function makeFireSpec() {
            return {guids: {}, all: [], listeners: [], transListeners: []};
        }

        function getFireSpec(name, changePath) {
            var fireSpec = makeFireSpec();
            prepareFireEvent(name, changePath, fireSpec);
            return fireSpec;
        }

        function fireEvent(name, changePath, args, wrapper) {
            var fireSpec = getFireSpec(name, changePath);
            return fireFromSpec(name, fireSpec, args, "all", wrapper);
        }

        function adaptListener(that, name) {
            that[name] = {
                addListener: function (spec, listener, namespace, softNamespace) {
                    baseEvents[name].addListener(wrapListener(listener, spec), namespace, null, null, softNamespace);
                },
                removeListener: function (listener) {
                    baseEvents[name].removeListener(listener);
                }
            };
        }
        adaptListener(that, "guards");
        adaptListener(that, "postGuards");
        adaptListener(that, "modelChanged");

        function preFireChangeRequest(changeRequest) {
            if (!changeRequest.type) {
                changeRequest.type = "ADD";
            }
            changeRequest.segs = fluid.model.pathToSegments(changeRequest.path, options.resolverSetConfig);
        }

        var bareApplier = {
            fireChangeRequest: function (changeRequest) {
                that.fireChangeRequest(changeRequest, true);
            }
        };
        fluid.bindRequestChange(bareApplier);

        // This function is a helper to participate in the process of model initialisation. During a component's construction,
        // values may arise in the model that it would be helpful if could be broadcast so that listeners could react in the normal
        // workflow of changeEvents. Right now, a ChangeApplier user must request this event manually which creates an "early time period"
        // in which the model contents are inconsistent, but in the future we might like to fire this at the point of creation of the
        // ChangeApplier, especially once FLUID-4258 is implemented and we can head off the risk of "late listeners".
        that.initModelEvent = function () {
            var newModel = {};
            fluid.model.copyModel(newModel, holder.model);
            fluid.clear(holder.model);
            that.requestChange("", newModel);
        };

        that.fireChangeRequest = function (changeRequest, defeatGuards) {
            preFireChangeRequest(changeRequest);
            var guardFireSpec = defeatGuards ? null : getFireSpec("guards", changeRequest.path);
            var postGuardSpec = getFireSpec("postGuards", changeRequest.path);
//            if (guardFireSpec && guardFireSpec.transListeners.length > 0 || postGuardSpec.transListeners.length > 0) {
                var ation = that.initiate();
                ation.fireChangeRequest(changeRequest);
                ation.commit();
//            }
/*            else {
                if (!defeatGuards) {
                    // TODO: this use of "listeners" seems pointless since we have just verified that there are no transactional listeners
                    var prevent = fireFromSpec("guards", guardFireSpec, [holder.model, changeRequest, bareApplier], "listeners");
                    if (prevent === false) {
                        return false;
                    }
                }
                var oldModel = holder.model;
                if (!options.thin) {
                    oldModel = {};
                    fluid.model.copyModel(oldModel, holder.model);
                }
                fluid.model.applyChangeRequest(holder.model, changeRequest, options.resolverSetConfig);
                fireAgglomerated("modelChanged", "all", [changeRequest], [holder.model, oldModel, null, null], 2, 3);
            }
            */
        };

        that.fireChangeRequest = sourceWrapModelChanged(that.fireChangeRequest, threadLocal);
        fluid.bindRequestChange(that);

        // TODO: modelChanged has been moved to new model for firing. Once we abolish "guards", fireAgglomerated can go too.
        // Possibly also all the prepareFireEvent/wrapListener/fireSpec nonsense too. 
        function fireAgglomerated(eventName, formName, changes, args, accpos, matchpos) {
            var fireSpec = makeFireSpec();
            for (var i = 0; i < changes.length; ++i) {
                prepareFireEvent(eventName, changes[i].path, fireSpec, changes[i]);
            }
            for (var j = 0; j < fireSpec[formName].length; ++j) {
                var spec = fireSpec[formName][j];
                if (accpos !== undefined) {
                    args[accpos] = spec.accumulate;
                }
                if (matchpos !== undefined) {
                    args[matchpos] = spec.match;
                }
                var ret = spec.listener.apply(null, args);
                if (ret === false) {
                    return false;
                }
            }
        }

        that.initiate = function (newModel) {
            var cancelled = false;
            var changes = [];
            if (options.thin) {
                newModel = holder.model;
            }
            else {
                newModel = newModel || {};
                fluid.model.copyModel(newModel, holder.model);
            }
            var ation = {
                commit: function () {
                    var oldModel;
                    if (cancelled) {
                        return false;
                    }
                    var ret = fireAgglomerated("postGuards", "transListeners", changes, [newModel, null, ation], 1);
                    if (ret === false || cancelled) {
                        return false;
                    }
                    if (options.thin) {
                        oldModel = holder.model;
                    }
                    else {
                        oldModel = {};
                        fluid.model.copyModel(oldModel, holder.model);
                        fluid.clear(holder.model);
                        fluid.model.copyModel(holder.model, newModel);
                    }
                    fireAgglomerated("modelChanged", "all", changes, [holder.model, oldModel, null, null], 2, 3);
                },
                fireChangeRequest: function (changeRequest) {
                    preFireChangeRequest(changeRequest);
                    if (options.cullUnchanged && fluid.model.isNullChange(holder.model, changeRequest, options.resolverGetConfig)) {
                        return;
                    }
                    var wrapper = makeGuardWrapper(options.cullUnchanged);
                    var prevent = fireEvent("guards", changeRequest.path, [newModel, changeRequest, ation], wrapper);
                    if (prevent === false && !(wrapper && wrapper.culled)) {
                        cancelled = true;
                    }
                    if (!cancelled) {
                        if (!(wrapper && wrapper.culled)) {
                            fluid.model.applyChangeRequest(newModel, changeRequest, options.resolverSetConfig);
                            changes.push(changeRequest);
                        }
                    }
                }
            };

            ation.fireChangeRequest = sourceWrapModelChanged(ation.fireChangeRequest, threadLocal);
            fluid.bindRequestChange(ation);

            return ation;
        };

        that.hasChangeSource = function (source) {
            return threadLocal().sources[source] > 0;
        };

        return that;
    };
    
    /** Old "SuperApplier" implementation - will be removed in 1.5 **/

    fluid.makeSuperApplier = function () {
        var subAppliers = [];
        var that = {};
        that.addSubApplier = function (path, subApplier) {
            subAppliers.push({path: path, subApplier: subApplier});
        };
        that.fireChangeRequest = function (request) {
            for (var i = 0; i < subAppliers.length; ++i) {
                var path = subAppliers[i].path;
                if (request.path.indexOf(path) === 0) {
                    var subpath = request.path.substring(path.length + 1);
                    var subRequest = fluid.copy(request);
                    subRequest.path = subpath;
                    // TODO: Deal with the as yet unsupported case of an EL rvalue DAR
                    subAppliers[i].subApplier.fireChangeRequest(subRequest);
                }
            }
        };
        fluid.bindRequestChange(that);
        return that;
    };

    fluid.attachModel = function (baseModel, path, model) {
        var segs = fluid.model.parseEL(path);
        for (var i = 0; i < segs.length - 1; ++i) {
            var seg = segs[i];
            var subModel = baseModel[seg];
            if (!subModel) {
                baseModel[seg] = subModel = {};
            }
            baseModel = subModel;
        }
        baseModel[segs[segs.length - 1]] = model;
    };

    fluid.assembleModel = function (modelSpec) {
        var model = {};
        var superApplier = fluid.makeSuperApplier();
        var togo = {model: model, applier: superApplier};
        for (var path in modelSpec) {
            var rec = modelSpec[path];
            fluid.attachModel(model, path, rec.model);
            if (rec.applier) {
                superApplier.addSubApplier(path, rec.applier);
            }
        }
        return togo;
    };

})(jQuery, fluid_1_5);
