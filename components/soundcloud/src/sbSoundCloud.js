/* *=BEGIN SONGBIRD GPL
 *
 * This file is part of the Songbird web player.
 *
 * Copyright(c) 2005-2010 POTI, Inc.
 * http://www.songbirdnest.com
 *
 * This file may be licensed under the terms of of the
 * GNU General Public License Version 2 (the ``GPL'').
 *
 * Software distributed under the License is distributed
 * on an ``AS IS'' basis, WITHOUT WARRANTY OF ANY KIND, either
 * express or implied. See the GPL for the specific language
 * governing rights and limitations.
 *
 * You should have received a copy of the GPL along with this
 * program. If not, go to http://www.gnu.org/licenses/gpl.html
 * or write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
 *
 *=END SONGBIRD GPL
 */

/**
 * \file sbSoundCloud.js
 * \brief Service component for SoundCloud.
 */
const Cc = Components.classes;
const CC = Components.Constructor;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/StringUtils.jsm");
var Application = Cc["@mozilla.org/fuel/application;1"]
                    .getService(Ci.fuelIApplication);

const NS = 'http://www.songbirdnest.com/lastfm#';
const SB_NS = 'http://songbirdnest.com/data1.0#';
const SP_NS = 'http://songbirdnest.com/rdf/servicepane#';

const SOCL_URL = 'https://api.soundcloud.com';
const CONSUMER_SECRET = "YqGENlIGpWPnjQDJ2XCLAur2La9cTLdMYcFfWVIsnvw";
const CONSUMER_KEY = "eJ2Mqrpr2P4TdO62XXJ3A";
const SIG_METHOD = "HMAC-SHA1";

var OAUTH_TOKEN = '';
var TOKEN_SECRET = '';

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
// import observer utils
//Cu.import("resource://app/jsmodules/ObserverUtils.jsm");

// object to manage login state
var Logins = {
  loginManager: Cc["@mozilla.org/login-manager;1"]
      .getService(Ci.nsILoginManager),

  LOGIN_HOSTNAME: 'http://soundcloud.com',
  LOGIN_FIELD_USERNAME: 'username',
  LOGIN_FIELD_PASSWORD: 'password',

  get: function() {
    // username & password
    var username = '';
    var password = '';
    // lets ask the login manager
    var logins = this.loginManager.findLogins({}, this.LOGIN_HOSTNAME,
                                              '', null);
    for (var i = 0; i < logins.length; i++) {
      if (i==0) {
        // use the first username & password we find
        username = logins[i].username;
        password = logins[i].password;
      } else {
        // get rid of the rest
        this.loginManager.removeLogin(logins[i]);
      }
    }
    return {username: username, password: password};
  },

  set: function(username, password) {
    var logins = this.loginManager.findLogins({}, this.LOGIN_HOSTNAME,
                                              '', null);
    for (var i=0; i<logins.length; i++) {
      this.loginManager.removeLogin(logins[i]);
    }
    // set new login info
    var nsLoginInfo = new CC("@mozilla.org/login-manager/loginInfo;1",
      Ci.nsILoginInfo, "init");
    this.loginManager.addLogin(new nsLoginInfo(this.LOGIN_HOSTNAME,
        '', null, username, password,
        this.LOGIN_FIELD_USERNAME, this.LOGIN_FIELD_PASSWORD));
  }
}

function Listeners() {
  var listeners = [];
  this.add = function Listeners_add(aListener) {
    listeners.push(aListener);
  }
  this.remove = function Listeners_remove(aListener) {
    for(;;) {
      // find our listener in the array
      let i = listeners.indexOf(aListener);
      if (i >= 0) {
        // remove it
        listeners.splice(i, 1);
      } else {
        return;
      }
    }
  }
  this.each = function Listeners_each(aCallback) {
    for (var i=0; i<listeners.length; i++) {
      try {
        aCallback(listeners[i]);
      } catch(e) {
        Cu.reportError(e);
      }
    }
  }
}

function urlencode(obj) {
  var params = '';

  for (let p in obj) {
    if (p == 0) {
      params += obj[p][0] + "=" + obj[p][1];
    } else {
      params += "&" + obj[p][0] + "=" + obj[p][1];
    }
  }

  return params;
}

function GET(url, params, onload, onerror) {
  var xhr = null;

  try {
    xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
    xhr.mozBackgroundRequest = true;
    xhr.onload = function(event) { onload(xhr); }
    xhr.onerror = function(event) { onerror(xhr); }
    xhr.open('GET', url + "?" + params, true);
    xhr.setRequestHeader('Authorization', 'OAuth');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send();
  } catch(e) {
    Cu.reportError(e);
    onerror(xhr);
  }
  return xhr;
}

function POST(url, params, onload, onerror) {
  var xhr = null;

  try {
    xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
    xhr.mozBackgroundRequest = true;
    xhr.onload = function(event) { onload(xhr); }
    xhr.onerror = function(event) { onerror(xhr); }
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.setRequestHeader('Content-length', params.length);
    xhr.setRequestHeader('Connection', 'close');
    xhr.send(params);
  } catch(e) {
    Cu.reportError(e);
    onerror(xhr);
  }
  return xhr;
}

/**
 *
 */
function sbSoundCloud() {
  this.wrappedJSObject = this;
  Cu.import("resource://soundcloud/OAuth.jsm");

  this.listeners = new Listeners();

  var login = Logins.get();
  this.username = login.username;
  this.password = login.password;

  this._nowplaying_url = null;

  this.__defineGetter__('nowplaying_url', function() {
    return this._nowplaying_url;
  });
  this.__defineSetter__('nowplaying_url', function(val) {
    this._nowplaying_url = val;
  });

  var prefsService = Cc['@mozilla.org/preferences-service;1']
      .getService(Ci.nsIPrefBranch);

  this._retry_count = 0;

  /*
  this.__defineGetter__('autoLogin', function() {
    return prefsService.getBoolPref('extensions.soundcloud.autologin');
  });
  this.__defineSetter__('autoLogin', function(val) {
    prefsService.setBoolPref('extensions.soundcloud.autologin', val);
    this.listeners.each(function(l) { l.onAutoLoginChanged(val); });
  });
  */

  this._loggedIn = false;
  this.__defineGetter__('loggedIn', function() { return this._loggedIn; });
  this.__defineSetter__('loggedIn', function(aLoggedIn){
    this._loggedIn = aLoggedIn;
    this.listeners.each(function(l) { l.onLoggedInStateChanged(); });
  });

  // get the playback history service
  this._playbackHistory =
      Cc['@songbirdnest.com/Songbird/PlaybackHistoryService;1']
        .getService(Ci.sbIPlaybackHistoryService);
  // add ourselves as a playlist history listener
  this._playbackHistory.addListener(this);

  this._mediacoreManager = Cc['@songbirdnest.com/Songbird/Mediacore/Manager;1']
    .getService(Ci.sbIMediacoreManager);
  this._mediacoreManager.addListener(this);

  this._strings =
    Cc["@mozilla.org/intl/stringbundle;1"]
      .getService(Ci.nsIStringBundleService)
      .createBundle("chrome://soundcloud/locale/overlay.properties");

  this._servicePaneService = Cc['@songbirdnest.com/servicepane/service;1']
    .getService(Ci.sbIServicePaneService);

  // find a radio folder if it already exists
  var radioFolder = this._servicePaneService.getNode("SB:RadioStations");
  if (!radioFolder) {
    radioFolder = this._servicePaneService.createNode();
    radioFolder.id = "SB:RadioStations";
    radioFolder.className = "folder radio";
    radioFolder.name = this._strings.GetStringFromName("radio.label");
    radioFolder.setAttributeNS(SB_NS, "radioFolder", 1); // for backward-compat
    radioFolder.setAttributeNS(SP_NS, "Weight", 2);
    this._servicePaneService.root.appendChild(radioFolder);
  }
  radioFolder.editable = false;

  var soclRadio = this._servicePaneService.getNode("SB:RadioStations:SoundCloud");
  if (!soclRadio) {
    this._servicePaneNode = this._servicePaneService.createNode();
    this._servicePaneNode.url = "chrome://soundcloud/content/directory.xul";
    this._servicePaneNode.id = "SB:RadioStations:SoundCloud";
    this._servicePaneNode.name = "SoundCloud";
    this._servicePaneNode.image = 'chrome://soundcloud/skin/sc.png';
    this._servicePaneNode.editable = false;
    this._servicePaneNode.hidden = false;
    radioFolder.appendChild(this._servicePaneNode);
  }

  this.updateServicePaneNodes();
}

// XPCOM Voodoo
sbSoundCloud.prototype.classDescription = 'Songbird SoundCloud Service';
sbSoundCloud.prototype.contractID = '@songbirdnest.com/soundcloud;1';
sbSoundCloud.prototype.classID =
    Components.ID('{dfa0469c-1dd1-11b2-a34d-aea86aafaf52}');
sbSoundCloud.prototype.QueryInterface =
    XPCOMUtils.generateQI([Ci.sbISoundCloudService]);

sbSoundCloud.prototype.updateServicePaneNodes = function updateSPNodes() {
  var radioFolder = this._servicePaneService.getNode("SB:RadioStations");
}

sbSoundCloud.prototype.shouldAutoLogin =
function sbSoundCloud_shouldAutoLogin() {
  return this.autoLogin && this.username && this.password;
}

sbSoundCloud.prototype.login =
function sbSoundCloud_login(clearSession) {
  var self = this;
  self.requestToken(function req_success() {
                      self.authorize(function auth_success() {
                                       dump("Authorized!");
                                     },
                                     function auth_failure() {
                                       dump("Token fail!");
                                     });
                      }, function req_failure() {
                           dump("Request token fail!");
                         });
  return;
}

sbSoundCloud.prototype.sign = function sbSoundCloud_sign(message) {
  var baseString = this.getBaseString(message);
  var signature = b64_hmac_sha1(encodeURIComponent(CONSUMER_SECRET)
                                + "&" + encodeURIComponent(TOKEN_SECRET), 
                                baseString);
  return signature;
}

sbSoundCloud.prototype.getBaseString =
function sbSoundCloud_getBaseString(message) {
  var params = message.parameters;
  var s = "";
  for (var p in params) {
    if (params[p][0] != 'oauth_signature') {
      if (p == 0) {
        s = params[p][0] + "=" + params[p][1];
      } else {
        s += "&" + params[p][0] + "=" + params[p][1];
      }
    }
  }

  return message.method + '&' + encodeURIComponent(message.action)
                        + '&' + encodeURIComponent(s);
}

sbSoundCloud.prototype.getParameters =
function sbSoundCloud_getParameters(url, mtype) {
  var self = this;
  var accessor = { consumerSecret: CONSUMER_SECRET };
  var message = { action: url,
                  method: mtype,
                  parameters: []
                };

  message.parameters.push(['oauth_consumer_key', CONSUMER_KEY]);
  message.parameters.push(['oauth_nonce', OAuth.nonce(11)]);
  message.parameters.push(['oauth_signature_method', SIG_METHOD]);
  message.parameters.push(['oauth_timestamp', OAuth.timestamp()]);
  if (OAUTH_TOKEN)
    message.parameters.push(['oauth_token', OAUTH_TOKEN]);
  message.parameters.push(['oauth_version', "1.0"]);

  message.parameters.push(['oauth_signature', self.sign(message)]);

  return urlencode(message.parameters);
}

sbSoundCloud.prototype.requestToken =
function sbSoundCloud_requestToken(success, failure) {
  var self = this;
  self.listeners.each(function(l) { l.onLoginBegins(); });

  OAUTH_TOKEN = "";
  TOKEN_SECRET = "";

  var url = SOCL_URL + "/oauth/request_token";

  var params = self.getParameters(url, 'POST');

  self._reqtoken_xhr = POST(url, params,
      function(xhr) {
        /* success function
          - Need to make sure request is valid: "Invalid OAuth Request"
        */
        let response = xhr.responseText;
        if (response == "Invalid OAuth Request") {
          if (self._retry_count < 5) {
            dump("OAuth Request #" + ++self._retry_count);
            self.requestToken(success, failure);
          } else {
            self._retry_count = 0;
            Cu.reportError(response);
          }
        } else {
          OAUTH_TOKEN = response.split('&')[0].split('=')[1];
          TOKEN_SECRET = response.split('&')[1].split('=')[1];

          dump("\n" + TOKEN_SECRET + "\n");
          self._retry_count = 0;

          // Note that authorize is spelled the _correct_ way
          self.authorize(function success() { dump("Authorized!"); },
                         function failure() { dump("Token fail!"); });
        }
      },
      function(xhr) {
        /* failure function */
        self._retry_count = 0;
        dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
      });
}

sbSoundCloud.prototype.authorize =
function sbSoundCloud_authorize(success, failure) {
  var self = this;
  Logins.set(self.username, self.password);

  var url = SOCL_URL + "/oauth/authorize?oauth_token="
                     + OAUTH_TOKEN + "&display=popup&consumer_key="
                     + CONSUMER_KEY;

  var window = Cc["@mozilla.org/appshell/window-mediator;1"]
                 .getService(Ci.nsIWindowMediator)
                 .getMostRecentWindow('Songbird:Main');
  var gBrowser = window.gBrowser;

  function removeAuthListeners() {
    gBrowser.removeEventListeners("DOMContentLoaded",
                                  self._authListener, false);
    gBrowser.removeEventListener("unload", removeAuthListeners, false);
    authTab.removeEventListener("TabClose",
                                self._authTabCloseListener, false);
  }

  self._authListener = function(e) {
    if (gBrowser.getBrowserForDocument(e.target) !=
        gBrowser.getBrowserForTab(authTab)) {
      return;
    }
    var doc = gBrowser.contentDocument;
    var loggedIn = doc.getElementsByTagName("h1")[0].innerHTML;
    if (loggedIn == "You're now connected") {
      dump("\n\n\n\nCONNECTED\n\n\n\n");
      // XXX - TO BE MADE MORE GENERIC

      self.accessToken(function success() { dump("Access yes!"); },
        function failure() { dump("Access fail!"); });
    } else {
      /* Login failed due to incorrect username || password */
    }
  }

  self.accessToken = function(success, failure) {
    var url = SOCL_URL + "/oauth/access_token";

    var params = self.getParameters(url, 'POST');

    dump(params);

    self._accesstoken_xhr = POST(url, params,
        function(xhr) {
          let response = xhr.responseText;
          OAUTH_TOKEN = response.split('&')[0].split('=')[1];
          TOKEN_SECRET = response.split('&')[1].split('=')[1];

          dump("\n\nRESPONSE\n" + response);
          dump("\n\nOAUTH_TOKEN\n" + OAUTH_TOKEN + "\n\n");
          dump("\n\nTOKEN_SECRET\n" + TOKEN_SECRET + "\n\n");

          self._retry_count = 0;

          self.listeners.each(function(l) { l.onLoginSucceeded(); });
          window.setTimeout(function() { self.apiCall(function success() { dump("Access yes!"); },
                       function failure() { dump("My profile no!"); }); }, 10000);
        },
        function(xhr) {
          /* failure function */
          self._retry_count = 0;
          dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
        });
  }
 
  gBrowser.addEventListener("DOMContentLoaded", self._authListener, false);
  gBrowser.addEventListener("unload", removeAuthListeners, false);

  var authTab = gBrowser.loadOneTab(url, null, null, null, false);

  self._authTabCloseListener = function(e) {
    removeAuthListeners();
    //self.listeners.each(function(listener) {
    //  listener.onLoginFailed();
    //});

  authTab.addEventListener("TabClose", self._authTabCloseListener, false);

  }
}

sbSoundCloud.prototype.apiCall =
function sbSoundCloud_apiCall(success, falure) {
  var self = this;

  var url = SOCL_URL + "/me.json";

  var params = self.getParameters(url, 'GET');

  dump("\n" + params + "\n");

  self._api_xhr = GET(url, params,
      function(xhr) {
        let response = xhr.responseText;
        dump("\n\nRESPONSE-ME\n" + response + "\n\n");
      },
      function(xhr) {
        /* failure function */
        dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
      });
}

sbSoundCloud.prototype.shutdown = function sbSoundCloud_shutdown() {

}

var components = [sbSoundCloud];
function NSGetModule(compMgr, fileSpec) {
  return XPCOMUtils.generateModule(components);
}
