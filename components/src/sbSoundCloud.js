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

Cu.import("resource://app/jsmodules/DebugUtils.jsm");
Cu.import("resource://app/jsmodules/SBDataRemoteUtils.jsm");
Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/ServicePaneHelper.jsm");
Cu.import("resource://app/jsmodules/StringUtils.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

var Application = Cc["@mozilla.org/fuel/application;1"]
                    .getService(Ci.fuelIApplication);

const NS = 'http://songbirdnest.com/soundcloud#';
const SB_NS = 'http://songbirdnest.com/data/1.0#';
const SP_NS = 'http://songbirdnest.com/rdf/servicepane#';

// SoundCloud property constants
const SB_PROPERTY_USER = SB_NS + "user";
const SB_PROPERTY_PLAYS = SB_NS + "playcount";
const SB_PROPERTY_FAVS = SB_NS + "favcount";
const SB_PROPERTY_WAVEFORM = SB_NS + "waveformURL";

const SOUNDCLOUD_LIBNAME = 'soundcloud-search.db';

const SOCL_URL = 'https://api.soundcloud.com';
const AUTH_PAGE = 'chrome://soundcloud/content/soundcloudAuthorize.xul'
const CONSUMER_SECRET = "YqGENlIGpWPnjQDJ2XCLAur2La9cTLdMYcFfWVIsnvw";
const CONSUMER_KEY = "eJ2Mqrpr2P4TdO62XXJ3A";
const SIG_METHOD = "HMAC-SHA1";

var OAUTH_TOKEN = '';
var TOKEN_SECRET = '';

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

function GET(url, params, onload, onerror, oauth) {
  var xhr = null;

  dump("\n\n" + url + "?" + params + "\n\n");
  try {
    xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
    xhr.mozBackgroundRequest = true;
    xhr.onload = function(event) { onload(xhr); }
    xhr.onerror = function(event) { onerror(xhr); }
    xhr.open('GET', url + "?" + params, true);
    if (oauth)
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

  this.log = DebugUtils.generateLogFunction("sbSoundCloud");

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

  this._prefs = Cc['@mozilla.org/preferences-service;1']
                  .getService(Ci.nsIPrefService)
                  .getBranch("extensions.soundcloud.");

  this._retry_count = 0;

  this.__defineGetter__('soundcloud_url', function() {
    return SOCL_URL;
  });

  this.__defineGetter__('oauth_token', function() {
    return this._prefs.getCharPref(this.username + ".oauth_token");
  });

  /*
  this.__defineGetter__('autoLogin', function() {
    return prefsService.getBoolPref('extensions.soundcloud.autologin');
  });
  this.__defineSetter__('autoLogin', function(val) {
    prefsService.setBoolPref('extensions.soundcloud.autologin', val);
    this.listeners.each(function(l) { l.onAutoLoginChanged(val); });
  });
  */

  // user-logged-out pref
  this.__defineGetter__('userLoggedOut', function() {
    return this._prefs.getBoolPref('loggedOut');
  });
  this.__defineSetter__('userLoggedOut', function(val) {
    this._prefs.setBoolPref('loggedOut', val);
  });

  // the loggedIn state
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

  var libraryManager = Cc["@songbirdnest.com/Songbird/library/Manager;1"]
                         .getService(Ci.sbILibraryManager);
  var libraryFactory =
    Cc["@songbirdnest.com/Songbird/Library/LocalDatabase/LibraryFactory;1"]
      .getService(Ci.sbILibraryFactory);

  var libGuid = this._prefs.getCharPref("library.guid");

  if (libGuid == "") {
    var file = Cc["@mozilla.org/file/directory_service;1"]
                 .getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
    file.append("db");
    file.append(SOUNDCLOUD_LIBNAME);
    var bag = Cc["@mozilla.org/hash-property-bag;1"]
                .createInstance(Ci.nsIWritablePropertyBag2);
    bag.setPropertyAsInterface("databaseFile", file);
    this._library = libraryFactory.createLibrary(bag);
    this._library.name = "SoundCloud Search";
    libraryManager.registerLibrary(this._library, true);
    this._prefs.setCharPref("library.guid", this._library.guid);
  } else {
    this._library = libraryManager.getLibrary(libGuid);
    this._prefs.setCharPref("library.guid", this._library.guid);
  }

  this.__defineGetter__('library', function() { return this._library; });

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

sbSoundCloud.prototype.updateServicePaneNodes =
function sbSoundCloud_updateServicePaneNodes() {
  var soclNode = this._servicePaneService
                     .getNode("SB:RadioStations:SoundCloud");
  if (this.loggedIn) {
    // Create following node
    // Need to do an async call to add children
    let followingNode = this._servicePaneService.createNode();
    followingNode.url="chrome://soundcloud/content/directory.xul";
    followingNode.id = "urn:soclfollowing"
    followingNode.name = "Following";
    followingNode.tooltip = "People you follow";
    followingNode.editable = false;
    followingNode.setAttributeNS(SP_NS, "Weight", 10);
    soclNode.appendChild(followingNode);
    followingNode.hidden = false;

    let followingBadge = ServicePaneHelper.getBadge(followingNode,
                                                    "soclfollowingcount");
    followingBadge.label = this.following;
    followingBadge.visible = true;

    // Create favorites node
    let favNode = this._servicePaneService.createNode();
    favNode.url="chrome://soundcloud/content/directory.xul";
    favNode.id = "urn:soclfavorites"
    favNode.name = "Favorites";
    favNode.tooltip = "Tracks you loved";
    favNode.editable = false;
    favNode.setAttributeNS(SP_NS, "Weight", 20);
    soclNode.appendChild(favNode);
    favNode.hidden = false;

    let favBadge = ServicePaneHelper.getBadge(favNode, "soclfavcount");
    favBadge.label = this.favorites;
    favBadge.visible = true;
  } else {
    while (soclNode.firstChild) {
      soclNode.removeChild(soclNode.firstChild);
    }
  }
}

sbSoundCloud.prototype.shouldAutoLogin =
function sbSoundCloud_shouldAutoLogin() {
  return this.autoLogin &&
         this.username &&
         this.password &&
         !this.userLoggedOut;
}

sbSoundCloud.prototype.login =
function sbSoundCloud_login(clearSession) {
  var self = this;
  self.requestToken(function success() {
                      self.authorize(function auth_success() {
                                       dump("Authorized!");
                                     },
                                     function auth_failure() {
                                       dump("Token fail!");
                                     });
                      }, function failure() {
                           dump("Request token fail!");
                         });
  return;
}

sbSoundCloud.prototype.logout =
function sbSoundCloud_logout() {
  this.loggedIn = false;
  this.updateServicePaneNodes();
}

sbSoundCloud.prototype.cancelLogin =
function sbLastfm_cancelLogin() {
  this.listeners.each(function() { l.onLoginCancelled(); });
  this.logout();
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

  message.parameters.push(['oauth_signature', this.sign(message)]);

  return urlencode(message.parameters);
}

sbSoundCloud.prototype.requestToken =
function sbSoundCloud_requestToken(success, failure) {
  var self = this;
  this.listeners.each(function(l) { l.onLoginBegins(); });

  OAUTH_TOKEN = "";
  TOKEN_SECRET = "";

  var url = SOCL_URL + "/oauth/request_token";

  var params = this.getParameters(url, 'POST');

  this._reqtoken_xhr = POST(url, params,
      function(xhr) {
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

          self._prefs.setCharPref(self.username + ".oauth_token",
                                  OAUTH_TOKEN);

          self._retry_count = 0;
          self.authorize(function success() { dump("Authorized!"); },
                         function failure() { dump("Token fail!"); });
        }
      },
      function(xhr) {
        self._retry_count = 0;
        dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
      });
}

sbSoundCloud.prototype.authorize =
function sbSoundCloud_authorize(success, failure) {
  Logins.set(this.username, this.password);

  var mainWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Ci.nsIWindowMediator)
                     .getMostRecentWindow('Songbird:Main');
  var features = "modal=yes,dependent=yes,resizable=yes,titlebar=no";
  mainWindow.openDialog(AUTH_PAGE,
                        "soundcloud_authorize", features);
}

sbSoundCloud.prototype.authCallback =
function sbSoundCloud_authCallback() {
  if (this.loggedIn) {
    this.accessToken(function success() { dump("Access yes!"); },
      function failure() { dump("Access fail!"); });
  } else {
    this.listeners.each(function(l) { l.onLoggedInStateChanged(); });
  }
}

sbSoundCloud.prototype.accessToken =
function sbSoundCloud_accessToken(success, failure) {
  var self = this;
  var url = SOCL_URL + "/oauth/access_token";
  var params = self.getParameters(url, 'POST');

  this._accesstoken_xhr = POST(url, params,
      function(xhr) {
        let response = xhr.responseText;
        OAUTH_TOKEN = response.split('&')[0].split('=')[1];
        TOKEN_SECRET = response.split('&')[1].split('=')[1];

        self._prefs.setCharPref(self.username + ".oauth_token",
                                OAUTH_TOKEN);

        self.listeners.each(function(l) { l.onLoggedInStateChanged(); });
        self.updateProfile(function success() { dump("Access yes!"); },
                           function failure() { dump("My profile no!"); });
      },
      function(xhr) {
        dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
      });
}

sbSoundCloud.prototype.updateProfile =
function sbSoundCloud_updateProfile(onSuccess, onFailure) {
  var self = this;
  this._info_xhr = this.apiCall("me", {},
    function response(success, json) {
      if (!success) {
        dump("updateProfile FAILED\n");
        if (typeof(onFailure) == "function")
          onFailure();
        return;
      }

      dump("\n" + json + "\n");
      var jsObject = JSON.parse(json);
      self.realname = jsObject.username;
      self.avatar = jsObject.avatar_url;
      self.following = jsObject.followings_count;
      self.favorites = jsObject.public_favorites_count;
      self.city = jsObject.city;
      self.country = jsObject.country;
      self.profileurl = jsObject.permalink_url;
      self.listeners.each(function(l) { l.onProfileUpdated(); });

      self.updateServicePaneNodes();

      if (typeof(onSuccess) == "function")
        onSuccess();
    });
}

sbSoundCloud.prototype.apiCall =
function sbSoundCloud_apiCall(type, flags, callback) {
  var self = this;
  var authRequired = false;
  var url = SOCL_URL;

  var method = "";
  var params = "";
  var success = {};
  var failure = {};

  switch (type) {
    case "test":
      method = 'GET';
      url += "/oauth/test_request";
      authRequired = true;
      break;
    case "me":
      method = 'GET';
      url += "/me.json";
      authRequired = true;
      success = function(xhr) {
        let json = xhr.responseText;
        let jsObject = JSON.parse(xhr.responseText);
        if (jsObject.error) {
          callback(false, json);
        }
        self._prefs.setCharPref(self.username + ".oauth_token",
                                OAUTH_TOKEN);
        callback(true, json);
      };
      failure = function(xhr) {
        dump("\nStatus is " + xhr.status + "\n"
                            + xhr.getAllResponseHeaders());
      };
      break;
    case "tracks":
      method = 'GET';
      url += "/tracks.json";

      if (flags.offset == 0 && self._xhr != null)
        self._xhr.abort();

      if (callback == null) {
        callback = function(success, response) {
          let tracks = JSON.parse(response);
          dump("\n" + response + "\n");
          flags.offset += tracks.length;
          self.addItemsToLibrary(tracks);
          if (tracks.length > 40) {
            self._xhr = self.apiCall("tracks", flags, null);
          }
        };
      }

      if (flags) {
        for (let flag in flags) {
          params += flag + "=" + flags[flag] + "&";
        }
      }

      success = function(xhr) {
        let json = xhr.responseText;
        callback(true, json);
      };
      failure = function(xhr) {
        dump("\nStatus is " + xhr.status + "\n"
                            + xhr.getAllResponseHeaders());
      };
      
      break;
    default:
      break;
  }

  if (authRequired) {
    params = this.getParameters(url, method);
  } else {
    params += "consumer_key=" + CONSUMER_KEY;
  }

  this._xhr = GET(url, params, success, failure, authRequired);
  return this._xhr;
}

sbSoundCloud.prototype.addItemsToLibrary =
function sbSoundCloud_addItemsToLibrary(aItems) {
  var self = this;
  if (aItems != null) {
    var itemArray = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                       .createInstance(Ci.nsIMutableArray);
    var propertiesArray = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                            .createInstance(Ci.nsIMutableArray);

    for (let i = 0; i < aItems.length; i++) {
      var title = aItems[i].title;
      var duration = aItems[i].duration * 1000;
      var username = aItems[i].user.username;
      var playcount = aItems[i].playback_count;
      var favcount = aItems[i].favoritings_count;
      var uri = aItems[i].uri;
      var waveformURL = aItems[i].waveform_url;
      var downloadable = aItems[i].downloadable;
      var downloadURL = "";
      if (downloadable)
        downloadURL = aItems[i].download_url;
      var streamURL = aItems[i].stream_url;
      if (streamURL == 'undefined')
        continue;
      streamURL += "?consumer_key=" + CONSUMER_KEY;

      var properties =
        Cc["@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
          .createInstance(Ci.sbIMutablePropertyArray);

      properties.appendProperty(SBProperties.trackName, title);
      properties.appendProperty(SBProperties.duration, duration);
      properties.appendProperty(SB_PROPERTY_USER, username);
      properties.appendProperty(SB_PROPERTY_PLAYS, playcount);
      properties.appendProperty(SB_PROPERTY_FAVS, favcount);
      properties.appendProperty(SB_PROPERTY_WAVEFORM, waveformURL);
      if (downloadURL) {
        properties.appendProperty(SBProperties.originURL, downloadURL);
        properties.appendProperty(SBProperties.enableAutoDownload, "1");
        properties.appendProperty(SBProperties.downloadButton, "1|0|0");
      }

      var ios = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
      
      itemArray.appendElement(ios.newURI(streamURL, null, null), false);
      propertiesArray.appendElement(properties, false);
    }

    var batchListener = {
      onProgress: function(aIndex) {},
      onComplete: function(aMediaItems, aResult) {
        self.listeners.each(function(l) { l.onItemsAdded(); });
      }
    };

    self._library.batchCreateMediaItemsAsync(batchListener,
                                             itemArray,
                                             propertiesArray,
                                             false);
  }
}

sbSoundCloud.prototype.onMediacoreEvent =
function sbSoundCloud_onMediacoreEvent(aEvent) {
  switch(aEvent.type) {
    case Ci.sbIMediacoreEvent.STREAM_END:
    case Ci.sbIMediacoreEvent.STREAM_STOP:
      //this.onStop();
      break;
    case Ci.sbIMediacoreEvent.VIEW_CHANGE:
      break;
    case Ci.sbIMediacoreEvent.BEFORE_TRACK_CHANGE:
      break;
    case Ci.sbIMediacoreEvent.TRACK_CHANGE:
      //this.onTrackChange(aEvent.data);
      break;
    default:
      break;
  }
}

sbSoundCloud.prototype.onTrackChange =
function sbSoundCloud_onTrackChange(aItem) {
}

sbSoundCloud.prototype.onStop = function sbSoundCloud_onStop() {

}

sbSoundCloud.prototype.shutdown = function sbSoundCloud_shutdown() {

}

var components = [sbSoundCloud];
function NSGetModule(compMgr, fileSpec) {
  return XPCOMUtils.generateModule(components);
}
