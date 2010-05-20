var EXPORTED_SYMBOLS = [ "Utils" ];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/StringUtils.jsm");
var Application = Cc["@mozilla.org/fuel/application;1"]
                    .getService(Ci.fuelIApplication);

/**
 * Utility functions to be used by multiple windows
 */
Utils = {
  LS_NS: "http://songbirdnest.com/rdf/library-servicepane#",

}
