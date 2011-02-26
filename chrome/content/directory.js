/*
Copyright (c) 2011, Pioneers of the Inevitable, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice,
  this list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
  * Neither the name of Pioneers of the Inevitable, Songbird, nor the names
  of its contributors may be used to endorse or promote products derived
  from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource://app/jsmodules/DOMUtils.jsm");
Cu.import("resource://app/components/kPlaylistCommands.jsm");
Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/StringUtils.jsm");
Cu.import("resource://app/jsmodules/URLUtils.jsm");

const SOUNDCLOUD_FIRST_RUN = "extensions.soundcloud.firstrun";

if (typeof(songbirdMainWindow) == "undefined")
  var songbirdMainWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
                             .getService(Ci.nsIWindowMediator)
                             .getMostRecentWindow("Songbird:Main").window;

if (typeof(gBrowser) == "undefined")
  var gBrowser = songbirdMainWindow.gBrowser;

if (typeof(gServicePane) == "undefined")
  var gServicePane = songbirdMainWindow.gServicePane;

if (typeof CloudDirectory == "undefined") {
  var CloudDirectory = {};
}

CloudDirectory.onLoad = function CloudDirectory_onLoad() {
  var self = this;

  this._strings = Cc["@mozilla.org/intl/stringbundle;1"]
                    .getService(Ci.nsIStringBundleService)
                    .createBundle("chrome://soundcloud/locale/overlay.properties");

  this._service = Cc["@songbirdnest.com/soundcloud/service;1"]
                    .getService(Ci.sbISoundCloudService);

  this._domEventListenerSet = new DOMEventListenerSet();

  this._threadManager = Cc["@mozilla.org/thread-manager;1"]
                          .getService(Ci.nsIThreadManager);

  // Wire up UI events
  this._logo = document.getElementById("soundcloud-logo");
  var onLogoClicked = function() { gBrowser.loadOneTab("http://soundcloud.com"); };
  this._domEventListenerSet.add(this._logo,
                                "click",
                                onLogoClicked,
                                false,
                                false);

  this._searchBox = document.getElementById("soundcloud-search-textbox");
  this._searchBtn = document.getElementById("soundcloud-search-btn");

  this._searchBox.value = decodeURIComponent(this._service.lastSearch);
  if (this._searchBox.value.length > 0)
    this._searchBtn.disabled = false;

  var onSearchInput = function(aEvent) {
    self._searchBtn.disabled = aEvent.target.value.length == 0;
  };

  var onSearchKeydown = function(aEvent) {
    if (aEvent.keyCode == KeyEvent.DOM_VK_RETURN ||
        aEvent.keyCode == KeyEvent.DOM_VK_ENTER)
      self._searchBtn.click();
  };

  var onSearchCommand = function() { self.triggerSearch(); };

  this._domEventListenerSet.add(this._searchBox,
                                "input",
                                onSearchInput,
                                false,
                                false);
  this._domEventListenerSet.add(this._searchBox,
                                "keydown",
                                onSearchKeydown,
                                false,
                                false);
  this._domEventListenerSet.add(this._searchBtn,
                                "command",
                                onSearchCommand,
                                false,
                                false);

  this._directory = document.getElementById("soundcloud-directory");
  var search = document.getElementById("soundcloud-box");

  this._intro = document.getElementById("soundcloud-intro");
  this._idleLayer = document.getElementById("soundcloud-idle");
  this._idleDeck = document.getElementById("idle-deck");

  var firstrun = Application.prefs.getValue(SOUNDCLOUD_FIRST_RUN, false);

  // Setup library
  var uri = gBrowser.currentURI.spec;
  var params = {};
  URLUtils.extractQuery(uri, params);
  if (params.type) {
    this._page = params.type;
    switch(this._page) {
      case "dashboard":
        this._library = this._service.dashboard;
        search.hidden = true
        break;
      case "favorites":
        this._library = this._service.favorites;
        search.hidden = true;
        break;
      default:
        this._library = this._service.library;
    }
  } else {
    this._page = "main";
    this._library = this._service.library;
  }

  var node = gServicePane.activeNode;
  document.title = node.displayName;

  // Get playlist commands
  var mgr = Cc["@songbirdnest.com/Songbird/PlaylistCommandsManager;1"]
              .createInstance(Ci.sbIPlaylistCommandsManager);
  var cmds = mgr.request("soundcloud-cmds@sb.com");

  // Bind the playlist widget to our library
  this._directory.bind(this._library.createView(), cmds);

  var colSpec = SBProperties.trackName + " 300 " +
                SBProperties.duration + " 70 " +
                SB_PROPERTY_USER + " 150 " +
                SB_PROPERTY_PLAYS + " 60 " +
                SB_PROPERTY_FAVS + " 60 " +
                SB_PROPERTY_DOWNLOAD_IMAGE + " 60 " +
                SB_PROPERTY_CREATION_DATE + " 135 ";
  this._library.setProperty(SBProperties.columnSpec, colSpec);
  this._directory.clearColumns();
  this._directory.appendColumn(SBProperties.trackName, "300");
  this._directory.appendColumn(SBProperties.duration, "70");
  this._directory.appendColumn(SB_PROPERTY_USER, "150");
  this._directory.appendColumn(SB_PROPERTY_PLAYS, "60");
  this._directory.appendColumn(SB_PROPERTY_FAVS, "60");
  this._directory.appendColumn(SB_PROPERTY_DOWNLOAD_IMAGE, "60");
  this._directory.appendColumn(SB_PROPERTY_CREATION_DATE, "135");

  var itemCount = this._library.getItemCountByProperty(SBProperties.hidden,
                                                       "0");
  this.listener = {
    onLoginBegins: function listener_onLoginBegins() { },
    onLogout: function listener_onLogout() { },
    onAutoLoginChanged: function listener_onAutoLoginChanged() { },
    onLoggedInStateChanged: function listener_onLoggedInStateChanged() { },
    onProfileUpdated: function listener_onProfileUpdated() { },
    onSearchTriggered: function listener_onSearchTriggered() {
      self._searchBox.value = decodeURIComponent(self._service.lastSearch);
      self._directory.setAttribute("disabled", true);
      self._idleLayer.hidden = false;
      self._idleDeck.selectedIndex = 0;
      if (firstrun) {
        self._intro.hidden = true;
        Application.prefs.setValue(SOUNDCLOUD_FIRST_RUN, false);
      }
    },
    onSearchCompleted: function listener_onSearchCompleted(aLibrary) {
      if (!self._library || self._library != aLibrary)
        return;

      var count = self._library
                      .getItemCountByProperty(SBProperties.hidden,
                                              "0");

      if (count == 0) {
        self._idleDeck.selectedIndex = 1;
      }
    },
    onTracksAdded: function listener_onTracksAdded(aLibrary) {
      if (!self._library || self._library != aLibrary)
        return;

      var count = self._library
                      .getItemCountByProperty(SBProperties.hidden,
                                              "0");

      if (self._directory.getAttribute("disabled") && count > 0) {
        self._directory.removeAttribute("disabled");
        self._idleLayer.hidden = true;
      }

      var SB_NewDataRemote =
        Components.Constructor("@songbirdnest.com/Songbird/DataRemote;1",
                               "sbIDataRemote",
                               "init");
      var statusOverrideText =
        SB_NewDataRemote("faceplate.status.override.text");
      var statusOverrideType =
        SB_NewDataRemote("faceplate.status.override.type");
 
      statusOverrideText.stringValue = "";
      if (count == 1) {
        statusOverrideText.stringValue = count + " track";
      } else {
        statusOverrideText.stringValue = count + " tracks";
      }
      statusOverrideType.stringValue = "report" 
    },
    //onNowFollowing: function listener_onNowFollowing(aUser) { },
    QueryInterface: XPCOMUtils.generateQI([Ci.sbISoundCloudListener])
  }

  this._service.addListener(this.listener);

  if (itemCount == 0) {
    this._directory.setAttribute("disabled", true);
    if (firstrun) {
      this._intro.hidden = false;
    } else {
      this._idleLayer.hidden = false;
      this._idleDeck.selectedIndex = 1;
      this.listener.onTracksAdded(self._library);
    }
  } else {
    this.listener.onTracksAdded(self._library);
  }


  // Add listener for playlist "Download" clicks
  this._directory.addEventListener("PlaylistCellClick", function(e) {
    return self.onDownloadClick(e);
  }, false);
}

CloudDirectory.triggerSearch = function CloudDirectory_triggerSearch(aEvent) {
  var self = this;

  var params = "";
  var query = encodeURIComponent(this._searchBox.value);
  var flags = {
    "filter": "streamable",
    "order": "hotness"
  };

  for (var flag in flags) {
    params += flag + "=" + flags[flag] + "&";
  }

  this._service.getTracks(null, query, params, 0);
  this._service.notifyListeners("onSearchTriggered");
}

CloudDirectory.onDownloadClick = function CloudDirectory_onDownloadClick(aEvent) {
  var prop = aEvent.getData("property");
  var item = aEvent.getData("item");

  if (item.getProperty(prop) != "" && prop == SB_PROPERTY_DOWNLOAD_IMAGE) {
    var ddh = Cc["@songbirdnest.com/Songbird/DownloadDeviceHelper;1"]
                .getService(Ci.sbIDownloadDeviceHelper);
    var ios = Cc["@mozilla.org/network/io-service;1"]
                .getService(Ci.nsIIOService);
    var downloads = this._service.downloads;

    var url = item.getProperty(SB_PROPERTY_DOWNLOAD_URL);
    var properties = {};
    properties[SBProperties.trackName] =
        item.getProperty(SBProperties.trackName);
    properties[SBProperties.trackType] = "soundcloud";
    var propertyArray = SBProperties.createArray(properties);
    var downloadItem =
        downloads.createMediaItem(ios.newURI(url, null, null),
                                  propertyArray);
    downloadItem.setProperty(SB_PROPERTY_WAVEFORM,
                             item.getProperty(SB_PROPERTY_WAVEFORM));
    ddh.downloadItem(downloadItem);
  }
}

CloudDirectory.onUnload = function CloudDirectory_onUnload() {
  if (this._directory) {
    this._directory.destroy();
    this._directory = null;
  }

  if (this._service) {
    this._service.removeListener(this.listener);
  }

  if (this._domEventListenerSet) {
    this._domEventListenerSet.removeAll();
    this._domEventListenerSet = null;
  }
}
