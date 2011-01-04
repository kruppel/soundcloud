/* *=BEGIN SONGBIRD GPL
 *
 * This file is part of the Songbird web player.
 *
 * Copyright(c) 2005-2011 POTI, Inc.
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
const SB_PROPERTY_DOWNLOAD_IMAGE = SB_NS + "downloadImage";
const SB_PROPERTY_DOWNLOAD_URL = SB_NS + "downloadURL";

const SOCL_URL = 'https://api.soundcloud.com';
const AUTH_PAGE = 'chrome://soundcloud/content/soundcloudAuthorize.xul'
const CONSUMER_SECRET = "YqGENlIGpWPnjQDJ2XCLAur2La9cTLdMYcFfWVIsnvw";
const CONSUMER_KEY = "eJ2Mqrpr2P4TdO62XXJ3A";
const SIG_METHOD = "HMAC-SHA1";

const MAX_RETRIES = 5;

var OAUTH_TOKEN = '';
var TOKEN_SECRET = '';

/*
 * SoundCloud library objects.
 */
var Libraries = {
  SEARCH: {
    "name": "SoundCloud",
    "guid": "search"
  },
  DOWNLOADS: {
    "name": "Downloads",
    "guid": "downloads"
  },
  DASHBOARD: {
    "name": "Dashboard",
    "guid": "dashboard"
  },
  FAVORITES: {
    "name": "Favorites",
    "guid": "favorites"
  }
}

/*
 * Manages SoundCloud login state.
 */
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

/*
 * SoundCloud listeners.
 */
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

/*
 * Helper functions
 */
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
 * SoundCloud XPCOM service component
 */
function sbSoundCloud() {
  // Imports
  // XXX - Deprecate by migrating base-64 fn
  Cu.import("resource://soundcloud/OAuth.jsm");

  this.wrappedJSObject = this;

  this.log = DebugUtils.generateLogFunction("sbSoundCloud");

  this.listeners = new Listeners();

  var login = Logins.get();
  this.username = login.username;
  this.password = login.password;

  this._prefs = Cc['@mozilla.org/preferences-service;1']
                  .getService(Ci.nsIPrefService)
                  .getBranch("extensions.soundcloud.");

  /**
   * Private "methods"
   */

  /**
   * \brief Gets (or creates) a SoundCloud library.
   *
   * \param aLibrary              SoundCloud Library object.
   * \param aUserId               User id. If passed, user-specific library
   *                              will be created.
   *
   * \return sbILibrary
   */
  this._getLibrary =
  function sbSoundCloud__getLibrary(aLibrary, aUserId) {
    var libraryManager = Cc["@songbirdnest.com/Songbird/library/Manager;1"]
                           .getService(Ci.sbILibraryManager);
    var library = {};
    var pref = aLibrary.guid + ".guid";
    var guid = (this._prefs.prefHasUserValue(pref)) ?
                 this._prefs.getCharPref(pref) : false;
    if (!guid) {
      var directory = Cc["@mozilla.org/file/directory_service;1"]
                        .getService(Ci.nsIProperties)
                        .get("ProfD", Ci.nsIFile);
      directory.append("db");
      directory.append("soundcloud");
      var file = directory.clone();
      // Create local (per user) or global (all users) db
      if (aUserId) {
        file.append(aLibrary.guid + "-" + aUserId + "@soundcloud.com.db");
      } else {
        file.append(aLibrary.guid + "@soundcloud.com.db");
      }
      var libraryFactory =
        Cc["@songbirdnest.com/Songbird/Library/LocalDatabase/LibraryFactory;1"]
          .getService(Ci.sbILibraryFactory);
      var bag = Cc["@mozilla.org/hash-property-bag;1"]
                  .createInstance(Ci.nsIWritablePropertyBag2);
      bag.setPropertyAsInterface("databaseFile", file);
      library = libraryFactory.createLibrary(bag);
    } else {
      library = libraryManager.getLibrary(guid);
      this._prefs.setCharPref(aLibrary.guid + ".guid", library.guid);
    }
    return library;
  }

  /**
   * \brief Adds media items to a SoundCloud library.
   *
   * \param aItems                JSON object of items to add.
   * \param aLibrary              Target library for added items.
   *
   */
  this._addItemsToLibrary =
  function sbSoundCloud__addItemsToLibrary(aItems, aLibrary) {
    var self = this;
    if (aItems != null) {
      var itemArray = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                         .createInstance(Ci.nsIMutableArray);
      var propertiesArray = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                              .createInstance(Ci.nsIMutableArray);
  
      for (let i = 0; i < aItems.length; i++) {
        var title = aItems[i].title;
        var duration = aItems[i].duration * 1000;
        var artwork = aItems[i].artwork_url;
        var username = aItems[i].user.username;
        var playcount = aItems[i].playback_count;
        var favcount = aItems[i].favoritings_count;
        var uri = aItems[i].uri;
        var waveformURL = aItems[i].waveform_url;
        var downloadURL = aItems[i].download_url || "";
        var streamURL = aItems[i].stream_url;
  
        if (downloadURL.indexOf(SOCL_URL) != -1)
          downloadURL += "?consumer_key=" + CONSUMER_KEY;
  
        if (!streamURL || streamURL.indexOf(SOCL_URL) == -1)
          continue;
        streamURL += "?consumer_key=" + CONSUMER_KEY;
  
        var properties =
          Cc["@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
            .createInstance(Ci.sbIMutablePropertyArray);
  
        properties.appendProperty(SBProperties.trackName, title);
        properties.appendProperty(SBProperties.duration, duration);
        properties.appendProperty(SBProperties.primaryImageURL, artwork);
        properties.appendProperty(SB_PROPERTY_USER, username);
        properties.appendProperty(SB_PROPERTY_PLAYS, playcount);
        properties.appendProperty(SB_PROPERTY_FAVS, favcount);
        properties.appendProperty(SB_PROPERTY_WAVEFORM, waveformURL);
        if (downloadURL) {
          properties.appendProperty(SB_PROPERTY_DOWNLOAD_URL, downloadURL);
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
  
      aLibrary.batchCreateMediaItemsAsync(batchListener,
                                          itemArray,
                                          propertiesArray,
                                          false);
    }
  }
  
  /**
   * \brief Creates an HMAC-SHA1 signature for an OAuth request.
   *
   * \param aMessage              Message to sign.
   *
   * \return HMAC-SHA1 signature string
   */
  this._sign = function sbSoundCloud__sign(aMessage) {
    var baseString = this._getBaseString(aMessage);
    var signature = b64_hmac_sha1(encodeURIComponent(CONSUMER_SECRET)
                                  + "&" + encodeURIComponent(TOKEN_SECRET),
                                  baseString);
    return signature;
  }

  /**
   * \brief Retrieves a base string.
   *
   * \param aMessage              Message to encode.
   *
   * \return Encoded base string
   */
  this._getBaseString =
  function sbSoundCloud__getBaseString(aMessage) {
    var params = aMessage.parameters;
    var s = "";
    for (let p in params) {
      if (params[p][0] != 'oauth_signature') {
        if (p == 0) {
          s = params[p][0] + "=" + params[p][1];
        } else {
          s += "&" + params[p][0] + "=" + params[p][1];
        }
      }
    }
    return aMessage.method + '&' + encodeURIComponent(aMessage.action)
                          + '&' + encodeURIComponent(s);
  }

  /**
   * \brief Creates parameters for an OAuth request.
   *
   * \param aURL                  Request URL.
   * \param aMethodType           Request method.
   *
   * \return URL encoded string of parameters
   */
  this._getParameters =
  function sbSoundCloud__getParameters(aURL, aMethodType) {
    var accessor = { consumerSecret: CONSUMER_SECRET };
    var message = { action: aURL,
                    method: aMethodType,
                    parameters: []
                  };

    message.parameters.push(['oauth_consumer_key', CONSUMER_KEY]);
    message.parameters.push(['oauth_nonce', OAuth.nonce(11)]);
    message.parameters.push(['oauth_signature_method', SIG_METHOD]);
    message.parameters.push(['oauth_timestamp', OAuth.timestamp()]);
    if (OAUTH_TOKEN)
      message.parameters.push(['oauth_token', OAUTH_TOKEN]);
    message.parameters.push(['oauth_version', "1.0"]);

    message.parameters.push(['oauth_signature', this._sign(message)]);

    return urlencode(message.parameters);
  }

  /**
   * \brief Requests OAuth token.
   *
   * \param aSuccess              Action to take on success.
   * \param aFailure              Action to take on failure.
   *
   */
  this._requestToken =
  function sbSoundCloud__requestToken(aSuccess, aFailure) {
    var self = this;
    this.listeners.each(function(l) { l.onLoginBegins(); });

    OAUTH_TOKEN = "";
    TOKEN_SECRET = "";

    var url = SOCL_URL + "/oauth/request_token";

    var params = this._getParameters(url, 'POST');

    this._reqtoken_xhr = POST(url, params,
        function(xhr) {
          let response = xhr.responseText;
          if (response == "Invalid OAuth Request") {
            if (self._retry_count < MAX_RETRIES) {
              dump("OAuth Request #" + ++self._retry_count);
              self.requestToken(aSuccess, aFailure);
            } else {
              self._retry_count = 0;
              aFailure();
              Cu.reportError(response);
            }
          } else {
            dump("\n" + response + "\n");
            OAUTH_TOKEN = response.split('&')[0].split('=')[1];
            TOKEN_SECRET = response.split('&')[1].split('=')[1];
            self._prefs.setCharPref(self.username + ".oauth_token",
                                    OAUTH_TOKEN);

            self._retry_count = 0;
            aSuccess();
          }
        },
        function(xhr) {
          self._retry_count = 0;
          dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
        });
  }

  /**
   * \brief Opens SoundCloud authorization dialog.
   *
   */
  this._authorize =
  function sbSoundCloud__authorize() {
    Logins.set(this.username, this.password);

    var mainWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Ci.nsIWindowMediator)
                       .getMostRecentWindow('Songbird:Main');
    var features = "modal=yes,dependent=yes,resizable=yes,titlebar=no";
    mainWindow.openDialog(AUTH_PAGE,
                          "soundcloud_authorize", features);
  }

  this._nowplaying_url = null;
  this.__defineGetter__('nowplaying_url', function() {
    return this._nowplaying_url;
  });
  this.__defineSetter__('nowplaying_url', function(val) {
    this._nowplaying_url = val;
  });

  this.__defineGetter__('soundcloud_url', function() {
    return SOCL_URL;
  });

  this.__defineGetter__('oauth_token', function() {
    let pref = this.username + ".oauth_token";
    let token = (this._prefs.prefHasUserValue(pref)) ?
                  this._prefs.getCharPref(pref) : false;
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

  this._library = this._getLibrary(Libraries.SEARCH, null);
  this._downloads = this._getLibrary(Libraries.DOWNLOADS, null);

  this.__defineGetter__('library', function() { return this._library; });
  this.__defineGetter__('dashboard', function() {
    let dashLib = (this._dashboard) ? this._dashboard : false;
    return dashLib;
  });
  this.__defineGetter__('favorites', function() {
    let favLib = (this._favorites) ? this._favorites : false;
    return favLib;
  });
  this.__defineGetter__('downloads', function() { return this._downloads; });

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
    this._servicePaneNode.url =
      "chrome://soundcloud/content/directory.xul?type=search";
    this._servicePaneNode.id = "SB:RadioStations:SoundCloud";
    this._servicePaneNode.name = "SoundCloud";
    this._servicePaneNode.image = 'chrome://soundcloud/skin/favicon.png';
    this._servicePaneNode.editable = false;
    this._servicePaneNode.hidden = false;
    radioFolder.appendChild(this._servicePaneNode);
  }

  this.updateServicePaneNodes();

  this._retry_count = 0;
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
    /*
    var followingNode = this._servicePaneService
                            .getNode("urn:soclfollowing");
    if (!followingNode) {
      followingNode = this._servicePaneService.createNode();
      followingNode.url=
        "chrome://soundcloud/content/directory.xul?type=following";
      followingNode.id = "urn:soclfollowing"
      followingNode.name = "Following";
      followingNode.tooltip = "People you follow";
      followingNode.editable = false;
      followingNode.setAttributeNS(SP_NS, "Weight", 10);
      soclNode.appendChild(followingNode);
      followingNode.hidden = false;
    }

    var followingBadge = ServicePaneHelper.getBadge(followingNode,
                                                    "soclfollowingcount");
    followingBadge.label = this.followingCount;
    followingBadge.visible = true;
    */

    // Create dashboard node
    var dashNode = this._servicePaneService
                      .getNode("urn:soclfavorites");
    if (!dashNode) {
      dashNode = this._servicePaneService.createNode();
      dashNode.url=
        "chrome://soundcloud/content/directory.xul?type=dashboard";
      dashNode.id = "urn:socldashboard"
      dashNode.name = "Dashboard";
      dashNode.tooltip = "Your dashboard";
      dashNode.editable = false;
      dashNode.setAttributeNS(SP_NS, "Weight", 5);
      soclNode.appendChild(dashNode);
      dashNode.hidden = false;
    }

    var dashBadge = ServicePaneHelper.getBadge(dashNode, "socldashboard");
    dashBadge.label = this.incomingCount;
    dashBadge.visible = true;
 
    // Create favorites node
    var favNode = this._servicePaneService
                      .getNode("urn:soclfavorites");
    if (!favNode) {
      favNode = this._servicePaneService.createNode();
      favNode.url=
        "chrome://soundcloud/content/directory.xul?type=favorites";
      favNode.id = "urn:soclfavorites"
      favNode.name = "Favorites";
      favNode.tooltip = "Tracks you loved";
      favNode.editable = false;
      favNode.setAttributeNS(SP_NS, "Weight", 20);
      soclNode.appendChild(favNode);
      favNode.hidden = false;
    }

    var favBadge = ServicePaneHelper.getBadge(favNode, "soclfavcount");
    favBadge.label = this.favCount;
    favBadge.visible = true;
 
    this._dashboard = this._getLibrary(Libraries.DASHBOARD, null);
    this._favorites = this._getLibrary(Libraries.FAVORITES, this.userid);
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
  this._requestToken(function success() {
                       self._authorize();
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
function sbSoundCloud_cancelLogin() {
  this.listeners.each(function() { l.onLoginCancelled(); });
  this.logout();
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
  var params = self._getParameters(url, 'POST');

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
      self.userid = jsObject.id;
      self.realname = jsObject.username;
      self.avatar = jsObject.avatar_url;
      self.followingCount = jsObject.followings_count;
      self.favCount = jsObject.public_favorites_count;
      self.city = jsObject.city;
      self.country = jsObject.country;
      self.profileurl = jsObject.permalink_url;
      self.listeners.each(function(l) { l.onProfileUpdated(); });

      self.updateServicePaneNodes();

      if (typeof(onSuccess) == "function")
        onSuccess();
    });
}

sbSoundCloud.prototype.getDashboard =
function sbSoundCLoud_getDashboard() {
  var self = this;
  if (!this.loggedIn)
    return false;

  var url = SOCL_URL + "/me/followings/tracks.json";
  var success = function(xhr) {
    let json = xhr.responseText;
    let feed = JSON.parse(xhr.responseText);
    if (feed.error) {
      if (self._retry_count < MAX_RETRIES) {
        dump("\n" + json + "\n");
        self._retry_count++;
        self.getDashboard();
      } else {
        Cu.reportError("Unable to retrieve incoming tracks: " + json);
        return false;
      }
    }

    self.incomingCount = feed.length;
    self._addItemsToLibrary(feed, self._dashboard);
  }

  var params = this._getParameters(url, "GET");
  dump("\n" + url + "?" + params + "\n");
  //this._xhr = GET(url, params, success, null, true);

  //return this._xhr;
}

sbSoundCloud.prototype.getFavorites =
function sbSoundCLoud_getFavorites() {
  var self = this;
  if (!this.loggedIn)
    return false;

  var url = SOCL_URL + "/me/favorites.json";
  var success = function(xhr) {
    let json = xhr.responseText;
    let favorites = JSON.parse(xhr.responseText);
    if (favorites.error) {
      if (self._retry_count < MAX_RETRIES) {
        self._retry_count++;
        self.getFavorites();
      } else {
        Cu.reportError("Unable to retrieve favorites: " + favorites.error);
        return false;
      }
    }

    self.favCount = favorites.length;
    self._addItemsToLibrary(favorites, self._favorites);
  }

  var params = this._getParameters(url, "GET");
  this._xhr = GET(url, params, success, null, true);

  return this._xhr;
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
          self._addItemsToLibrary(tracks, self._library);
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
    params = this._getParameters(url, method);
  } else {
    params += "consumer_key=" + CONSUMER_KEY;
  }

  this._xhr = GET(url, params, success, failure, authRequired);
  return this._xhr;
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
