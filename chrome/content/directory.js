if (typeof(Cc) == "undefined")
  var Cc = Components.classes;
if (typeof(Ci) == "undefined")
  var Ci = Components.interfaces;
if (typeof(Cu) == "undefined")
  var Cu = Components.utils;

Cu.import("resource://soundcloud/SCUtils.jsm");
//XXX Make a dummy Utils.jsm for the timebeing

if (typeof(songbirdMainWindow) == "undefined")
        var songbirdMainWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
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
const defaultSearchType = "track";

if (typeof(kPlaylistCommands) == "undefined") {
        Cu.import("resource://app/components/kPlaylistCommands.jsm");
        if (!kPlaylistCommands)
                throw new Error("Import of kPlaylistCommands module failed!");
}

if (typeof(SBProperties) == "undefined") {
        Cu.import("resource://app/jsmodules/sbProperties.jsm");
        if (!SBProperties)
                throw new Error("Import of sbProperties module failed");
}

if (typeof(LibraryUtils) == "undefined") {
        Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
        if (!LibraryUtils)
                throw new Error("Import of sbLibraryUtils module failed");
}

var CloudDirectory = {
        radioLib : null,
	tracksFound : 0,

        init : function() {
                var servicePaneStrings = Cc["@mozilla.org/intl/stringbundle;1"]
                        .getService(Ci.nsIStringBundleService)
                        .createBundle("chrome://soundcloud/locale/overlay.properties");
                        // Set the tab title
                document.title = servicePaneStrings.GetStringFromName("radioTabTitle");

                // the # of times the directory is loaded (corresponds to the # of
                // times the servicepane is clicked, though also works if the user
                // for some reason or another bookmarks it separately)
                gMetrics.metricsInc("soundcloud", "directory", "loaded");

                this._strings = document.getElementById("soundcloud-strings");

		var menulist = document.getElementById("soundcloud-search-menulist");
		var mlStrings = Cc["@mozilla.org/intl/stringbundle;1"]
		        .getService(Ci.nsIStringBundleService)
			.createBundle("chrome://soundcloud/locale/menu.properties");
		var menuitems = this.getMenuItems(mlStrings);

		//Build the menulist
		var found = false;
		for (i in menuitems) {
		        var thisitem = menuitems[i];
			var el = menulist.appendItem(thisitem.label, thisitem.value);
			if (defaultSearchType == thisitem.value) {
			        menulist.selectedItem = el;
				found = true;
			}
		}

		if (!found)
		        menulist.selectedIndex = 0;

                var strings = Cc["@mozilla.org/intl/stringbundle;1"]
                        .getService(Ci.nsIStringBundleService)
                        .createBundle("chrome://soundcloud/locale/genres.properties");

                // Setup SoundCloud references
                this.getLibraries();

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

                var ldtv = this.playlist.tree.view
                                .QueryInterface(Ci.sbILocalDatabaseTreeView);
                
		//ldtv.setSort(SOCL_, 0);

                //this.loadTable("http://api.soundcloud.com/tracks.json?q=Lee+Curtiss&order=hotness");

/*
                this.playlist.addEventListener("PlaylistCellClick",
                                onPlaylistCellClick, false);
				/*
                this.playlist.addEventListener("Play", onPlay, false);
*/

        },

        unload: function() {
	/*
                CloudDirectory.playlist.removeEventListener("PlaylistCellClick",
                                onPlaylistCellClick, false);
				/*
                CloudDirectory.playlist.removeEventListener("Play", onPlay, false);
*/
        },

        getLibraries : function() {
                var libraryManager = Cc["@songbirdnest.com/Songbird/library/Manager;1"]
                        .getService(Ci.sbILibraryManager);

                var libGuid = Application.prefs.getValue(soundcloudLibraryGuid, "");
                if (libGuid != "") {
                        // XXX should error check this
                        this.radioLib = libraryManager.getLibrary(libGuid);
                } else {
                        this.radioLib = createLibrary("soundcloud_library", null,
                                        false);
                        this.radioLib.name = "SoundCloud";
                        this.radioLib.setProperty(SBProperties.hidden, "1");
                        dump("*** Created SoundCloud library, GUID: " +
                                        this.radioLib.guid);
                        libraryManager.registerLibrary(this.radioLib, true);
                        Application.prefs.setValue(soundcloudLibraryGuid,
                                        this.radioLib.guid);
                }

                libGuid = Application.prefs.getValue(soundcloudTempLibGuid, "");
                if (libGuid != "") {
                        // XXX should error check this
                        this.tempLib = libraryManager.getLibrary(libGuid);

                } else {
                        this.tempLib = createLibrary("soundcloud_temp_library", null,
                                        false);
                        // doesn't manifest itself in any user visible way, so i think
                        // it's safe to not localise
                        this.tempLib.name = "Temporary Library";
                        this.tempLib.setProperty(SBProperties.hidden, "1");
                        this.tempLib.setProperty(SBProperties.isReadOnly, "1");
                        dump("*** Created SoundCloud Temporary Radio library, GUID: " +
                                        this.tempLib.guid);
                        libraryManager.registerLibrary(this.tempLib, true);
                        Application.prefs.setValue(soundcloudTempLibGuid,
                                        this.tempLib.guid);

                        // Set the Media View to be list only (not filter)
                        var mpManager = Cc["@songbirdnest.com/Songbird/MediaPageManager;1"]
                                        .getService(Ci.sbIMediaPageManager);
                        var pages = mpManager.getAvailablePages(this.favesList);
                        var listView = null;
                        while (pages.hasMoreElements()) {
                                var pageInfo = pages.getNext();
                                pageInfo.QueryInterface(Ci.sbIMediaPageInfo);
                                if (pageInfo.contentUrl ==
                                                "chrome://songbird/content/mediapages/playlistPage.xul")
                                        listView = pageInfo;
                        }
/*
                        if (listView)
                                mpManager.setPage(this.favesList, listView)
*/
                        // temporary playlist to hold the current stream to work around
                        // GStreamer inability to play .pls mediaItems
                        propExists = true;
                        try {
                                a = this.tempLib.getItemsByProperty(
                                                SBProperties.customType, "radio_tempStreamList");
                        } catch (e) {
                                propExists = false;
                        }
                        if (propExists && a.length > 0) {
                                this.streamList = a.queryElementAt(0, Ci.sbIMediaList);
                        } else {
                                this.streamList = this.tempLib.createMediaList("simple");
                                this.streamList.setProperty(SBProperties.hidden, "1");
                                this.streamList.setProperty(SBProperties.isReadOnly, "1");
                        }

                        // set custom types so we can easily find them later
/*
                        this.favesList.setProperty(SBProperties.customType,
                                        "radio_favouritesList");
                        this.streamList.setProperty(SBProperties.customType,
                                        "radio_tempStreamList");
*/
                }
        },

	getMenuItems : function(strings) {
	        var iter = strings.getSimpleEnumeration();
		var items = new Array();
		while (iter.hasMoreElements()) {
		        var itemProp = iter.getNext()
			        .QueryInterface(Ci.nsIPropertyElement);
		        var itemValue = itemProp.key;
			var itemLabel = itemProp.value;
			items.push({value:itemValue, label:itemLabel});
		}

		items.sort(function(a,b) {
		        return(a.label.toUpperCase() > b.label.toUpperCase());
		});

		return items;
	},

        loadTable : function(trackList) {
                // Make the progress meter spin
                var el = songbirdMainWindow.document
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

				if (!streamable)
				  continue;

                                var props = Cc[
                                "@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
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
				  trackArray.appendElement(
				                  ioService.newURI(downloadURL, null, null),
						  false);
				} else {
				*/
				  trackArray.appendElement(
				                  ioService.newURI(streamURL, null, null),
						  false);
//				}

                                propertiesArray.appendElement(props, false);
/*
                                trackArray.appendElement(
                                                ioService.newURI(soundcloudTrackURL, null, null),
                                                false);
*/
                        }

                        CloudDirectory.radioLib.batchCreateMediaItemsAsync(libListener,
                                trackArray, propertiesArray, false);

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
                directory = Cc["@mozilla.org/file/directory_service;1"].
                getService(Ci.nsIProperties).
                get("ProfD", Ci.nsIFile);
                directory.append("db");
        }    

        var file = directory.clone();
        file.append(databaseGuid + ".db");
        var libraryFactory =
                Cc["@songbirdnest.com/Songbird/Library/LocalDatabase/LibraryFactory;1"]
                .getService(Ci.sbILibraryFactory);
        var hashBag = Cc["@mozilla.org/hash-property-bag;1"].
                createInstance(Ci.nsIWritablePropertyBag2);
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
                var el = songbirdMainWindow.document
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
        //var plsURL = SoundCloud.getListenURL(id);
    var plsMgr = Cc["@songbirdnest.com/Songbird/PlaylistReaderManager;1"]
            .getService(Ci.sbIPlaylistReaderManager);
    var listener = Cc["@songbirdnest.com/Songbird/PlaylistReaderListener;1"]
            .createInstance(Ci.sbIPlaylistReaderListener);
    var ioService = Cc["@mozilla.org/network/io-service;1"]
            .getService(Ci.nsIIOService);

        // clear the current list of any existing streams, etc.
        CloudDirectory.streamList.clear();

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
                                alert("Failed to load " + item.getProperty(SC_streamName) +
                                                "\n");
                        }
                }
        }

        // # of times a station is played
        //gMetrics.metricsInc("shoutcast", "station", "total.played");

        // # of times this station (ID) is played
        //gMetrics.metricsInc("shoutcast", "station", "played." + id.toString());

        // # of times this genre is played
        //var genre = item.getProperty(SBProperties.genre);
        //gMetrics.metricsInc("shoutcast", "genre", "played." + genre);

        /*
	if (id == -1) {
                plsURL = item.getProperty(SBProperties.contentURL);
        }
    var uri = ioService.newURI(plsURL, null, null);
    plsMgr.loadPlaylist(uri, RadioDirectory.streamList, null, false, listener);
    */

    e.stopPropagation();
    e.preventDefault();
}

