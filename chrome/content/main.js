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

Cu.import("resource://app/jsmodules/DOMUtils.jsm");
Cu.import("resource://app/jsmodules/sbProperties.jsm");

// Create a namespace
if (typeof SoundCloud == "undefined")
  var SoundCloud = {};

/**
 *
 */
SoundCloud.SB_NS = "http://songbirdnest.com/data/1.0#";
SoundCloud.SP_NS = "http://songbirdnest.com/rdf/servicepane#";

SoundCloud.URL_SIGNUP = "http://soundcloud.com/signup";
SoundCloud.URL_PASSWORD = "https://soundcloud.com/login/forgot";

SoundCloud.Icons = {
  busy: "chrome://soundcloud/skin/busy.png",
  disabled: "chrome://soundcloud/skin/disabled.png",
  logged_in: "chrome://soundcloud/skin/logged-in.png"
};

SoundCloud.onLoad = function SoundCloud_onLoad() {
  this._strings = document.getElementById("soundcloud-strings");

  this._service = Cc["@songbirdnest.com/soundcloud/service;1"]
                    .getService(Ci.sbISoundCloudService);

  this.m_mgr = Cc["@songbirdnest.com/Songbird/PlaylistCommandsManager;1"]
              .createInstance(Ci.sbIPlaylistCommandsManager);

  if (!this.m_mgr.request("soundcloud-cmds@sb.com"))
    this._initCommands();

  this._downloadItems = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                          .getService(Ci.nsIMutableArray);

  this._statusIcon = document.getElementById("soundcloudStatusIcon");
  this._panelBinding = document.getElementById("soundcloudLoginPanel");
  this._panel = this._getElement(this._panelBinding, "loginPanel");
  this._deck = this._getElement(this._panelBinding, "loginDeck");
  this._login = this._getElement(this._panelBinding, "loginBox");
  this._username = this._getElement(this._panelBinding, "username");
  // Hacky solution to increase max length of username field
  this._username.setAttribute("maxlength", 255);
  this._password = this._getElement(this._panelBinding, "password");
  this._loginAutoLogin = this._getElement(this._panelBinding,
                                          "loginAutoLogin");
  this._loginButton = this._getElement(this._panelBinding, "loginButton");
  this._newAccountGroupbox = this._getElement(this._panelBinding,
                                              "newAccountGroupbox");
  this._loginError = this._getElement(this._panelBinding, "loginError");
  this._loggingIn = this._getElement(this._panelBinding, "loginProgressBox");
  this._cancelButton = this._getElement(this._panelBinding, "cancelButton");

  this._signupButton = this._getElement(this._panelBinding, "signupButton");

  this._forgotpass = this._getElement(this._panelBinding, "forgotpass");
  this._forgotpass.textContent =
         this._strings.getString("soundcloud.forgotpass.label");

  this._profile = this._getElement(this._panelBinding, "profileBox");
  this._image = this._getElement(this._panelBinding, "image");
  this._realname = this._getElement(this._panelBinding, "realname");
  this._citycountry = this._getElement(this._panelBinding, "profileDescription");
  this._profileCheckbox = this._getElement(this._panelBinding, "profileCheckbox");
  this._profileCheckbox.hidden = true;
  this._profileAutoLogin = this._getElement(this._panelBinding,
                                            "profileAutoLogin");

  var self = this;

  /**
   *
   */
  this.listener = {
    onLoginBegins: function listener_onLoginBegins() {
      self._deck.selectedPanel = self._loggingIn;
      self._newAccountGroupbox.setAttribute("loggedOut", "false");
      self.setStatusIcon(self.Icons.busy);
    },
    onAutoLoginChanged: function listener_onAutoLoginChanged() {
      if (self._service.autoLogin) {
        self._loginAutoLogin.setAttribute("checked", "true");
        self._profileAutoLogin.setAttribute("checked", "true");
      } else {
        self._loginAutoLogin.removeAttribute("checked");
        self._profileAutoLogin.removeAttribute("checked");
      }
    },
    onLoggedInStateChanged: function listener_onLoggedInStateChanged() {
      if (self._service.loggedIn) {
        self._deck.selectedPanel = self._profile;
        self._newAccountGroupbox.setAttribute("loggedOut", "false");
        self.setStatusIcon(self.Icons.logged_in);
      } else {
        self.setLoginError(null);
        self._deck.selectedPanel = self._login;
        self._newAccountGroupbox.removeAttribute("loggedOut");
        self.setStatusIcon(self.Icons.disabled);
      }
    },
    onProfileUpdated: function listener_onProfileUpdated() {
      self._user = self._service.user;

      var avatar = self._user.avatar;
      self._image.setAttributeNS("http://www.w3.org/1999/xlink", "href", avatar);
      if (self._user.realname && self._user.realname.length) {
        self._realname.textContent = self._user.realname;
      } else {
        self._realName.textContent = self._username.value;
      }
      self._citycountry.textContent = self._user.city + ", " +
                                      self._user.country;
    },
    onTracksAdded: function listener_onTracksAdded() {
      
    },
    QueryInterface: XPCOMUtils.generateQI([Ci.sbISoundCloudListener])
  };

  this._service.addListener(this.listener);

  this._domEventListenerSet = new DOMEventListenerSet();

  var onProfileUrlClicked = function(event) {
    self.loadURI(self._user.profileurl, event);
  }

  // Wire up UI events for the profile links
  this._domEventListenerSet.add(this._image,
                                "click",
                                onProfileUrlClicked,
                                false,
                                false);
  this._domEventListenerSet.add(this._realname,
                                "click",
                                onProfileUrlClicked,
                                false,
                                false);

  this._domEventListenerSet.add(this._citycountry,
                                "click",
                                function() { dump(self._citycountry); },
                                false,
                                false);

  // Wire up click event for the status icon
  this._statusIcon.addEventListener("click",
    function(event) {
    // Only the left button
      if (event.button != 0) return;
      self._showPanel();
    }, false);

  // wire up the signup link
  var onSignupButtonClicked = function(event) {
    self.loadURI(self.URL_SIGNUP, event);
  };
  this._domEventListenerSet.add(this._signupButton,
                                "click",
                                onSignupButtonClicked,
                                false,
                                false);

  // wire up the forgot password link
  var onForgotpass = function(event) {
    self.loadURI(self.URL_PASSWORD, event);
  };
  this._domEventListenerSet.add(this._forgotpass,
                                "click",
                                onForgotpass,
                                false,
                                false);

  var onAutoLoginToggled = function(event) { self._toggleAutoLogin(); };
  this._domEventListenerSet.add(this._loginAutoLogin,
                                "command",
                                onAutoLoginToggled,
                                false,
                                false);
  this._domEventListenerSet.add(this._profileAutoLogin,
                                "command",
                                onAutoLoginToggled,
                                false,
                                false);

  var onButtonClicked = function(event) { self._handleUIEvents(event); };
  this._domEventListenerSet.add(this._panelBinding,
                                "login-button-clicked",
                                onButtonClicked,
                                false,
                                false);
  this._domEventListenerSet.add(this._panelBinding,
                                "cancel-button-clicked",
                                onButtonClicked,
                                false,
                                false);
  this._domEventListenerSet.add(this._panelBinding,
                                "logout-button-clicked",
                                onButtonClicked,
                                false,
                                false);

  // copy the username & password out of the service into the UI
  this._username.value = this._service.username;
  this._password.value = this._service.password;

  // Initially disable the login button if no username or password value
  if (!this._username.value || !this._password.value) {
    this._loginButton.disabled = true;
  }

  // clear the login error message
  this.setLoginError(null);
  // update the ui with the should-auto-login state
  this.listener.onAutoLoginChanged();
  // update the ui with the logged-in state
  this.listener.onLoggedInStateChanged();

  // if we have a username & password then try to log in
  if (this._service.shouldAutoLogin()) {
    this._service.login(this._username.value,
                        this._password.value,
                        false);
  }

  // Attach our listener to the ShowCurrentTrack event issued by the
  // faceplate
  var faceplateManager = Cc["@songbirdnest.com/faceplate/manager;1"].
    getService(Ci.sbIFaceplateManager);
  var pane = faceplateManager.getPane("songbird-dashboard");
  var sbWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Ci.nsIWindowMediator)
                   .getMostRecentWindow("Songbird:Main").window;
  sbWindow.addEventListener("ShowCurrentTrack", this.curTrackListener, true);

  // Create our properties if they don"t exist
  var pMgr = Cc["@songbirdnest.com/Songbird/Properties/PropertyManager;1"].
    getService(Ci.sbIPropertyManager);

  if (!pMgr.hasProperty(SBProperties.trackName)) {
    var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Text;1"]
               .createInstance(Ci.sbITextPropertyInfo);
    pI.id = SBProperties.trackName;
    pI.displayName = this._strings.getString("trackName");
    pI.userEditable = false;
    pI.userViewable = false;
    pMgr.addPropertyInfo(pI);
  }

  if (!pMgr.hasProperty(SBProperties.duration)) {
    var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Number;1"]
               .createInstance(Ci.sbINumberPropertyInfo);
    pI.id = SBProperties.duration;
    pI.displayName = this._strings.getString("duration");
    pI.userEditable = false;
    pI.userViewable = false;
    pMgr.addPropertyInfo(pI);
  }

  if (!pMgr.hasProperty(SB_PROPERTY_USER)) {
    var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Text;1"]
               .createInstance(Ci.sbITextPropertyInfo);
    pI.id = SB_PROPERTY_USER;
    pI.displayName = this._strings.getString("user");
    pI.userEditable = false;
    pI.userViewable = false;
    pMgr.addPropertyInfo(pI);
  }

  if (!pMgr.hasProperty(SB_PROPERTY_PLAYS)) {
    var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Text;1"]
               .createInstance(Ci.sbITextPropertyInfo);
    pI.id = SB_PROPERTY_PLAYS;
    pI.displayName = " ";
    pI.userEditable = false;
    pI.userViewable = false;
    pMgr.addPropertyInfo(pI);
  }

  if (!pMgr.hasProperty(SB_PROPERTY_FAVS)) {
    var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Text;1"]
               .createInstance(Ci.sbITextPropertyInfo);
    pI.id = SB_PROPERTY_FAVS;
    pI.displayName = " ";
    pI.userEditable = false;
    pI.userViewable = false;
    pMgr.addPropertyInfo(pI);
  }

  if (!pMgr.hasProperty(SB_PROPERTY_DOWNLOAD_IMAGE)) {
    var builder = Cc["@songbirdnest.com/Songbird/Properties/Builder/Image;1"]
                    .createInstance(Ci.sbIImagePropertyBuilder);
    builder.propertyID = SB_PROPERTY_DOWNLOAD_IMAGE;
    builder.displayName = " ";
    builder.userEditable = false;
    builder.userViewable = false;
    var pI = builder.get();
    pMgr.addPropertyInfo(pI);
  }

  if (!pMgr.hasProperty(SB_PROPERTY_CREATION_DATE)) {
    var pI = Cc["@songbirdnest.com/Songbird/Properties/Info/Datetime;1"]
               .createInstance(Ci.sbIDatetimePropertyInfo);
    pI.id = SB_PROPERTY_CREATION_DATE;
    pI.timeType = Ci.sbIDatetimePropertyInfo.TIMETYPE_DATETIME
    pI.displayName = "Created At";
    pI.userEditable = false;
    pI.userViewable = false;
    pMgr.addPropertyInfo(pI);
  }

  // Source image needs to be updated
  var pI = pMgr.getPropertyInfo(SBProperties.trackType)
               .QueryInterface(Ci.sbIImageLabelLinkPropertyInfo);
  pI.addImage("soundcloud", "chrome://soundcloud/skin/source.png");
}

SoundCloud._initCommands = function SoundCloud__initCommands() {
  var self = this;
  var ioService = Cc["@mozilla.org/network/io-service;1"]
                    .getService(Ci.nsIIOService);

  var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
  var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"]
                         .getService(Ci.nsIVersionComparator);
  var PlaylistCommandsBuilder = {};
  if (versionChecker.compare(appInfo.version, "1.10") >= 0) {
    PlaylistCommandsBuilder = new Components.
      Constructor("@songbirdnest.com/Songbird/PlaylistCommandsBuilder;1",
                  "sbIPlaylistCommandsBuilder", "init");
  } else {
    PlaylistCommandsBuilder = new Components.
      Constructor("@songbirdnest.com/Songbird/PlaylistCommandsBuilder;1",
                  "sbIPlaylistCommandsBuilder");
  }

  // Download playlist command
  this.m_cmd_Download = new PlaylistCommandsBuilder("download-soundcloud-cmd");
  this.m_cmd_Download.appendAction(null,
                                   "soundcloud_cmd_download",
                                   this._strings.getString("command.soundcloud_download"),
                                   "&command.tooltip.download",
                                   plCmd_Download_TriggerCallback);
  this.m_cmd_Download.setCommandShortcut(null,
                                         "soundcloud_cmd_download",
                                         "&command.shortcut.key.download",
                                         "&command.shortcut.keycode.download",
                                         "&command.shortcut.modifiers.download",
                                         true);
  this.m_cmd_Download.setCommandEnabledCallback(null,
                                                "soundcloud_cmd_download",
                                                plCmd_IsSelectionDownloadable);
  this.m_mgr.publish("soundcloud-download@sb.com", this.m_cmd_Download);
  // Favorite playlist command
  this.m_cmd_Favorite = new PlaylistCommandsBuilder("favorite-soundcloud-cmd");
  this.m_cmd_Favorite.appendAction(null,
                                   "soundcloud_cmd_favorite",
                                   this._strings.getString("command.soundcloud_favorite"),
                                   this._strings.getString("command.tooltip.favorite"),
                                   plCmd_Favorite_TriggerCallback);
  this.m_cmd_Favorite.setCommandShortcut(null,
                                         "soundcloud_cmd_favorite",
                                         this._strings.getString("command.shortcut.key.favorite"),
                                         this._strings.getString("command.shortcut.keycode.favorite"),
                                         this._strings.getString("command.shortcut.modifiers.favorite"),
                                         true);
  this.m_cmd_Favorite.setCommandVisibleCallback(null,
                                                "soundcloud_cmd_favorite",
                                                plCmd_IsSelectionFavoriteable);
  this.m_mgr.publish("soundcloud-favorite@sb.com", this.m_cmd_Favorite);
  // Search playlist commands
  this.m_searchCommands = new PlaylistCommandsBuilder("search-soundcloud-cmds");
  this.m_searchCommands.appendSubmenu(null,
                                      "soundcloud_search_cmds",
                                      "Search For...",
                                      "Search Options");
  this.m_searchCommands.appendAction("soundcloud_search_cmds",
                                     "soundcloud_cmd_searchuser",
                                     this._strings.getString("command.soundcloud_searchuser"),
                                     this._strings.getString("command.tooltip.searchuser"),
                                     plCmd_SearchUser_TriggerCallback);
  this.m_searchCommands.setVisibleCallback(plCmd_HideForToolbarCheck);
  this.m_mgr.publish("soundcloud-search@sb.com", this.m_searchCommands);
  // SoundCloud playlist commands
  this.m_soundcloudCommands = new PlaylistCommandsBuilder("soundcloud_cmds");
  this.m_soundcloudCommands.appendPlaylistCommands(null,
                                                   "soundcloud_cmd_download",
                                                   this.m_cmd_Download);
  this.m_soundcloudCommands.appendPlaylistCommands(null,
                                                   "soundcloud_cmd_favorite",
                                                   this.m_cmd_Favorite);
  this.m_soundcloudCommands.appendPlaylistCommands(null,
                                                   "soundcloud_search_cmds",
                                                   this.m_searchCommands);
  this.m_soundcloudCommands.setVisibleCallback(plCmd_HideForToolbarCheck);
  this.m_mgr.publish("soundcloud-cmds@sb.com", this.m_soundcloudCommands);

  // Called when the download action is triggered
  function plCmd_Download_TriggerCallback(aContext,
                                          aSubMenuId,
                                          aCommandId,
                                          aHost) {
    // if something is selected, trigger the download event on the playlist
    if (plCmd_IsAnyTrackSelected(aContext, aSubMenuId, aCommandId, aHost)) {
      var ddh = Cc["@songbirdnest.com/Songbird/DownloadDeviceHelper;1"]
                  .getService(Ci.sbIDownloadDeviceHelper);
      var playlist = unwrap(aContext.playlist);
      var selectedEnum = playlist.mediaListView.selection.selectedMediaItems;
      var library = self._service.downloads;
      var downloadItems = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                            .getService(Ci.nsIMutableArray);
      var downloadList = library.createMediaList("simple");
      downloadList.setProperty(SBProperties.customType, "download");

      while (selectedEnum.hasMoreElements()) {
        var ios = Cc["@mozilla.org/network/io-service;1"]
                    .getService(Ci.nsIIOService);
        let curItem = selectedEnum.getNext()
                                  .QueryInterface(Ci.sbIMediaItem)
        if (curItem) {
          let downloadURL = curItem.getProperty(SB_PROPERTY_DOWNLOAD_URL);
          if (downloadURL && downloadURL != "") {
            let properties = {};
            properties[SBProperties.trackName] =
                curItem.getProperty(SBProperties.trackName);
            properties[SB_PROPERTY_WAVEFORM] =
                curItem.getProperty(SB_PROPERTY_WAVEFORM);
            properties[SBProperties.trackType] = "soundcloud";
            let propertyArray = SBProperties.createArray(properties);
            let item = library.createMediaItem(ios.newURI(downloadURL, null, null),
                                               propertyArray);
            downloadList.add(item);
            downloadItems.appendElement(item, false);
          }
        }
      }

      // XXX - Need to verify that this actually works
      var metadataService = Cc["@songbirdnest.com/Songbird/FileMetadataService;1"]
                              .getService(Ci.sbIFileMetadataService);
      metadataService.read(downloadItems);
      ddh.downloadAll(downloadList);
      library.remove(downloadList);
    }
  }

  function plCmd_IsSelectionDownloadable(aContext, aSubMenuId, aCommandId, aHost) {
    if (!plCmd_IsAnyTrackSelected(aContext, aSubMenuId, aCommandId, aHost))
      return false;

    var itemEnum = unwrap(aContext.playlist).mediaListView
                                            .selection
                                            .selectedMediaItems;
    try {
      while (itemEnum.hasMoreElements()) {
        let item = itemEnum.getNext().QueryInterface(Ci.sbIMediaItem);
        if (!item.getProperty(SB_PROPERTY_DOWNLOAD_URL))
          return false;
      }

      return true;
    } catch (ex) {
      Cu.reportError(ex);
      return false;
    }
  }

  function plCmd_Favorite_TriggerCallback(aContext, aSubMenuId, aCommandId, aHost) {
      var playlist = unwrap(aContext.playlist);
      var selectedEnum = playlist.mediaListView.selection.selectedMediaItems;

      var curItem = selectedEnum.getNext()
                                .QueryInterface(Ci.sbIMediaItem)
      if (curItem) {
        var trackId = curItem.getProperty(SB_PROPERTY_TRACK_ID);
        if (trackId)
          self._service.putFavorite(trackId);
      }
  }

  function plCmd_SearchUser_TriggerCallback(aContext, aSubMenuId, aCommandId, aHost) {
      var playlist = unwrap(aContext.playlist);
      var selectedEnum = playlist.mediaListView.selection.selectedMediaItems;

      var curItem = selectedEnum.getNext()
                                .QueryInterface(Ci.sbIMediaItem)
      if (curItem) {
        var params = "filter=streamable";
        var permalink = curItem.getProperty(SB_PROPERTY_USER_PERMALINK);
        self._service.getTracks(permalink, "", params, 0);

        // XXX - If not active node
        var sps = Cc["@songbirdnest.com/servicepane/service;1"]
                    .getService(Ci.sbIServicePaneService);
        var search = sps.getNode("SB:RadioStations:SoundCloud");
        gServicePane.activateAndLoadNode(search, null, null);

        Cu.reportError("Search triggered!");
      }
  }

  function plCmd_IsSelectionFavoriteable(aContext, aSubMenuId, aCommandId, aHost) {
    if (!self._service.loggedIn ||
        !plCmd_IsAnyTrackSelected(aContext, aSubMenuId, aCommandId, aHost))
      return false;

    var itemEnum = unwrap(aContext.playlist).mediaListView
                                            .selection
                                            .selectedMediaItems;
    try {
      let item = itemEnum.getNext().QueryInterface(Ci.sbIMediaItem);
      let trackId = item.getProperty(SB_PROPERTY_TRACK_ID);
      let faved = self._service
                      .favorites
                      .getItemsByProperty(SB_PROPERTY_TRACK_ID, trackId);
      if (faved.length > 0)
        return false;
    } catch (ex) {
      return true;
    }
  }

  // Returns true when at least one track is selected in the playlist
  function plCmd_IsAnyTrackSelected(aContext, aSubMenuId, aCommandId, aHost) {
    return (unwrap(aContext.playlist).mediaListView.selection.count != 0);
  }

  function plCmd_HideForToolbarCheck(aContext, aHost) {
    return (aHost !== "toolbar");
  }
}

SoundCloud.loadURI = function SoundCloud_loadURI(uri, event) {
  gBrowser.loadURI(uri, null, null, event, "_blank");
  this._panel.hidePopup();
}

SoundCloud._showPanel = function SoundCloud__showPanel() {
  this._panel.openPopup(this._statusIcon);
}

SoundCloud._handleUIEvents =
function SoundCloud__handlUIEvents(aEvent) {
  switch (aEvent.type) {
    case "login-button-clicked":
      this._service.login(this._username.value,
                          this._password.value,
                          false);
      break;
    case "cancel-button-clicked":
      this._service.cancelLogin();
      break;
    case "logout-button-clicked":
      this._service.logout();
      break;
    default:
      break;
  }
}

SoundCloud._toggleAutoLogin = function SoundCloud__toggleAutoLogin() {
  this._service.autoLogin = !this._service.autoLogin;
}

SoundCloud.setStatusIcon = function SoundCloud_setStatusIcon(aIcon) {
  this._statusIcon.setAttribute("src", aIcon);
}

SoundCloud.setStatusText = function SoundCloud_setStatusText(aText) {
  this._statusIcon.setAttribute("tooltip", aText);
}

SoundCloud.setStatusText = function SoundCloud_setStatusText(aId) {
  this._statusIcon.setStatusText(this._strings.getString(aId));
}

SoundCloud.setLoginError = function SoundCloud_setLoginError(aText) {
  if (aText) {
    this._loginError.textContent = aText;
    this._loginError.style.visibility = "visible";
  } else {
    this._loginError.textContent = "";
    this._loginError.style.visibility = "collapse";
  }
}

SoundCloud.curTrackListener =
function SoundCloud_curTrackListener(aEvent) {

}

SoundCloud.uninstallObserver = {

}

SoundCloud._getElement =
function SoundCloud__getElement(aWidget, aElementID) {
  return document.getAnonymousElementByAttribute(aWidget, "sbid", aElementID);
}

SoundCloud.onUnload = function SoundCloud_onUnload() {
  this._service.removeListener(this);
  this.m_mgr.withdraw("soundcloud-download@sb.com", this.m_cmd_Download);
  this.m_mgr.withdraw("soundcloud-favorite@sb.com", this.m_cmd_Favorite);
  this.m_mgr.withdraw("soundcloud-search@sb.com", this.m_searchCommands);
  this.m_mgr.withdraw("soundcloud-searchuser@sb.com", this.m_cmd_SearchUser);
  this.m_mgr.withdraw("soundcloud-cmds@sb.com", this.m_soundcloudCommands);

  if (this._domEventListenerSet) {
    this._domEventListenerSet.removeAll();
    this._domEventListenerSet = null;
  }
}

/* Helper functions */
function unwrap(obj) {
  if (obj && obj.wrappedJSObject)
    obj = obj.wrappedJSObject;
  return obj;
}

window.addEventListener("load",
                        function(e) { SoundCloud.onLoad(e); }, false);
window.addEventListener("unload",
                        function(e) { SoundCloud.onUnload(e); }, false);
