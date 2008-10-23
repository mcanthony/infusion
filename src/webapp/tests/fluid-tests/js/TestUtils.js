/*
Copyright 2007 - 2008 University of Toronto
Copyright 2007-2008 University of Cambridge

Licensed under the Educational Community License(ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://source.fluidproject.org/svn/LICENSE.txt
*/

var fluid = fluid || {};
fluid.testUtils = fluid.testUtils || {};

/*
 * A number of utility functions for creating "duck-type" events for testing various key
 * stroke combinations.
 */

fluid.testUtils.ctrlKeyEvent = function(keyCode, target) {
    return fluid.testUtils.modKeyEvent("CTRL", keyCode, target);
};

fluid.testUtils.keyEvent = function(keyCode, target) {
    return {
            keyCode: fluid.reorderer.keys[keyCode],
            target: fluid.unwrap(target),
            preventDefault: function(){}, stopPropagation: function(){}};
    };

fluid.testUtils.modKeyEvent = function(modifier, keyCode, target) {
    var togo = fluid.testUtils.keyEvent(keyCode, target);
    modifier = jQuery.makeArray(modifier);
    for (var i = 0; i < modifier.length; ++ i) {
        var mod = modifier[i];
        if (mod === "CTRL") {
            togo.ctrlKey = true;
        }
        else if (mod === "SHIFT") {
            togo.shiftKey = true;
        }
        else if (mod === "ALT") {
            togo.altKey = true;
        }
    }
    return togo;
};

/** Condense a DOM node into a plain Javascript object, to facilitate testing against
 * a trial, with the use of assertDeepEq or similar
 */
fluid.testUtils.assertNode = function(message, expected, node) {
    var togo = {};
    if (node.length === 1) {
        node = node[0];
    }
    if (node.length > 1) {
        jqUnit.assertEquals("Unexpected number of nodes " + message, expected.length, node.length);
        for (var i = 0; i < node.length; ++ i) {
            fluid.testUtils.assertNode(message + ": node " + i + ": ", expected[i], node[i]);
        }
        
    }
    else {
        for (var key in expected) {
            var attr = node.getAttribute(key);
            var messageExt = " - attribute " + key + ": ";
            if (key === "nodeName") {
               attr = node.tagName.toLowerCase();
               messageExt = " - node name: "
            }
            if (key === "nodeText") {
               attr = jQuery.trim(fluid.dom.getElementText(node));
            }
            jqUnit.assertEquals(message + messageExt, expected[key], attr);
        }
    }
  
}
