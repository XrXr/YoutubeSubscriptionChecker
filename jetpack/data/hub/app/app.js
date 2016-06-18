/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
/* global angular */
/* jshint unused:strict */
angular.module("subscription_checker", ["ngAnimate", "ui.bootstrap"])
    .config(function ($httpProvider) {
        /*
        This Angular app does not, and should not send out any network
        reqeusts. However, XHRs are sent out to fetch Angular templates on
        disk. When responseType is the default (""), Firefox tries to parse the
        response as XML. This of course failes as HTML is not valid XML, and
        XML parsers are very strict. The parse failure manifests as error
        messages in Firefox's console.

        Turns out, these errors do not effect any funcionality of the app.
        However since errors are scary, the following will set the responseType
        as "text" for every XHR fired by the app, avoiding XML parsing and
        error messages being logged.
        */
        $httpProvider.interceptors.push(function() {
            return {
                request(config) {
                    config.responseType = "text";
                    return config;
                }
            };
        });
    })

    .run(function(ConfigUpdater, Bridge) {
        Bridge.on("config", function(event) {
            let config_and_filters = JSON.parse(event.detail);
            let new_config = config_and_filters.config;
            new_config.filters = config_and_filters.filters;
            ConfigUpdater.update_config(new_config);
        });
    })

    .run(function(Bridge, $uibModal) {
        Bridge.on("fail-state", function (event) {
            let error_name = event.detail;
            let modal_options = {
                templateUrl: `partials/error-screens/${error_name}.html`,
                backdrop: "static",
                keyboard: false
            };
            if (error_name === "open-db-error") {
                modal_options.controller = error_name;
            }
            $uibModal.open(modal_options);
        });
    })

    .directive("videoCanvas", function() {
        return {
            templateUrl: "partials/videos.html"
        };
    })

    .directive("selectIndex", function ($parse) {
        return {
            link(scope, elem, attrs) {
                const { assign } = $parse(attrs.selectIndex);
                scope.$watch(function() {
                    return elem[0].selectedIndex;
                }, function(newVal) {
                    assign(scope, newVal);
                });
            }
        };
    })

    .factory("Isotope", function(ConfigManager, $timeout) {
        let isotope;
        return Object.assign(wrap_in_timeout({
            layout() {
                if (isotope) {
                    isotope.destroy();
                }
                isotope = init_isotope(ConfigManager.config.animations);
                let container = document.querySelector(".video-container");
                for (let elem of container.children) {
                    elem.classList.add("shown");
                }
                isotope.revealItemElements(container.children);
            },
            filter(channel_id) {
                let filter = channel_id === "" ? "*"
                                               : elem => elem.dataset.channelId === channel_id;
                isotope.arrange({
                    filter
                });
            },
            remove_node(elem) {
                isotope.remove(elem);
                isotope.layout();
            },
            set_animation_enabled(enabled) {
                if (isotope) {
                    isotope.destroy();
                }
                isotope = init_isotope(enabled);
            }
        }), {
            get_instance() {
                return isotope;
            },
            // while Isotope is animating the removal of nodes, it could be
            // destroyed and reinitialized. The new instance shouldn't catch
            // the nodes for the removal animation
            clear_container_immediately(con=document.querySelector(".video-container")) {
                while (con.firstElementChild) {
                    con.removeChild(con.firstElementChild);
                }
            }
        });

        function wrap_in_timeout(obj) {
            for (let key in obj) {
                let original = obj[key];
                obj[key] = function () {
                    $timeout(original, 0, true, ...arguments);
                };
            }
            return obj;
        }

        function init_isotope(animate) {
            return new window.Isotope(".video-container", {
                itemSelector: ".video",
                transitionDuration: animate ? 400 : 0,
                masonry: {
                    gutter: 19,
                    isFitWidth: true
                }
            });
        }
    })

    /*
      Responsible for communication with the add-on. This factory guarantees
      that only one listener is register for any given event name at a time
    */
    .factory("Bridge", function($rootScope) {
        let registered = {};
        function on (name, listener) {
            function wrapper (event) {
                listener(event);
                $rootScope.$apply();
            }
            listen(name, wrapper);
        }

        function emit (name, data) {
            document.documentElement.
                dispatchEvent(new CustomEvent(name, {detail: data}));
        }

        function once (name, listener) {
            function wrapper (event) {
                listener(event);
                document.documentElement
                    .removeEventListener(name, wrapper, false);
                registered[name] = null;
                $rootScope.$apply();
            }
            listen(name, wrapper);
        }

        function removeListener (name) {
            document.documentElement.
                removeEventListener(name, registered[name], false);
            registered[name] = null;
        }

        function listen(name, listener) {
            document.documentElement.
                removeEventListener(name, registered[name], false);
            document.documentElement.addEventListener(name, listener, false);
            registered[name] = listener;
        }

        return {
            on,
            once,
            emit,
            removeListener,
        };
    })

    .service("VideoStorage", function() {
        let main = [];
        let history = [];
        let id_index = new Map();

        this.videos = Object.freeze([]);  // videos in this array are rendered
        this.history_mode = false;

        const current_storage_array = () => this.history_mode ? history : main;

        this.switch_to = target => {
            this.history_mode = target === "history";
            // take a snapshot, don't alias the storage array
            this.videos = Object.freeze(current_storage_array().concat());
        };

        this.update_duration = (id, duration) => {
            let video = id_index.get(id);
            if (video) {
                video.duration = duration;
            }
        };

        this.replace_videos = (new_main, new_history) => {
            main = new_main;
            history = new_history;

            id_index = new Map(new_main.concat(new_history)
                                       .map(e => [e.video_id, e]));
        };

        function add_history (video) {
            history.unshift(video);
            if (history.length > 50) {
                history.pop();
            }
        }

        this.remove_video = video => {
            let storage = current_storage_array();
            for (let i = storage.length - 1; i >= 0; i--) {
                if (storage[i].video_id === video.video_id) {
                    add_history(storage[i]);
                    storage.splice(i, 1);
                    return true;
                }
            }
            return false;
        };

        this.clear_history = () => history = [];

        this.remove_videos_by_channel = channel_id => {
            for (let i = main.length - 1; i >= 0; i--) {
                if (main[i].channel_id === channel_id) {
                    main.splice(i, 1);
                }
            }
        };

        this.toggle_history = () => {
            this.history_mode = !this.history_mode;
            let target = this.history_mode ? "history" : "main";
            this.switch_to(target);
        };

        this.video_count = () => current_storage_array().length;
    })

    .service("ConfigUpdater", function($animate, ConfigManager, Isotope) {
        this.update_config = function(new_config) {
            $animate.enabled(new_config.animations);
            let current_animations = ConfigManager.config.animations;
            ConfigManager.config = new_config;
            if (current_animations != new_config.animations) {
                Isotope.layout();
            }
        };

    })

    .service("ConfigManager", function() {
        this.config = {};

        this.remove_filter = name => {
            if (name === "") {
                return;
            }
            for (let i = this.config.filters.length - 1; i >= 0; i--) {
                if (this.config.filters[i].channel_title === name) {
                    this.config.filters.splice(i, 1);
                }
            }
        };

    })

    .service("ChannelList", function(VideoStorage) {
        this.channels = [];
        this.current_channel = "";
        let map = new Map();

        const get_channel_by_id = Map.prototype.get.bind(map);
        this.get_channel_by_id = get_channel_by_id;

        this.update_video_count = () => {
            for (let c of this.channels) {
                c.video_count = 0;
            }
            for (let v of VideoStorage.videos) {
                let channel = get_channel_by_id(v.channel_id);
                if (channel) {
                    channel.video_count++;
                }
            }
        };

        // merge the current list with another one
        this.update_channels = new_list => {
            for (let element of new_list) {
                let matching = get_channel_by_id(element.id);
                if (matching) {
                    matching.video_count = element.video_count;
                } else {
                    this.channels.push(element);
                    map.set(element.id, element);
                }
            }

            this.update_video_count();
        };

        this.decrease_video_count = channel_id => {
            this.channels.some(function (element) {
                if (element.id === channel_id) {
                    element.video_count = Math.max(element.video_count - 1, 0);
                    return true;
                }
                return false;
            });
        };

        this.remove_channel = channel => {
            this.channels.splice(this.channels.indexOf(channel), 1);
            map.delete(channel.id);
        };

        this.has_channel = Map.prototype.has.bind(map);
    })

    .controller("frame", function($scope, $uibModal, VideoStorage, Bridge,
                                  ChannelList, Isotope) {
        $scope.chnl = ChannelList;
        $scope.vs = VideoStorage;

        $scope.video_count = () => {
            let count = VideoStorage.video_count();
            return count ? count : "";
        };

        let setting_modal_opened = false;
        function set_close () {
            setting_modal_opened = false;
        }
        $scope.open_settings = function() {
            if (setting_modal_opened) {
                return;  // don"t open multiple
            }
            setting_modal_opened = true;
            $uibModal.open({
                templateUrl: "partials/settings.html",
                controller: "settings",
                backdrop: "static",
                keyboard: false
            }).result.then(set_close, set_close);
        };

        $scope.open_subscriptions = function() {
            $uibModal.open({
                templateUrl: "partials/subscriptions.html",
                controller: "subscriptions",
                windowClass: "subscription-modal-window"
            });
        };

        $scope.switch_channel = function(channel_id) {
            ChannelList.current_channel = channel_id;
            Isotope.filter(channel_id);
        };

        $scope.toggle_history = function() {
            Isotope.clear_container_immediately();
            VideoStorage.toggle_history();
            ChannelList.current_channel = "";
            ChannelList.update_video_count();
            Isotope.layout();
        };

        Bridge.on("open-settings", () => $scope.open_settings());
        let show_changelog, migration_failed;
        Bridge.on("open-changelog", () => show_changelog = true);
        Bridge.on("migration-failed", () => migration_failed = true);
        Bridge.on("subscribed-channels", event => {
            let channels = JSON.parse(event.detail);
            ChannelList.update_channels(channels);
            if (channels.length === 0) {
                $scope.open_subscriptions();
            }
            if (show_changelog) {
                $uibModal.open({templateUrl: "partials/changelog.html"});
            }
            if (migration_failed) {
                $uibModal.open({
                    templateUrl: "partials/error-screens/migration-failed.html"
                });
            }
        });
    })

    .controller("videos", function($scope, Isotope, VideoStorage, ChannelList,
                                   Bridge) {
        $scope.v = VideoStorage;
        // state to keep the no video message hidden until the first playload
        $scope.first_payload = false;

        $scope.channel_title = ({ channel_id }) => {
            let channel = ChannelList.get_channel_by_id(channel_id);
            return channel ? channel.title : "";
        };

        $scope.open_video = function(video, event) {
            event.preventDefault();
            event.stopPropagation();
            if (VideoStorage.history_mode) {
                return Bridge.emit("open-video", video.video_id);
            }
            if (VideoStorage.remove_video(video)) {
                let event_name = event.ctrlKey || event.metaKey ? "skip-video" : "remove-video";
                Bridge.emit(event_name, video.video_id);
                let video_div = event.target;
                // walk upwards to the root of the video node
                while (video_div && !video_div.classList.contains("video")) {
                    video_div = video_div.parentElement;
                }
                Isotope.remove_node(video_div);
                ChannelList.decrease_video_count(video.channel_id);
            }
        };

        function no_videos_at_all() {
            return VideoStorage.video_count() === 0;
        }

        $scope.no_videos_at_all = no_videos_at_all;

        $scope.no_channel_videos = () => {
            return ChannelList.current_channel !== "" && !no_videos_at_all() &&
                Isotope.get_instance().getFilteredItemElements().length === 0;
        };

        Bridge.on("videos", event => {
            let details = JSON.parse(event.detail);
            VideoStorage.replace_videos(...details);
            VideoStorage.switch_to("main");
            ChannelList.current_channel = "";
            ChannelList.update_video_count();
            Isotope.layout();
            $scope.first_payload = true;
        });

        Bridge.on("duration-update", event => {
            let detail = JSON.parse(event.detail);
            VideoStorage.update_duration(detail.id, detail.duration);
        });
    })

    .filter("escape", function () {
        return function (text) {
            let dummy = document.createElement("div");
            dummy.textContent = text;
            return dummy.innerHTML;
        };
    })

    .controller("settings", function ($scope, $uibModalInstance, $uibModal,
                                      ConfigManager, ConfigUpdater, Bridge,
                                      ChannelList, VideoStorage) {
        $scope.channels = ChannelList;
        $scope.config = angular.copy(ConfigManager.config);
        $scope.config.filters.forEach(e => e.inspect_tags = e.inspect_tags || false);
        $scope.tabs = {};
        $scope.tabs.general = {
            interval_class: "",
            less_than_5: false,
            bad_input: false,
            valid: true,
            validate(value) {
                $scope.tabs.general.interval_class = "";
                $scope.tabs.general.less_than_5 = false;
                $scope.tabs.general.bad_input = false;
                $scope.tabs.general.valid = true;
                if (isNumber(value)) {
                    if (Number(value) < 5) {
                        $scope.tabs.general.valid = false;
                        $scope.tabs.general.less_than_5 = true;
                        $scope.tabs.general.interval_class = "has-error";
                    }
                } else {
                    $scope.tabs.general.valid = false;
                    $scope.tabs.general.bad_input = true;
                    $scope.tabs.general.interval_class = "has-error";
                }
            },
            clear_history() {
                if (!window.confirm("Are you sure?")) {
                    return;
                }
                VideoStorage.clear_history();
                if (VideoStorage.history_mode) {
                    VideoStorage.videos = [];
                    ChannelList.update_video_count();
                }
                Bridge.emit("clear-history");
            },
            changelog: () => $uibModal.open({
                templateUrl: "partials/changelog.html"
            })
        };

        $scope.tabs.filter = {
            filter_active: false,
            dup_filter: false,
            filters_bad_channel_name: false,
            filters_bad_pattern: true,
            new_filter: (function () {
                let filter = {
                    channel_id: "",
                    channel_title: "",
                    video_title_pattern: "",
                    video_title_is_regex: false,
                    inspect_tags: false,
                    include_on_match: false,
                };
                let new_filter_channel;
                Object.defineProperty(filter, "channel", {
                    get() {
                        return new_filter_channel ? new_filter_channel.title
                                                  : filter.channel_title;
                    },
                    set(newVal) {
                        new_filter_channel = newVal;
                        filter.channel_title = newVal && newVal.title;
                        filter.channel_id = newVal && newVal.id;
                    }
                });
                return filter;
            })(),
            fill_input_form(filter) {
                filter.inspect_tags = filter.inspect_tags || false;
                let { new_filter } = $scope.tabs.filter;
                Object.assign(new_filter, filter);
                new_filter.channel = ChannelList.get_channel_by_id(filter.channel_id);
            },
            is_dup: filter => $scope.config.filters.some(e =>
                e.video_title_pattern === filter.video_title_pattern &&
                e.channel_title === filter.channel_title &&
                e.video_title_is_regex === filter.video_title_is_regex &&
                e.include_on_match === filter.include_on_match),
            add_filter(filter) {
                $scope.tabs.filter.dup_filter = false;
                filter = angular.copy(filter);
                filter.video_title_pattern = filter.video_title_pattern.trim();
                if ($scope.tabs.filter.is_dup(filter)) {
                    $scope.tabs.filter.dup_filter = true;
                    return;
                }
                $scope.config.filters.push(filter);
            },
            get_filter_class: filter => filter.include ? "bg-success" : "bg-danger",
            remove_filter(index) {
                if (index >= 0) {
                    $scope.config.filters.splice(index, 1);
                }
            },
            include_radio_getter_setter(val) {
                if (arguments.length === 0) {
                    return $scope.tabs.filter.new_filter.include_on_match ?
                        "include" : "exclude";
                }
                $scope.tabs.filter.new_filter.include_on_match = val === "include";
            }
        };

        $scope.tabs.import_export = {
            import_success: "",
            import_error: "",
            export_settings: () => Bridge.emit("export", null),
            import_settings(input) {
                $scope.tabs.import_export.import_error = false;
                $scope.tabs.import_export.import_success = false;
                Bridge.emit("import", input);
            }
        };

        $scope.tabs.logs = {
            dump_failed: false,
            clear_success: false,
            request_logs() {
                Bridge.emit("get-error-logs");
                Bridge.once("error-logs", ev => {
                    Bridge.removeListener("dump-logs-failed");
                    let a = document.createElement("a");
                    a.download = "logs.json";
                    a.href = URL.createObjectURL(new Blob([ev.detail], {
                        type: "application/json"
                    }));
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(a.href));
                });
                Bridge.once("dump-logs-failed", () => {
                    Bridge.removeListener("error-logs");
                    $scope.tabs.logs.dump_failed = true;
                });
            },
            clear_logs() {
                if (window.confirm("Are you sure?")) {
                    Bridge.emit("clear-logs");
                    $scope.tabs.logs.clear_success = true;
                }
            }
        };

        function isNumber (n) {  // found on stackoverflow
            return !isNaN(parseFloat(n)) && isFinite(n);
        }

        $scope.save = function () {
            $uibModalInstance.close();
            ConfigUpdater.update_config($scope.config);
            Bridge.emit("update-config", $scope.config);
        };

        $scope.cancel = function() {
            if (!angular.equals($scope.config, ConfigManager.config) &&
                !window.confirm("You have unsaved settings. Are you sure?")) {
                return;
            }
            $uibModalInstance.close();
        };

        Bridge.on("export-result", event =>
            $scope.tabs.import_export.config_output = event.detail);

        Bridge.on("import-error", () =>
            $scope.tabs.import_export.import_error = true);

        Bridge.on("import-success", () => {
            $scope.config = angular.copy(ConfigManager.config);  // new configs
            $scope.tabs.import_export.import_success = true;
        });
    })

    .controller("subscriptions", function ($scope, $uibModalInstance, Isotope,
                                           ChannelList, VideoStorage, Bridge,
                                           ConfigManager) {
        $scope.chnl = ChannelList;
        $scope.search = {
            term: "",
            result: [],
            in_progress: false,
            searched_once: false
        };
        $scope.duplicate = false;

        $scope.save = function () {
            $uibModalInstance.close();
        };

        $scope.cancel = function () {
            $uibModalInstance.dismiss("cancel");
        };

        $scope.add_channel = function(channel) {
            $scope.duplicate = false;
            Bridge.emit("add-channel", channel);

            Bridge.once("channel-added", () => {
                ChannelList.update_channels([channel]);
                Bridge.removeListener("channel-duplicate");
            });
            Bridge.once("channel-duplicate", () => {
                $scope.duplicate = true;
                Bridge.removeListener("channel-added");
            });
        };

        $scope.remove_channel = function(channel) {
            Bridge.emit("remove-channel", channel);
            ChannelList.remove_channel(channel);
            VideoStorage.remove_videos_by_channel(channel.id);
            ConfigManager.remove_filter(channel.title);

            if (VideoStorage.history_mode) {
                // removing a channel while in history mode should not touch
                // the videos
                return;
            }

            let container = document.querySelector(".video-container");

            if (ChannelList.current_channel === channel.id ||
                    ChannelList.channels.length === 0) {
                ChannelList.current_channel = "";
                Isotope.clear_container_immediately(container);
                return Isotope.layout();
            }

            let iso = Isotope.get_instance();
            for (let node of container.children) {
                if (node.dataset.channelId === channel.id) {
                    iso.remove(node);
                }
            }
            iso.layout();
        };

        function search_result_listener (event) {
            let result = JSON.parse(event.detail);
            if (result.length > 0 && result[0]) {
                $scope.search.result = result;
            }
            $scope.search.in_progress = false;
            $scope.$apply();
        }

        $scope.search_channel = function($event) {
            if($event.keyCode === 13) {
                $scope.search.in_progress = true;
                Bridge.emit("search-channel", $scope.search.term);
                Bridge.on("search-result", search_result_listener);
                $scope.search.result = [];
                $scope.search.searched_once = true;
                $scope.duplicate = false;
            }
        };
    })

    .controller("open-db-error", function ($scope, Bridge) {
        $scope.drop_db = () => {
            $scope.deleting = true;
            Bridge.emit("drop-db");
            Bridge.once("drop-db-success", () => {
                window.alert("Database deleted. Sorry about the inconvenience");
                window.location.reload();
            });
            Bridge.once("drop-db-error", () => {
                window.alert("Failed to delete the database. This is really bad. You should contact the developer");
            });
        };
    });
