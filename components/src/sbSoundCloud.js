/*
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
 * \brief SoundCloud XPCOM components.
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

const NS = "http://songbirdnest.com/soundcloud#";
const SB_NS = "http://songbirdnest.com/data/1.0#";
const SP_NS = "http://songbirdnest.com/rdf/servicepane#";

// SoundCloud property constants
const SB_PROPERTY_TRACK_ID = NS + "trackID";
const SB_PROPERTY_CREATION_DATE = NS + "creationDate";
const SB_PROPERTY_COMMENTABLE = NS + "commentable";
const SB_PROPERTY_USER = NS + "user";
const SB_PROPERTY_USER_ID = NS + "userID";
const SB_PROPERTY_USER_PERMALINK = NS + "userPermalink";
const SB_PROPERTY_PLAYS = NS + "playcount";
const SB_PROPERTY_FAVS = NS + "favcount";
const SB_PROPERTY_PERMALINK = NS + "permalinkURL";
const SB_PROPERTY_WAVEFORM = NS + "waveformURL";
const SB_PROPERTY_DOWNLOAD_IMAGE = NS + "downloadImage";
const SB_PROPERTY_DOWNLOAD_URL = NS + "downloadURL";

const SOCL_URL = "https://api.sandbox-soundcloud.com";
const AUTH_PAGE = "chrome://soundcloud/content/soundcloudAuthorize.xul";
const DEFAULT_AVATAR = "chrome://soundcloud/skin/default-avatar.png";
const CONSUMER_SECRET = "wyptkfjC6jnY6Trm3XLTU6zrGcc6wT5eufuYqCp5xY";
const CONSUMER_KEY = "PvM7UwxkoLr8KBgHlYQjcg";
const SIG_METHOD = "HMAC-SHA1";

const MAX_RETRIES = 5;

/*
 * SoundCloud library objects.
 */
var Libraries = {
  SEARCH: {
    "name": "SoundCloud",
    "guid": "main"
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

  LOGIN_HOSTNAME: "http://soundcloud.com",
  LOGIN_FIELD_USERNAME: "username",
  LOGIN_FIELD_PASSWORD: "password",

  get: function() {
    // username & password
    var username = "";
    var password = "";
    // lets ask the login manager
    var logins = this.loginManager.findLogins({}, this.LOGIN_HOSTNAME,
                                              "", null);
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
                                              "", null);
    for (var i=0; i<logins.length; i++) {
      this.loginManager.removeLogin(logins[i]);
    }
    // set new login info
    var nsLoginInfo = new CC("@mozilla.org/login-manager/loginInfo;1",
      Ci.nsILoginInfo, "init");
    this.loginManager.addLogin(new nsLoginInfo(this.LOGIN_HOSTNAME,
        "", null, username, password,
        this.LOGIN_FIELD_USERNAME, this.LOGIN_FIELD_PASSWORD));
  }
}

function sbSoundCloudDBService() {
  this.createSearchTable =
    function sbSoundCloudDBService_createSearchTable() {
      this._initQuery("search-history@soundcloud.com");
      this._dbq.addQuery("CREATE TABLE IF NOT EXISTS search_history"
                         + "(id INTEGER PRIMARY KEY,"
                         + " timestamp INTEGER, url TEXT,"
                         + " terms TEXT)");
      this._dbq.execute();
      this._dbq.resetQuery();
    }

  this.insertSearch =
    function sbSoundCloudDBService_insertSearch(aUrl, aTerms) {
      this._initQuery("search-history@soundcloud.com");
      this._dbq.addQuery("INSERT INTO search_history VALUES (NULL, "
                         + Date.now() + ", '" + aUrl + "', '" + escape(aTerms)
                         + "')");
      this._dbq.execute();
      this._dbq.resetQuery();
    }

  this.getLastSearch =
    function sbSoundCloudDBService_getLastSearch() {
      this._initQuery("search-history@soundcloud.com");
      this._dbq.addQuery("SELECT * FROM search_history"
                         + " ORDER BY id DESC LIMIT 1");
      this._dbq.execute();
      this._dbq.waitForCompletion();
      var rs = this._dbq.getResultObject();
      var lastSearch = rs.getRowCell(0, 3);
      this._dbq.resetQuery();
      return lastSearch;
    }

  this.createUsersTable =
    function sbSoundCloudDBService_createUsersTable() {
      this._initQuery("users@soundcloud.com");
      this._dbq.addQuery("CREATE TABLE IF NOT EXISTS users"
                         + "(id INTEGER UNIQUE PRIMARY KEY, permalink TEXT,"
                         + " username TEXT UNIQUE, uri TEXT,"
                         + " permalink_url TEXT, avatar_url TEXT,"
                         + " country TEXT, full_name TEXT,"
                         + " city TEXT, description TEXT,"
                         + " discogs_name TEXT, myspace_name TEXT,"
                         + " website TEXT, website_title TEXT,"
                         + " online INTEGER, track_count INTEGER,"
                         + " followers_count INTEGER, followings_count INTEGER,"
                         + " public_favorites_count INTEGER,"
                         + " updated INTEGER)");
      this._dbq.execute();
      this._dbq.resetQuery();
    }

  this.insertUser =
    function sbSoundCloudDBService_insertUser(aJSON) {
      this._initQuery("users@soundcloud.com");
      if (!aJSON.id || !aJSON.username)
        return;
      var id = aJSON.id;
      var permalink = "'" + escape(aJSON.permalink) + "'";
      var username = "'" + escape(aJSON.username) + "'";
      var attrs = ["uri", "permalink_url", "avatar_url",
                   "country", "city", "description", "discogs_name",
                   "myspace_name", "website", "website_title", "online"]
      var query = "INSERT OR REPLACE INTO users VALUES "
                  + "(" + id + ", " + permalink + ", " + username + ", ";
      for each (var attr in attrs) {
        if (aJSON[attr]) {
          query += "'" + escape(aJSON[attr]) + "', ";
        } else {
          query += "NULL, ";
        }
      }

      var online = (aJSON.online) ? 1 : 0;
      this._dbq.addQuery(query + online + ","
                         + " " + aJSON.track_count + ","
                         + " " + aJSON.followers_count + ","
                         + " " + aJSON.followings_count + ","
                         + " " + aJSON.public_favorites_count + ","
                         + " " + Date.now() + ")"); 
      this._dbq.execute();
      this._dbq.resetQuery();
    }

  this.createRelationshipsTable =
    function sbSoundCloudDBService_createRelationshipsTable() {
      this._initQuery("users@soundcloud.com");
      this._dbq.addQuery("CREATE TABLE IF NOT EXISTS relationships "
                         + "(follower_id INTEGER, following_id INTEGER,"
                         + " UNIQUE(follower_id, following_id)"
                         + " ON CONFLICT REPLACE)");
      this._dbq.execute();
      this._dbq.resetQuery();
    }

  this.insertRelationship =
    function sbSoundCloudDBService_insertRelationship(aFollowerId,
                                                      aFollowingId) {
      this._initQuery("users@soundcloud.com");
      this._dbq.addQuery("INSERT INTO relationships VALUES "
                         + "(" + aFollowerId + ", " +  aFollowingId + ")");
      this._dbq.execute();
      this._dbq.resetQuery();
    }

  this.selectRelationship =
    function sbSoundCloudDBService_selectRelationship(aFollowerId,
                                                      aFollowingId) {
      this._initQuery("users@soundcloud.com");
      this._dbq.addQuery("SELECT COUNT(1) FROM relationships"
                         + " WHERE follower_id=" + aFollowerId
                         + " AND following_id=" + aFollowingId);
      this._dbq.execute();
      this._dbq.waitForCompletion();
      var rs = this._dbq.getResultObject();
      var count = rs.getRowCell(0, 0);
      this._dbq.resetQuery();

      var hasRelationship = (parseInt(count) > 0) ? true : false;
      return hasRelationship;
    }

  this.deleteRelationship =
    function sbSoundCloudDBService_deleteRelationship(aFollowerId,
                                                      aFollowingId) {
      this._initQuery("users@soundcloud.com");
      this._dbq.addQuery("DELETE FROM relationships WHERE"
                         + " follower_id = " + aFollowerId + " AND"
                         + " following_id = " +  aFollowingId);
      this._dbq.execute();
      this._dbq.resetQuery();
    }

  this._initQuery =
    function sbSoundCloudDBService__initQuery(aGuid) {
      try {
        if (!this._dbq) {
          var ios = Cc["@mozilla.org/network/io-service;1"]
                      .createInstance(Ci.nsIIOService);
          var dir = Cc["@mozilla.org/file/directory_service;1"]
                      .getService(Ci.nsIProperties)
                      .get("ProfD", Ci.nsIFile);
          dir.append("db");
          dir.append("soundcloud");
          if (!dir.exists()) {
            dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0755);
          }
          var uri = ios.newFileURI(dir);
          this._dbq = Cc["@songbirdnest.com/Songbird/DatabaseQuery;1"]
                        .createInstance(Ci.sbIDatabaseQuery);
          this._dbq.databaseLocation = uri;
        }

        this._dbq.setDatabaseGUID(aGuid);
        this._dbq.setAsyncQuery(false);
        this._dbq.resetQuery();
      } catch(e) {
        Cu.reportError(e);
      }
    }
}

/*
 * Helper functions
 */
function urlencode(obj) {
  var params = "";

  for (let p in obj) {
    if (p == 0) {
      params += obj[p][0] + "=" + obj[p][1];
    } else {
      params += "&" + obj[p][0] + "=" + obj[p][1];
    }
  }

  return params;
}

function md5(str) {
  var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                    .createInstance(Ci.nsIScriptableUnicodeConverter);

  converter.charset = "UTF-8";
  // result is an out parameter,
  // result.value will contain the array length
  var result = {};
  // data is an array of bytes
  var data = converter.convertToByteArray(str, result);
  var ch = Cc["@mozilla.org/security/hash;1"]
             .createInstance(Ci.nsICryptoHash);
  ch.init(ch.MD5);
  ch.update(data, data.length);
  var hash = ch.finish(false);

  // return the two-digit hexadecimal code for a byte
  function toHexString(charCode) {
    return ("0" + charCode.toString(16)).slice(-2);
  }

  // convert the binary hash data to a hex string.
  var s = [toHexString(hash.charCodeAt(i)) for (i in hash)].join("");
  return s;
}

function GET(url, params, onload, onerror, oauth) {
  var xhr = null;

  try {
    xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
    xhr.mozBackgroundRequest = true;
    xhr.onload = function(event) { onload(xhr); }
    xhr.onerror = function(event) { onerror(xhr); }
    xhr.open("GET", url + "?" + params, true);
    if (oauth)
      xhr.setRequestHeader("Authorization", "OAuth");
    xhr.setRequestHeader("Content-Type", "application/json");
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
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.setRequestHeader("Content-length", params.length);
    xhr.setRequestHeader("Connection", "close");
    xhr.send(params);
  } catch(e) {
    Cu.reportError(e);
    onerror(xhr);
  }
  return xhr;
}

function PUT(url, params, onload, onerror) {
  var xhr = null;

  try {
    xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
    xhr.mozBackgroundRequest = true;
    xhr.onload = function(event) { onload(xhr); }
    xhr.onerror = function(event) { onerror(xhr); }
    xhr.open("PUT", url + "?" + params, true);
    xhr.send();
  } catch(e) {
    Cu.reportError(e);
    onerror(xhr);
  }
  return xhr;
}

function DELETE_(url, params, onload, onerror) {
  var xhr = null;

  try {
    xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
    xhr.mozBackgroundRequest = true;
    xhr.onload = function(event) { onload(xhr); }
    xhr.onerror = function(event) { onerror(xhr); }
    xhr.open("DELETE", url + "?" + params, true);
    xhr.send();
  } catch(e) {
    Cu.reportError(e);
    onerror(xhr);
  }
  return xhr;
}

/**
 *
 */
function sbSoundCloudUser() {
  this._dbs = new sbSoundCloudDBService();
}

sbSoundCloudUser.prototype = {
  classDescription: "Songbird SoundCloud User",
  contractID:       "@songbirdnest.com/soundcloud/user;1",
  classID:          Components.ID("{15b3477c-1dd2-11b2-bb3f-c6b45e477571}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.sbISoundCloudUser]),

  _userid: null,
  _permalink: null,
  _realname: null,
  _avatar: null,
  _followingCount: null,
  _incomingCount: null,
  _favCount: null,
  _city: null,
  _country: null,
  _profileurl: null,

  get userid() {
    return this._userid;
  },

  get permalink() {
    return this._permalink;
  },

  get realname() {
    return this._realname;
  },

  get avatar() {
    if (this._avatar) {
      return this._avatar;
    } else {
      return "chrome://soundcloud/skin/default-avatar.png";
    }
  },

  get followingCount() {
    return this._followingCount;
  },

  get incomingCount() {
    return this._incomingCount;
  },

  get favCount() {
    return this._favCount;
  },

  get city() {
    return this._city;
  },

  get country() {
    return this._country;
  },

  get profileurl() {
    return this._profileurl;
  },

  createRelationship:
  function sbSoundCloudUser_createRelationship(aFollowingId) {
    this._dbs.insertRelationship(this._userid, aFollowingId);
  },

  hasRelationship:
  function sbSoundCloudUser_hasRelationship(aFollowingId) {
    return this._dbs.selectRelationship(this._userid, aFollowingId);
  },

  deleteRelationship:
  function sbSoundCloudUser_deleteRelationship(aFollowingId) {
    this._dbs.deleteRelationship(this._userid, aFollowingId);
  }
};

/**
 * SoundCloud XPCOM service component
 */
function sbSoundCloudService() {
  // Imports
  Cu.import("resource://soundcloud/OAuth.jsm");

  var self = this;

  this.log = DebugUtils.generateLogFunction("sbSoundCloudService");

  this._user = new sbSoundCloudUser();
  this._listeners = [];

  // XXX - setup model
  this._dbs = new sbSoundCloudDBService();
  this._dbs.createSearchTable();
  this._dbs.createUsersTable();
  this._dbs.createRelationshipsTable();

  this._prefs = Cc["@mozilla.org/preferences-service;1"]
                  .getService(Ci.nsIPrefService)
                  .getBranch("extensions.soundcloud.");

  this._dashLimit = this._prefs.getIntPref("dashboard.days");
  this._refreshTime = this._prefs.getIntPref("dashboard.refresh.mins");

  this._refreshTimer = Cc["@mozilla.org/timer;1"]
                         .createInstance(Ci.nsITimer);
  var interval = this._refreshTime * 60000;
  var timerCallback = function() {
                        //self.notifyListeners("onDashboardRefresh");
                        self.getDashboard();
                      };
  this._refreshTimer.initWithCallback(timerCallback,
                                      interval,
                                      Ci.nsITimer.TYPE_REPEATING_SLACK);

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
  function sbSoundCloudService__getLibrary(aLibrary, aUserId) {
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
   * \param aComplete             Boolean to dispatch search completed event.
   *
   */
  this._addItemsToLibrary =
  function sbSoundCloudService__addItemsToLibrary(aItems, aLibrary, aComplete) {
    var self = this;
    if (aItems != null) {
      var itemArray = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                         .createInstance(Ci.nsIMutableArray);
      var propertiesArray = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                              .createInstance(Ci.nsIMutableArray);
  
      for (let i = 0; i < aItems.length; i++) {
        var item = aItems[i];

        // Activities switch/case
        var unaffiliated = false;
        if (item.origin) {
          if (item.tags.indexOf("affiliated") == -1)
            unaffiliated = true;
          switch (item.type) {
            case "track":
              item = item.origin;
              break;
            case "track-sharing":
              item = item.origin.track;
              break;
            default:
          }
        }

        if (unaffiliated)
          continue;

        var trackID = item.id;
        var createdAt = new Date(item.created_at).getTime();
        var duration = item.duration * 1000;
        var commentable = item.commentable; /* unused */
        var title = item.title;
        var artwork = item.artwork_url;
        var username = item.user.username;
        var userid = item.user.id;
        var userlink = item.user.permalink;
        var genre = item.genre; /* unused */
        var description = item.description; /* unused */
        var labelid = item.label_id; /* unused */
        var labelname = item.label_name; /* unused */
        var bpm = item.bpm; /* unused; null option */
        var playcount = item.playback_count;
        var favcount = item.favoritings_count;
        var commentcount = item.comment_count; /* unused */
        var uri = item.uri;
        var permalinkURL = item.permalink_url;
        var waveformURL = item.waveform_url;
        var downloadURL = item.download_url || "";
        var streamURL = item.stream_url;
  
        if (downloadURL.indexOf(SOCL_URL) != -1)
          downloadURL += "?consumer_key=" + CONSUMER_KEY;
  
        if (!streamURL || streamURL.indexOf(SOCL_URL) == -1)
          continue;
        streamURL += "?consumer_key=" + CONSUMER_KEY;
  
        var properties =
          Cc["@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
            .createInstance(Ci.sbIMutablePropertyArray);
  
        properties.appendProperty(SB_PROPERTY_TRACK_ID, trackID);
        properties.appendProperty(SB_PROPERTY_CREATION_DATE, createdAt);
        properties.appendProperty(SBProperties.duration, duration);
        properties.appendProperty(SB_PROPERTY_COMMENTABLE, commentable);
        properties.appendProperty(SBProperties.trackName, title);
        properties.appendProperty(SBProperties.primaryImageURL, artwork);
        properties.appendProperty(SB_PROPERTY_USER, username);
        properties.appendProperty(SB_PROPERTY_USER_ID, userid);
        properties.appendProperty(SB_PROPERTY_USER_PERMALINK, userlink);
        // Setting artistName to user for LastFM scrobbling support. Ideally,
        // should scrape the artist metadata from the stream
        // XXX - TODO - Use discogs_name for artistName
        properties.appendProperty(SBProperties.artistName, username);
        properties.appendProperty(SB_PROPERTY_PLAYS, playcount);
        properties.appendProperty(SB_PROPERTY_FAVS, favcount);
        properties.appendProperty(SB_PROPERTY_PERMALINK, permalinkURL);
        properties.appendProperty(SB_PROPERTY_WAVEFORM, waveformURL);
        if (downloadURL) {
          properties.appendProperty(SB_PROPERTY_DOWNLOAD_IMAGE,
                                    "chrome://soundcloud/skin/download.png");
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
          if (!aMediaItems) { return; }

          if (aComplete && aMediaItems.length == itemArray.length) {
            self.notifyListeners("onSearchCompleted", [aLibrary]);
          }
          self.notifyListeners("onTracksAdded", [aLibrary]);
          if (aLibrary == self.dashboard) {
            self.updateDashboardCount();
          }
        }
      }

      aLibrary.batchCreateMediaItemsAsync(batchListener,
                                          itemArray,
                                          propertiesArray,
                                          false);
    }
  }
  
  /**
   * \brief
   *
   * \param
   *
   * \return
   */
  this._addFollowings =
  function sbSoundCloudService__addFollowings(aFollowerId, aJSON) {
    for (var i = 0; i < aJSON.length; i++) {
      this._dbs.insertUser(aJSON[i]);
      this._dbs.insertRelationship(aFollowerId, aJSON[i].id);
    }
  }
  
  /**
   * \brief Creates an HMAC-SHA1 signature for an OAuth request.
   *
   * \param aMessage              Message to sign.
   *
   * \return HMAC-SHA1 signature string
   */
  this._sign = function sbSoundCloudService__sign(aMessage) {
    var baseString = this._getBaseString(aMessage);
    var signature = b64_hmac_sha1(encodeURIComponent(CONSUMER_SECRET)
                                  + "&" 
                                  + encodeURIComponent(this._token_secret),
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
  function sbSoundCloudService__getBaseString(aMessage) {
    var params = aMessage.parameters;
    var s = "";
    for (let p in params) {
      if (params[p][0] != "oauth_signature") {
        if (p == 0) {
          s = params[p][0] + "=" + params[p][1];
        } else {
          s += "&" + params[p][0] + "=" + params[p][1];
        }
      }
    }
    return aMessage.method + "&" + encodeURIComponent(aMessage.action)
                          + "&" + encodeURIComponent(s);
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
  function sbSoundCloudService__getParameters(aURL, aMethodType, aParams) {
    var accessor = { consumerSecret: CONSUMER_SECRET };
    var message = { action: aURL,
                    method: aMethodType,
                    parameters: []
                  };

    // Optional parameters pushed
    for (var param in aParams) {
      message.parameters.push([param, aParams[param]]);
    }

    message.parameters.push(["oauth_consumer_key", CONSUMER_KEY]);
    message.parameters.push(["oauth_nonce", OAuth.nonce(11)]);
    message.parameters.push(["oauth_signature_method", SIG_METHOD]);
    message.parameters.push(["oauth_timestamp", OAuth.timestamp()]);
    if (this._oauth_token) {
      message.parameters.push(["oauth_token", this._oauth_token]);
    }
    message.parameters.push(["oauth_version", "1.0"]);

    message.parameters.push(["oauth_signature", this._sign(message)]);

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
  function sbSoundCloudService__requestToken(aSuccess, aFailure) {
    var self = this;

    this._oauth_token = "";
    this._token_secret = "";

    var url = SOCL_URL + "/oauth/request_token";
    var params = this._getParameters(url, "POST", null);

    if (!this._oauth_retries)
      this._oauth_retries = 0;

    var reqTokenSuccess = function reqTokenSuccess(xhr) {
      let response = xhr.responseText;
      if (response == "Invalid OAuth Request") {
        if (self._oauth_retries < MAX_RETRIES) {
          dump("\nOAuth request token #" + ++self._oauth_retries);
          self._requestToken(aSuccess, aFailure);
        } else {
          self._oauth_retries = null;
          aFailure(xhr);
        }
      } else {
        let tokenized = response.split("&")
        self._oauth_token = tokenized[0].split("=")[1];
        self._token_secret = tokenized[1].split("=")[1];

        let hash = md5(self._username + self._password);
        self._prefs.setCharPref(hash + ".oauth_token",
                                btoa(self._oauth_token));
        self._oauth_retries = null;

        aSuccess();
      }
    }

    var reqTokenFailure = function reqTokenFailure(xhr) {
      self._oauth_retries = null;
      aFailure(xhr);
      Cu.reportError("Status: " + xhr.status);
    }

    this._reqtoken_xhr = POST(url,
                              params,
                              reqTokenSuccess,
                              reqTokenFailure);
    return this._reqtoken_xhr;
  }

  /**
   * \brief Opens SoundCloud authorization dialog.
   *
   */
  this._authorize =
  function sbSoundCloudService__authorize() {
    Logins.set(this.username, this.password);

    var mainWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Ci.nsIWindowMediator)
                       .getMostRecentWindow('Songbird:Main');
    var features = "modal=yes,dependent=yes,resizable=yes,titlebar=no";
    mainWindow.openDialog(AUTH_PAGE,
                          "soundcloud_authorize", features);
  }

  /**
   * \brief Requests OAuth access token.
   *
   * \param aSuccess              Action to take on success.
   * \param aFailure              Action to take on failure.
   *
   */
  this._accessToken =
  function sbSoundCloudService__accessToken(aSuccess, aFailure) {
    var self = this;

    var url = SOCL_URL + "/oauth/access_token";
    var params = self._getParameters(url, "POST", null);

    if (!this._oauth_retries)
      this._oauth_retries = 0;

    var accessTokenSuccess = function accessTokenSuccess(xhr) {
      let response = xhr.responseText;
      if (response == "Invalid OAuth Request") {
        if (self._oauth_retries < MAX_RETRIES) {
          dump("\nOAuth access token #" + ++self._oauth_retries);
          self._accessToken(aSuccess, aFailure);
        } else {
          self._oauth_retries = null;
          aFailure(xhr);
        }
      } else {
        let tokenized = response.split("&")

        self._oauth_token = tokenized[0].split("=")[1];
        self._token_secret = tokenized[1].split("=")[1];

        aSuccess(xhr);

        self._oauth_retries = null;

        self.updateProfile(false);
      }
    }

    var accessTokenFailure = function accessTokenFailure(xhr) {
      self._oauth_retries = null;
      aFailure(xhr);
      dump("\nStatus: " + xhr.status + "\n" + xhr.getAllResponseHeaders());
    }

    this._accesstoken_xhr = POST(url,
                                 params,
                                 accessTokenSuccess,
                                 accessTokenFailure);
    return this._accesstoken_xhr;
  }

  this._nowplaying_url = null;
  this.__defineGetter__("nowPlayingURL", function() {
    return this._nowplaying_url;
  });
  this.__defineSetter__("nowPlayingURL", function(val) {
    this._nowplaying_url = val;
  });

  this.__defineGetter__("soundcloudURL", function() {
    return SOCL_URL;
  });

  this.__defineGetter__("user", function() { return this._user; });

  this.__defineGetter__("username", function() {
    if (typeof(this._username) == "undefined")
      return "";

    return this._username;
  });
  this.__defineGetter__("password", function() {
    if (typeof(this._password) == "undefined")
      return "";

    return this._password;
  });

  this.__defineGetter__("token", function() {
    let hash = md5(this._username + this._password);
    let pref = hash + ".oauth_token";
    this._oauth_token = (this._prefs.prefHasUserValue(pref)) ?
                         atob(this._prefs.getCharPref(pref)) : null;
    return this._oauth_token;
  });

  this.__defineGetter__("autoLogin", function() {
    let autologin = (this._prefs.prefHasUserValue("autologin")) ?
                      this._prefs.getBoolPref("autologin") : false;
    return autologin;
  });
  this.__defineSetter__("autoLogin", function(val) {
    this._prefs.setBoolPref("autologin", val);
    this.notifyListeners("onAutoLoginChanged");
  });

  // user-logged-out pref
  this.__defineGetter__("userLoggedOut", function() {
    return this._prefs.getBoolPref("loggedOut");
  });
  this.__defineSetter__("userLoggedOut", function(val) {
    this._prefs.setBoolPref("loggedOut", val);
  });

  this.__defineGetter__("authorized", function() {
    let auth = (this._authorized) ? true : (false || this.loggedIn);
    return auth;
  });
  this.__defineSetter__("authorized", function(aAuthorized){
    this._authorized = aAuthorized;
  });

  // the loggedIn state
  this._loggedIn = false;
  this.__defineGetter__("loggedIn", function() { return this._loggedIn; });
  this.__defineSetter__("loggedIn", function(aLoggedIn){
    this._loggedIn = aLoggedIn;
    this.notifyListeners("onLoggedInStateChanged");
  });

  this.__defineGetter__("running", function() {
    let busy = (this._track_xhr) ? true : false;
    return busy;
  });

  // get the playback history service
  this._playbackHistory =
      Cc["@songbirdnest.com/Songbird/PlaybackHistoryService;1"]
        .getService(Ci.sbIPlaybackHistoryService);
  // add ourselves as a playlist history listener
  this._playbackHistory.addListener(this);

  this._library = this._getLibrary(Libraries.SEARCH, null);
  this._downloads = this._getLibrary(Libraries.DOWNLOADS, null);

  this.__defineGetter__("library", function() { return this._library; });
  this.__defineGetter__("dashboard", function() {
    let dashLib = (this._dashboard) ? this._dashboard : null;
    return dashLib;
  });
  this.__defineGetter__("favorites", function() {
    let favLib = (this._favorites) ? this._favorites : null;
    return favLib;
  });
  this.__defineGetter__("followings", function() {
  });
  this.__defineGetter__("downloads", function() { return this._downloads; });

  this.__defineGetter__("lastSearch", function() {
      if (!this._dbs)
        return;

      let term = "";

      try {
        term = unescape(this._dbs.getLastSearch());
      } catch(ex) {
        Cu.reportError(ex);
      }

      return term;
    });

  this._strings =
    Cc["@mozilla.org/intl/stringbundle;1"]
      .getService(Ci.nsIStringBundleService)
      .createBundle("chrome://soundcloud/locale/overlay.properties");

  var login = Logins.get();
  this._username = login.username;
  this._password = login.password;

  this._servicePaneService = Cc['@songbirdnest.com/servicepane/service;1']
                               .getService(Ci.sbIServicePaneService);

  // find a radio folder if it already exists
  var radioFolder = this._servicePaneService.getNode("SB:RadioStations");
  if (!radioFolder) {
    radioFolder = this._servicePaneService.createNode();
    radioFolder.id = "SB:RadioStations";
    radioFolder.className = "folder radio";
    radioFolder.name = SBString("servicesource.radio");
    radioFolder.setAttributeNS(SB_NS, "radioFolder", 1); // for backward-compat
    radioFolder.setAttributeNS(SP_NS, "Weight", 2);
    this._servicePaneService.root.appendChild(radioFolder);
  }
  radioFolder.editable = false;
  radioFolder.hidden = false;

  var soclRadio = this._servicePaneService.getNode("SB:RadioStations:SoundCloud");
  if (!soclRadio) {
    this._servicePaneNode = this._servicePaneService.createNode();
    this._servicePaneNode.url =
      "chrome://soundcloud/content/directory.xul?type=main";
    this._servicePaneNode.id = "SB:RadioStations:SoundCloud";
    this._servicePaneNode.name = "SoundCloud";
    this._servicePaneNode.image = 'chrome://soundcloud/skin/favicon.png';
    this._servicePaneNode.editable = false;
    this._servicePaneNode.hidden = false;
    radioFolder.appendChild(this._servicePaneNode);
  }
}

sbSoundCloudService.prototype = {
  classDescription: "Songbird SoundCloud Service",
  contractID:       "@songbirdnest.com/soundcloud/service;1",
  classID:          Components.ID("{dbd47eee-1dd1-11b2-9cdb-850f6f454492}"),
  QueryInterface:   XPCOMUtils.generateQI([Ci.sbISoundCloudService]),

  updateServicePaneNodes:
  function sbSoundCloudService_updateServicePaneNodes() {
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
                         .getNode("urn:socldashboard");
      if (!dashNode) {
        dashNode = this._servicePaneService.createNode();
        dashNode.url=
          "chrome://soundcloud/content/directory.xul?type=dashboard";
        dashNode.id = "urn:socldashboard"
        dashNode.name = "Dashboard";
        dashNode.image = "chrome://soundcloud/skin/dashboard.png";
        dashNode.tooltip = "Your dashboard";
        dashNode.editable = false;
        dashNode.setAttributeNS(SP_NS, "Weight", 5);
        soclNode.appendChild(dashNode);
        dashNode.hidden = false;
      }

      var dashBadge = ServicePaneHelper.getBadge(dashNode, "socldashboard");
      dashBadge.visible = false;
   
      // Create favorites node
      var favNode = this._servicePaneService
                        .getNode("urn:soclfavorites");
      if (!favNode) {
        favNode = this._servicePaneService.createNode();
        favNode.url=
          "chrome://soundcloud/content/directory.xul?type=favorites";
        favNode.id = "urn:soclfavorites"
        favNode.name = "Favorites";
        favNode.image = "chrome://soundcloud/skin/favorites.png";
        favNode.tooltip = "Tracks you loved";
        favNode.editable = false;
        favNode.setAttributeNS(SP_NS, "Weight", 20);
        soclNode.appendChild(favNode);
        favNode.hidden = false;
      }

      var favBadge = ServicePaneHelper.getBadge(favNode, "soclfavcount");
      favBadge.label = this.user.favCount;
      favBadge.visible = true;
   
      this._dashboard = this._getLibrary(Libraries.DASHBOARD, this._user.userid);
      this._favorites = this._getLibrary(Libraries.FAVORITES, this._user.userid);

      this.getFavorites();
    } else {
      while (soclNode.firstChild) {
        soclNode.removeChild(soclNode.firstChild);
      }
    }

    // XXX - Need to switch the active node if it's any of the above
  },

  shouldAutoLogin: function sbSoundCloudService_shouldAutoLogin() {
    return this.autoLogin &&
           this.username &&
           this.password &&
           !this.userLoggedOut;
  },

  login:
  function sbSoundCloudService_login(aUsername, aPassword, aClearSession) {
    var self = this;

    this.notifyListeners("onLoginBegins");

    this._username = aUsername;
    this._password = aPassword;
    this.userLoggedOut = false;

    var hash = md5(this._username + this._password);
    var secretPref = hash + ".token_secret";
    this._token_secret = (this._prefs.prefHasUserValue(secretPref)) ?
                          atob(this._prefs.getCharPref(secretPref)) : null;

    if (!aClearSession) {
      if (this.token && this._token_secret)
        return this.updateProfile(true);
    } else {
      this._prefs.clearUserPref(hash + ".oauth_token");
      this._prefs.clearUserPref(secretPref);
    }
   
    var success = function success(xhr) {
      self._authorize();
    }

    var failure = function failure(xhr) {
      dump("\nSession cleared: " + aClearSession);
      dump("\nRequest token failed: " + xhr.responseText);
    }

    this._requestToken(success, failure);
  },

  logout: function sbSoundCloudService_logout() {
    this.notifyListeners("onLogout");
    this.userLoggedOut = true;
    this.loggedIn = false;
    this._token_secret = null;
    this.updateServicePaneNodes();
  },

  cancelLogin: function sbSoundCloudService_cancelLogin() {
    this.logout();
  },

  authCallback: function sbSoundCloudService_authCallback() {
    var self = this;
    if (this.authorized) {
      var success = function success(xhr) {
        let hash = md5(self._username + self._password);
        self._prefs.setCharPref(hash + ".oauth_token",
                                btoa(self._oauth_token));
        self._prefs.setCharPref(hash + ".token_secret",
                                btoa(self._token_secret));
      }

      var failure = function failure(xhr) {
        dump("\nAccess token failed; " + xhr.responseText);
      }

      this._accessToken(success, failure);
    } else {
      this.notifyListeners("onLoggedInStateChanged");
    }
  },

  updateProfile:
  function sbSoundCloudService_updateProfile(aSessionSaved) {
    var self = this;

    if (!this._info_retries)
      this._info_retries = 0;

    var url = SOCL_URL + "/me.json";
    var params = this._getParameters(url, "GET", null);

    var success = function(xhr) {
      let json = xhr.responseText;
      let jsObject = JSON.parse(json);
      if (jsObject.error) {
        if (self._info_retries < MAX_RETRIES) {
          dump("\nProfile Request #" + ++self._info_retries);
          return self.updateProfile(aSessionSaved);
        } else {
          failure(xhr);
        }
      } else {
        self._info_retries = null;

        self._dbs.insertUser(jsObject);
        self.user._userid = jsObject.id;
        self.user._permalink = jsObject.permalink;
        self.user._realname = jsObject.username;
        self.user._avatar = jsObject.avatar_url;
        self.user._followingCount = jsObject.followings_count;
        self.user._favCount = jsObject.public_favorites_count;
        self.user._city = jsObject.city;
        self.user._country = jsObject.country;
        self.user._profileurl = jsObject.permalink_url;

        self.notifyListeners("onProfileUpdated");

        self.loggedIn = true;
        self.updateServicePaneNodes();
        self.getDashboard();
        self.getFollowings(self.user.userid, 0);
      }
    }

    var failure = function(xhr) {
      if (aSessionSaved)
        return self.login(self.username, self.password, true);

      dump("\nUnable to retrieve profile. Falling back to logged out state.");
      dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
      self._info_retries = null;
      self.loggedIn = false;
      return false;
    }

    this._info_xhr = GET(url, params, success, failure, true);
  },

  getUser:
  function sbSoundCloudService_getUser(aUserId) {
  },

  getTracks:
  function sbSoundCloudService_getTracks(aUser, aQuery, aFlags, aOffset) {
    var self = this;

    if (this._track_retries == null) {
      this._track_retries = 0;
    }

    var url = SOCL_URL;

    if (aUser)
      url += "/users/" + aUser;

    url += "/tracks.json";
    
    if (aOffset == 0) {
      if (this._track_xhr)
        this._track_xhr.abort();

      if (!aQuery && aUser) {
        this._dbs.insertSearch(url + "?" + aFlags, aUser);
      } else {
        this._dbs.insertSearch(url + "?" + aFlags, aQuery);
      }

      this._library.clear();
    }

    var success = function(xhr) {
      let json = xhr.responseText;
      let tracks = JSON.parse(json);
      if (tracks.error) {
        if (self._track_retries < MAX_RETRIES) {
          self._track_retries++;
          return self.getTracks(aUser, aQuery, aFlags, aOffset);
        } else {
          Cu.reportError("Unable to retrieve tracks: " + tracks.error);
          self._track_retries = null;
          self._track_xhr = null;
          return false;
        }
      }

      var completed = false;

      if (tracks.length > 40) {
        self._track_retries = 0;
        aOffset += tracks.length
        self.getTracks(aUser, aQuery, aFlags, aOffset);
      } else {
        self._track_xhr = null;
        completed = true;
      }

      self._addItemsToLibrary(tracks, self._library, completed);
    }

    var failure = function(xhr) {
      dump("\nUnable to retrieve tracks.");
      dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
      self._track_retries = null;
      self._track_xhr = null;
      return false;
    }

    var params = "";
    if (aQuery)
      params += "q=" + aQuery + "&";
    params += aFlags + "&offset=" + aOffset + "&consumer_key=" + CONSUMER_KEY;
    this._track_xhr = GET(url, params, success, failure, false);
  },

  getDashboard: function sbSoundCloudService_getDashboard(aCursor) {
    var self = this;

    var dashNode = this._servicePaneService
                       .getNode("urn:socldashboard");
    var dashBadge = ServicePaneHelper.getBadge(dashNode,
                                               "socldashboard");

    if (!this.loggedIn)
      return;

    if (!aCursor) {
      if (this._dash_xhr)
        this._dash_xhr.abort();

      this.notifyListeners("onDashboardRefresh");
      this._dashLimit = this._prefs.getIntPref("dashboard.days");
      //this._refreshTime = this._prefs.getIntPref("dashboard.refresh.mins");
      //this._refreshTimer.delay = this._refreshTimer * 60000;

      this._dashboard.clear();
      dashBadge.remove();
      dashBadge.image = "chrome://songbird/skin/service-pane/icon-busy.png";
      dashBadge.visible = true;

      this._dash_counted = false;
      this._dash_retries = 0;
    }

    var url = SOCL_URL + "/me/activities/tracks.json";

    var success = function(xhr) {
      let json = xhr.responseText;
      let activities = JSON.parse(json);
      if (activities.error) {
        if (self._dash_retries < MAX_RETRIES) {
          self._dash_retries++;
          return self.getDashboard(aCursor);
        } else {
          Cu.reportError("Unable to retrieve activities: " + activities.error);
          self._dash_xhr = null;
          self._dash_retries = null;
          return false;
        }
      }

      var next_href = activities.next_href;
      var completed = (next_href == null);
      self._dash_retries = null;

      if (next_href) {
        let idx = next_href.indexOf("cursor");
        let slc = next_href.slice(idx);
        let cursor = slc.split("=")[1];
        self._dash_xhr = self.getDashboard(cursor);
      } else {
        self._dash_xhr = null;
      }

      self._addItemsToLibrary(activities.collection,
                              self._dashboard,
                              completed);
    }

    var failure = function(xhr) {
      dump("\nUnable to retrieve activities.");
      dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
      self._dash_xhr = null;
      self._dash_retries = null;
      return false;
    }

    var flags = null;
    if (aCursor)
      flags = { "cursor" : aCursor };
    var params = this._getParameters(url, "GET", flags);

    this._dash_xhr = GET(url, params, success, failure, true);
    return this._dash_xhr;
  },

  updateDashboardCount:
  function sbSoundCloudService_updateDashboardCount() {
    var self = this;
    var dashNode = this._servicePaneService
                       .getNode("urn:socldashboard");
    var dashBadge = ServicePaneHelper.getBadge(dashNode,
                                               "socldashboard");
    var enumListener = {
      onEnumerationBegin: function(list) {
        self._incomingCount = 0;
      },
      onEnumeratedItem: function(list, item) {
        let creation_date =
          item.getProperty(SB_PROPERTY_CREATION_DATE);
        let now = new Date().getTime();
        let limit = now - (1000 * 60 * 60 * 24 * self._dashLimit);
        if (creation_date > limit)
          self._incomingCount += 1;
      },
      onEnumerationEnd: function(list, status) {
        if (self._incomingCount > 0) {
          if (dashBadge.label) {
            self._dash_counted =
              parseInt(dashBadge.label) === self._incomingCount;
          }
          dashBadge.remove();
          dashBadge.label = self._incomingCount;
          dashBadge.visible = true;
        } else if (!self._dash_xhr) {
          self._dash_counted = true;
          dashBadge.remove();
          dashBadge.visible = false;
        }
      }
    }

    if (!self._dash_counted) {
      self._dashboard.enumerateAllItems(enumListener);
    }
  },

  getFavorites: function sbSoundCloudService_getFavorites(aUserId, aOffset) {
    var self = this;
    var offset = aOffset || 0;

    if (this._fav_xhr) {
      this._fav_xhr.abort();
    }

    if (this._fav_retries == null) {
      this._favorites.clear();
      this._fav_retries = 0;
    }

    var url = SOCL_URL + "/users/";
    if (aUserId) {
      // XXX - Need to update to user object
      url += aUserId;
    } else {
      if (!this._user.userid || !this.loggedIn) { return; }

      url += this._user.userid;
    }

    url += "/favorites.json";

    var success = function(xhr) {
      let json = xhr.responseText;
      let favorites = JSON.parse(json);
      if (favorites.error) {
        if (self._fav_retries < MAX_RETRIES) {
          self._fav_retries++;
          return self.getFavorites(aUserId, offset);
        } else {
          Cu.reportError("Unable to retrieve favorites: " + favorites.error);
          self._fav_xhr = null;
          self._fav_retries = null;
          return false;
        }
      }

      var completed = false;

      if (favorites.length < 50) {
        self._fav_xhr = null;
        self._fav_retries = null;
        completed = true;
      } else {
        self._fav_retries = 0;
        self._fav_xhr = self.getFavorites(aUserId, offset + favorites.length);
      }

      self._addItemsToLibrary(favorites, self._favorites, completed);
    }

    var failure = function(xhr) {
      dump("\nUnable to retrieve favorites.");
      dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
      self._fav_xhr = null;
      self._fav_retries = null;
      return false;
    }

    var params = "offset=" + offset
                 + "&order=favorited_at"
                 + "&consumer_key=" + CONSUMER_KEY;
    this._fav_xhr = GET(url, params, success, failure, false);
    return this._fav_xhr;
  },

  favoriteTrack:
  function sbSoundCloudService_favoriteTrack(aTrack, aFavorite) {
    var self = this;

    if (!this.loggedIn)
      return;

    if (!this._favaction_retries) {
      this._favaction_retries = 0;
    }

    var trackId = aTrack.getProperty(SB_PROPERTY_TRACK_ID);
    var url = SOCL_URL + "/me/favorites/" + trackId;
    var success = function(xhr) {
      self._favaction_retries += 1;
      // Check for an error status
      var nsResolver = xhr.responseXML.createNSResolver(
                                xhr.responseXML.ownerDocument == null ?
                                xhr.responseXML.documentElement :
                                xhr.responseXML.ownerDocument.documentElement);
      var result = xhr.responseXML.evaluate("//status",
                                            xhr.responseXML,
                                            nsResolver,
                                            2,  //XPathResult.STRING_TYPE,
                                            null);
      if (result.stringValue.indexOf("200") != -1) {
        self._favaction_retries = 0;
        self.getFavorites();

        if (aFavorite) {
          self.user._favCount += 1;
          self.notifyListeners("onFavorite", [aTrack]);
        } else {
          self.user._favCount -= 1;
          self.notifyListeners("onUnfavorite", [aTrack]);
        }
        var favNode = self._servicePaneService
                          .getNode("urn:soclfavorites");
        var favBadge = ServicePaneHelper.getBadge(favNode, "soclfavcount");
        favBadge.remove();
        favBadge.label = self.user.favCount;
        favBadge.visible = true;

      } else {
        if (self._favaction_retries < MAX_RETRIES) {
          self._favaction_retries += 1;
          return self.favoriteTrack(aTrack, aFavorite);
        }

        if (result.stringValue == "") {
          // 401 - Unauthorized
          result = xhr.responseXML.evaluate("//error",
                                             xhr.responseXML,
                                             nsResolver,
                                             2,  //XPathResult.STRING_TYPE,
                                             null);
        }

        Cu.reportError(result.stringValue);

      }
    }

    var failure = function(xhr) {
      Cu.reportError(xhr.responseText);
      return false;
    }

    var params;
    if (aFavorite) {
      params = this._getParameters(url, "PUT", null);
      PUT(url, params, success, failure);
    } else {
      params = this._getParameters(url, "DELETE", null);
      DELETE_(url, params, success, failure);
    }
  },

  /* Doesn't do much right now */
  getFollowings:
  function sbSoundCloudService_getFollowings(aUserId, aOffset) {
    var self = this;
    var offset = aOffset || 0;

    if (this._foll_xhr) {
      this._foll_xhr.abort();
    }

    if (this._foll_retries == null) {
      this._foll_retries = 0;
      this.user._follCount = 0;
    }

    var url = SOCL_URL + "/users/";
    if (aUserId) {
      // XXX - Need to update to user object
      url += aUserId;
    } else {
      if (!this._user.userid || !this.loggedIn) { return; }

      url += this._user.userid;
    }

    url += "/followings.json";

    var success = function(xhr) {
      let json = xhr.responseText;
      let followings = JSON.parse(json);
      if (followings.error) {
        if (self._foll_retries < MAX_RETRIES) {
          self._foll_retries++;
          return self.getFollowings(aUserId, offset);
        } else {
          Cu.reportError("Unable to retrieve followings: " + followings.error);
          self._foll_xhr = null;
          self._foll_retries = null;
          return false;
        }
      }

      self.user._follCount += followings.length;
      self._addFollowings(self._user.userid, followings);

      if (followings.length < 50) {
        self._foll_xhr = null;
        self._foll_retries = null;
      } else {
        self._foll_retries = 0;
        self._foll_xhr = self.getFollowings(aUserId, offset + followings.length);
      }
    }

    var failure = function(xhr) {
      dump("\nUnable to retrieve followings.");
      dump("\nStatus is " + xhr.status + "\n" + xhr.getAllResponseHeaders());
      self._foll_xhr = null;
      self._foll_retries = null;
      return false;
    }

    var params = "offset=" + offset + "&consumer_key=" + CONSUMER_KEY;
    this._foll_xhr = GET(url, params, success, failure, false);
    return this._foll_xhr;
  },

  followUser:
  function sbSoundCloudService_followUser(aUserId, aUsername, aFollowing) {
    if (!this.loggedIn)
      return;

    if (this._follput_retries == null) {
      this._follput_retries = 0;
    }

    var self = this;
    var url = SOCL_URL + "/me/followings/" + aUserId;
    var success = function(xhr) {
      self._follput_retries += 1;
      // Check for an error status
      var nsResolver = xhr.responseXML.createNSResolver(
                                xhr.responseXML.ownerDocument == null ?
                                xhr.responseXML.documentElement :
                                xhr.responseXML.ownerDocument.documentElement);
      var result = xhr.responseXML.evaluate("//status",
                                            xhr.responseXML,
                                            nsResolver,
                                            2,  //XPathResult.STRING_TYPE,
                                            null);
      if (result.stringValue.indexOf("200") != -1) {
        self._follput_retries = 0;

        if (aFollowing) {
          self._user.createRelationship(aUserId);
          self.notifyListeners("onFollowing", [aUsername]);
        } else {
          self._user.deleteRelationship(aUserId);
          self.notifyListeners("onUnfollowing", [aUsername]);
        }

        self.getFollowings();
      } else {
        if (self._follput_retries < MAX_RETRIES) {
          self._follput_retries += 1;
          return self.followUser(aUserId, aUsername, aFollowing);
        }

        if (result.stringValue == "") {
          // 401 - Unauthorized
          result = xhr.responseXML.evaluate("//error",
                                             xhr.responseXML,
                                             nsResolver,
                                             2,  //XPathResult.STRING_TYPE,
                                             null);
        }

        Cu.reportError(result.stringValue);

      }
    }

    var failure = function(xhr) {
      Cu.reportError(xhr.responseText);
      return false;
    }

    var params = this._getParameters(url, "PUT", null);
    PUT(url, params, success, failure);
  },

  addListener: function sbSoundCloudService_addListener(aListener) {
    this._listeners.push(aListener);
  },

  removeListener: function sbSoundCloudService_removeListener(aListener) {
    // find our listener in the array
    var i = this._listeners.indexOf(aListener);
    if (i >= 0) {
      this._listeners.splice(i, 1);
    }
  },

  notifyListeners:
  function sbSoundCloudService_notifyListeners(aEventTrigger, aArgs) {
    for (var i=0; i < this._listeners.length; i++) {
      var listener = this._listeners[i]
                         .QueryInterface(Ci.sbISoundCloudListener);
      try {
        listener[aEventTrigger].apply(this, aArgs);
      } catch(e) {
        Cu.reportError("Could not signal " + aEventTrigger +
        " to sbSoundCloudListener. Failed with error: " + e.description);
      }
    }
  },

  // sbIPlaybackHistoryListener
  onEntriesAdded: function sbSoundCloudService_onEntriesAdded(aEntries) {
    // In order to get tracks to scrobble, need to scrape the metadata.
    // LastFM API: http://www.last.fm/api/show?service=443
  },

  onEntriesUpdated: function sbSoundCloudService_onEntriesUpdated(aEntries) {
  },

  onEntriesRemoved: function sbSoundCloudService_onEntriesRemoved(aEntries) {
  },

  onEntriesCleared: function sbSoundCloudService_onEntriesCleared() {
  },

  shutdown: function sbSoundCloudService_shutdown() {
    this._playbackHistory.removeListener(this);

    if (this._refreshTimer) {
      this._refreshTimer.cancel();
      this._refreshTimer = null;
    }
  }
};

var components = [sbSoundCloudService, sbSoundCloudUser];
function NSGetModule(compMgr, fileSpec) {
  return XPCOMUtils.generateModule(components);
}
