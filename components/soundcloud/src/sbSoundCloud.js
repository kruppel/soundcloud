/*
 *=BEGIN SONGBIRD GPL
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
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/StringUtils.jsm");
var Application = Cc["@mozilla.org/fuel/application;1"]
                    .getService(Ci.fuelIApplication);

const NS = 'http://www.songbirdnest.com/lastfm#';
const SB_NS = 'http://songbirdnest.com/data1.0#';
const SP_NS = 'http://songbirdnest.com/rdf/servicepane#';

const SOCL_URL = 'http://api.soundcloud.com';
const CONSUMER_SECRET = "YqGENlIGpWPnjQDJ2XCLAur2La9cTLdMYcFfWVIsnvw";
const CONSUMER_KEY = "eJ2Mqrpr2P4TdO62XXJ3A";
const SIG_METHOD = "HMAC-SHA1";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
// import observer utils
Cu.import("resource://app/jsmodules/ObserverUtils.jsm");

// object to manage login state
var Logins = {
  loginManager: Cc["@mozilla.org/login-manager;1"]
      .getService(Ci.nsILoginManager),

  LOGIN_HOSTNAME: 'http://soundcloud.com',
  LOGIN_FIELD_EMAIL: 'username',
  LOGIN_FIELD_PASSWORD: 'password',

  get: function() {
    // username & password
    var email = '';
    var password = '';
    // lets ask the login manager
    var logins = this.loginManager.findLogins({}, this.LOGIN_HOSTNAME,
                                              '', null);
    for (var i = 0; i < logins.length; i++) {
      if (i==0) {
        // use the first username & password we find
        email = logins[i].username;
        password = logins[i].password;
      } else {
        // get rid of the rest
        this.loginManager.removeLogin(logins[i]);
      }
    }
    return {email: email, password: password};
  },

  set: function(email, password) {
    var logins = this.loginManager.findLogins({}, this.LOGIN_HOSTNAME,
                                              '', null);
    for (var i=0; i<logins.length; i++) {
      this.loginManager.removeLogin(logins[i]);
    }
    // set new login info
    var nsLoginInfo = new CC("@mozilla.org/login-manager/loginInfo;1",
      Ci.nsILoginInfo, "init");
    this.loginManager.addLogin(new nsLoginInfo(this.LOGIN_HOSTNAME,
        '', null, email, password,
        this.LOGIN_FIELD_EMAIL, this.LOGIN_FIELD_PASSWORD));
  }
}

function urlencode(o) {
  var s = '';
  for (var k in o) {
    var v = o[k];
    if (s.length) { s += '&'; }
    s += encodeURIComponent(k) + '=' + encodeURIComponent(v);
  }
  return s;
}

function POST(url, params, onload, onerror) {
  var xhr = null;
  var accessor = { consumerSecret: CONSUMER_SECRET };
  var message = { action: url,
                  method: "POST",
                  parameters: []
                };

  message.parameters.push(['oauth_consumer_key', CONSUMER_KEY]);
  message.parameters.push(['oauth_signature_method', SIG_METHOD]);

  OAuth.setTimestampAndNonce(message);
  OAuth.SignatureMethod.sign(message, accessor);

  var params = "";

  params = urlencode(message.parameters);

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

  // XXX - Need to review
  this._observerSet = new ObserverSet();
  this._observerSet.add(this,
                        "songbird-library-manager-before-shutdown",
                        false,
                        true);


  var login = Logins.get();
  this.username = login.username;
  this.password = login.password;

  this.nowplaying_url = null;

  this.__defineGetter__('nowplaying_url', function() {
    return this.nowplaying_url;
  });
  this.__defineSetter__('nowplaying_url', function(val) {
    this.nowplaying_url = val;
  });

  var prefsService = Cc['@mozilla.org/preferences-service;1']
      .getService(Ci.nsIPrefBranch);

  this.__defineGetter__('autoLogin', function() {
    return prefsService.getBoolPref('extensions.lastfm.autologin');
  });
  this.__defineSetter__('autoLogin', function(val) {
    prefsService.setBoolPref('extensions.lastfm.autologin', val);
    this.listeners.each(function(l) { l.onAutoLoginChanged(val); });
  });

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

  this._servicePaneNode = this._servicePaneService.createNode();
  this._servicePaneNode.url = "chrome://soundcloud/content/directory.xul";
  this._servicePaneNode.id = "SB:RadioStations:SoundCloud";
  this._servicePaneNode.name = "SoundCloud";
  this._servicePaneNode.image = 'chrome://soundcloud/skin/soundcloud_favicon.png';
  this._servicePaneNode.editable = false;
  this._servicePaneNode.hidden = false;
  radioFolder.appendChild(this._servicePaneNode);

  this.updateServicePaneNodes();

  var observerService = Cc["@mozilla.org/observer-service;1"]
                          .getService(Ci.nsIObserverService);
  observerService.addObserver(this, "http-on-modify-request", false);

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

sbSoundCloud.prototype.login = function sbSoundCloud_login(clearSession) {
  var self = this;
  self.requestToken(function success() { dump("Token yes!"); },
                    function failure() { dump("Token fail!"); });
  return;
}

sbSoundCloud.prototype.requestToken =
function sbSoundCloud_requestToken(success, failure) {
  var self = this;
  var url = SOCL_URL + "oauth/request_token";

  this._reqtoken_xhr = POST(url, params, function(xhr) {
      if (xhr.status != 200) {
        dump('HTTP status ' + xhr.status + ' posting to ' + url);
      } else {
        dump(xhr.responseText);
      }
    }, function(xhr) {
      dump("Failed!");
    });
}

sbSoundCloud.prototype.shutdown = function sbSondCloud_shutdown() {
  this._observerSet.removeAll();
  this._observerSet = null;
}

var components = [sbSoundCloud];
function NSGetModule(compMgr, fileSpec) {
  return XPCOMUtils.generateModule(components);
}
