/*
Copyright (c) 2010, Pioneers of the Inevitable, Inc.
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

Cu.import("resource://app/components/kPlaylistCommands.jsm");
Cu.import("resource://app/jsmodules/sbProperties.jsm");
Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");

if (typeof(mainWindow) == "undefined")
  var mainWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Ci.nsIWindowMediator)
                     .getMostRecentWindow("Songbird:Main").window;

if (typeof(gBrowser) == "undefined")
  var gBrowser = Cc["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Ci.nsIWindowMediator)
                   .getMostRecentWindow("Songbird:Main").window.gBrowser;

if (typeof(ioService) == "undefined")
  var ioService = Cc["@mozilla.org/network/io-service;1"]
                    .getService(Ci.nsIIOService);

if (typeof(gMetrics) == "undefined")
  var gMetrics = Cc["@songbirdnest.com/Songbird/Metrics;1"]
                   .createInstance(Ci.sbIMetrics);

const soundcloudTempLibGuid = "extensions.soundcloud.templib.guid";
const soundcloudLibraryGuid = "extensions.soundcloud.library.guid";
const soundcloudPlaylistInit = "extensions.soundcloud.library.plsinit";

var CloudDirectory = {
  radioLib: null,
  tracksFound: 0,

  init : function() {
    var servicePaneStrings = Cc["@mozilla.org/intl/stringbundle;1"]
        .getService(Ci.nsIStringBundleService)
        .createBundle("chrome://soundcloud/locale/overlay.properties");

    // Set the tab title
    document.title = servicePaneStrings.GetStringFromName("radioTabTitle");

    this._strings = document.getElementById("soundcloud-strings");

    // Setup SoundCloud references
    this._getLibraries();

    // Bind the playlist widget to our library
    this.playlist = document.getElementById("soundcloud-directory");
    var libraryManager = Cc['@songbirdnest.com/Songbird/library/Manager;1']
                           .getService(Ci.sbILibraryManager);
    this.playlist.bind(this.radioLib.createView());

    // If this is the first time we've loaded the playlist, clear the 
    // normal columns and use the soundcloud ones
    if (!Application.prefs.getValue(soundcloudPlaylistInit, false)) {
      Application.prefs.setValue(soundcloudPlaylistInit, true);
      var colSpec = SOCL_title + " 358 " + SOCL_time + " 71 " +
                    SOCL_user + " 150 " + SOCL_plays + " 45 " +
                    SOCL_favs + " 45 ";// + SOCL_url + " 290 ";
      this.radioLib.setProperty(SBProperties.columnSpec, colSpec);
      this.playlist.clearColumns();
      this.playlist.appendColumn(SOCL_title, "358");
      this.playlist.appendColumn(SOCL_time, "71");
      this.playlist.appendColumn(SOCL_user, "150");
      this.playlist.appendColumn(SOCL_plays, "45");
      this.playlist.appendColumn(SOCL_favs, "45");
      //this.playlist.appendColumn(SOCL_dl, "60");
      //this.playlist.appendColumn(SOCL_url, "290");  
    }

    var ldtv = this.playlist.tree.view.
      QueryInterface(Ci.sbILocalDatabaseTreeView);
                
    //ldtv.setSort(SOCL_, 0);

    /*
    this.playlist.addEventListener("PlaylistCellClick",
                                   onPlaylistCellClick, false);
    this.playlist.addEventListener("Play", onPlay, false);
    */
  },

  unload: function() {
    /*
    CloudDirectory.playlist.removeEventListener("PlaylistCellClick",
                                                onPlaylistCellClick, false);

    CloudDirectory.playlist.removeEventListener("Play", onPlay, false);
    */
  },

  _getLibraries : function CloudDirectory__getLibraries() {
    var libraryManager = Cc["@songbirdnest.com/Songbird/library/Manager;1"]
                           .getService(Ci.sbILibraryManager);
    var libGuid = Application.prefs.getValue(soundcloudLibraryGuid, "");
    
    if (libGuid != "") {
      // XXX should error check this
      this.radioLib = libraryManager.getLibrary(libGuid);
    } else {
      this.radioLib = createLibrary("soundcloud_library", null, false);
      this.radioLib.name = "SoundCloud";
      this.radioLib.setProperty(SBProperties.hidden, "1");
      dump("*** Created SoundCloud library, GUID: " + this.radioLib.guid);
      libraryManager.registerLibrary(this.radioLib, true);
      Application.prefs.setValue(soundcloudLibraryGuid, this.radioLib.guid);
    }

    libGuid = Application.prefs.getValue(soundcloudTempLibGuid, "");
    
    if (libGuid != "") {
      // XXX should error check this
      this.tempLib = libraryManager.getLibrary(libGuid);
    } else {
      this.tempLib = createLibrary("soundcloud_temp_library", null, false);
      // doesn't manifest itself in any user visible way, so i think
      // it's safe to not localise
      this.tempLib.name = "Temporary Library";
      this.tempLib.setProperty(SBProperties.hidden, "1");
      this.tempLib.setProperty(SBProperties.isReadOnly, "1");
      dump("*** Created SoundCloud Temporary Radio library, GUID: " + this.tempLib.guid);
      libraryManager.registerLibrary(this.tempLib, true);
      Application.prefs.setValue(soundcloudTempLibGuid,
                                 this.tempLib.guid);

    }
  },

  loadTable : function(trackList) {
    // Make the progress meter spin
    var el = mainWindow.document
                       .getElementById("sb-status-bar-status-progressmeter");
    el.mode = "undetermined";
 
    // if genre is null, then we're just being asked to filter our existing
    // data and we don't need to reload data
    if (trackList != null) {
      var trackArray = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                         .createInstance(Ci.nsIMutableArray);
      var propertiesArray = Cc["@songbirdnest.com/moz/xpcom/threadsafe-array;1"]
                              .createInstance(Ci.nsIMutableArray);

      for (var i=0; i<trackList.length; i++) {
        var title = trackList[i].title;
        var duration = trackList[i].duration * 1000;
        var username = trackList[i].user.username;
        var pcount = trackList[i].playback_count;
        var fcount = trackList[i].favoritings_count;
        var uri = trackList[i].uri;
        var streamURL = trackList[i].stream_url;
        var streamable = trackList[i].streamable;
        var downloadable = trackList[i].downloadable;

      if (!streamable) continue;

      var props =
          Cc["@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
            .createInstance(Ci.sbIMutablePropertyArray);

      props.appendProperty(SOCL_title, title);
      props.appendProperty(SOCL_time, duration);
      props.appendProperty(SOCL_user, username);
      props.appendProperty(SOCL_plays, pcount);
      props.appendProperty(SOCL_favs, fcount);
      /*
      if (downloadable) {
        var downloadURL = trackList[i].download_url;
        props.appendProperty("http://songbirdnest.com/data/1.0#downloadURL", downloadURL);
        props.appendProperty(SOCL_dl, "1|0|0");
        trackArray.appendElement(ioService.newURI(downloadURL, null, null),
                                 false);
       } else {
      */
      trackArray.appendElement(
        ioService.newURI(streamURL, null, null),
        false);
      //}

      propertiesArray.appendElement(props, false);
      /*
      trackArray.appendElement(
        ioService.newURI(soundcloudTrackURL, null, null),
        false);
      */
      }

      CloudDirectory.radioLib.batchCreateMediaItemsAsync(libListener,
                                                         trackArray, 
                                                         propertiesArray, false);
      /*
      var deck = document.getElementById("loading-deck");
      deck.selectedIndex = 1;
      */
    }
  },

  inputSearch : function(event) {
    var value = event.target.value; 
    document.getElementById("soundcloud-search-btn").disabled = value.length == 0;
  },

  getTracksFound : function() {
    return this.tracksFound;
  },

  setTracksFound : function(tracks) {
    this.tracksFound += tracks;
  },

  resetTracksFound : function() {
    this.tracksFound = 0;
  },

  triggerSearch : function(event) {
    if (event.keyCode == 13)
      document.getElementById('soundcloud-search-btn').click();
    }
}

function createLibrary(databaseGuid, databaseLocation, init) {
  if (typeof(init) == "undefined")
    init = true;

  var directory;
  
  if (databaseLocation) {
    directory = databaseLocation.QueryInterface(Ci.nsIFileURL).file;
  }
  else {
    directory = Cc["@mozilla.org/file/directory_service;1"]
                  .getService(Ci.nsIProperties)
                  .get("ProfD", Ci.nsIFile);
    directory.append("db");
  }    

  var file = directory.clone();
  file.append(databaseGuid + ".db");
  
  var libraryFactory =
      Cc["@songbirdnest.com/Songbird/Library/LocalDatabase/LibraryFactory;1"]
        .getService(Ci.sbILibraryFactory);
  var hashBag = Cc["@mozilla.org/hash-property-bag;1"]
                  .createInstance(Ci.nsIWritablePropertyBag2);
  hashBag.setPropertyAsInterface("databaseFile", file);
  var library = libraryFactory.createLibrary(hashBag);
  
  try {    
    if (init) {
      library.clear();
    }
  }
  catch(e) {
  }

  if (init) {
    loadData(databaseGuid, databaseLocation);
  }
  return library;
}

var libListener = {
  onProgress: function(i) {},
  onComplete: function(array, result) {
    // Reset the progress meter
    var el = mainWindow.document
                       .getElementById("sb-status-bar-status-progressmeter");
    el.mode = "";
    CloudDirectory.setTracksFound(array.length);

    SBDataSetStringValue("faceplate.status.text",
                         CloudDirectory.getTracksFound() + " " +
                         CloudDirectory._strings.getString("tracksFound"));
				
  }
}

function onPlay(e) {
    var item = CloudDirectory.playlist.mediaListView.selection.currentMediaItem;
    var id = item.getProperty(SOCL_url);
    
    var plsMgr = Cc["@songbirdnest.com/Songbird/PlaylistReaderManager;1"]
                   .getService(Ci.sbIPlaylistReaderManager);
    var listener = Cc["@songbirdnest.com/Songbird/PlaylistReaderListener;1"]
                     .createInstance(Ci.sbIPlaylistReaderListener);
    var ioService = Cc["@mozilla.org/network/io-service;1"]
                      .getService(Ci.nsIIOService);

    listener.playWhenLoaded = true;
    listener.observer = {
      observe: function(aSubject, aTopic, aData) {
        if (aTopic == "success") {
          var list = aSubject;
          var name = item.getProperty(SOCL_title);

          for (var i=0; i<list.length; i++) {
            var listItem = list.getItemByIndex(i);
            listItem.setProperty(SOCL_title, name);
            listItem.setProperty(SOCL_url, id);
            listItem.setProperty(SBProperties.outerGUID, item.guid);
          }
        } else {
          alert("Failed to load " + item.getProperty(SOCL_url) +
                "\n");
        }
      }
    }

    e.stopPropagation();
    e.preventDefault();
}
